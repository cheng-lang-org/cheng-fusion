import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  type BigIntStats,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runCurrentOfficialSevenStageAdmission,
  type CurrentOfficialSevenStageRunnerInput,
  type CurrentOfficialSevenStageRunnerReport,
} from "./cheng_current_official_seven_stage_runner.ts";
import {
  CHENG_CURRENT_OFFICIAL_DRIVER,
  CHENG_CURRENT_ROOT,
  validateOfficialCurrentBuildBinding,
  validateCurrentSourceSnapshot,
} from "./cheng_current_parser_receipt_ingress.ts";
import {
  CHENG_MEMORY_RELEASE_GATE_STATUS,
  CHENG_MEMORY_RELEASE_REQUIRED_CASES,
  verifyMemoryReleaseGate,
} from "./cheng_memory_release_gate.ts";
import { canonicalJson } from "./cheng_semantic_matrix_m9023.ts";
import {
  assertExactCurrentObjectKeys,
  parseUniqueCurrentJson,
} from "./current_schema_json.ts";
import {
  CHENG_CURRENT_SEMANTIC_INPUT_SPECS,
  currentGenerationExecutionRaw32,
  currentReleaseDomainCid,
  extractCurrentMemoryReleaseIdentity,
  parseCurrentCanonicalJson,
  parseCurrentGenerationEnvironment,
  validateCurrentDriverGenerationReceipt,
  validateCurrentSemanticSnapshotEvidence,
  type CurrentGenerationExecution,
  type CurrentMemoryReleaseIdentity,
  type CurrentSemanticSnapshotRawEvidence,
  type CurrentSemanticSnapshotValidation,
} from "./cheng_current_release_evidence_validator.ts";
import {
  validateCurrentPerformanceEvidence,
  validateCurrentTargetMatrix,
  type CurrentPerformanceValidation,
  type CurrentTargetMatrixValidation,
} from "./cheng_current_release_target_performance_validator.ts";
import {
  probeFreshChengFusionMcpRuntime,
  validateFreshChengFusionMcpRuntimeReceipt,
  type ChengFusionFreshMcpRuntimeReceipt,
} from "./cheng_fusion_fresh_mcp_probe.ts";
import {
  runFreshMcpTypeArenaExecution,
  validateFreshMcpTypeArenaExecutionReport,
  type FreshMcpTypeArenaExecutionReport,
} from "./cheng_fusion_fresh_mcp_type_arena_execution.ts";

export const CHENG_CURRENT_RELEASE_MANIFEST_SCHEMA =
  "cheng_current_release_manifest";
export const CHENG_CURRENT_RELEASE_AUDIT_SCHEMA =
  "cheng_current_release_green_audit";

const HASH = /^[0-9a-f]{64}$/;
const EMPTY_HASH = createHash("sha256").digest("hex");
const TARGETS = Object.freeze([
  Object.freeze({
    targetTriple: "aarch64-apple-darwin",
    architecture: "arm64",
  }),
  Object.freeze({
    targetTriple: "aarch64-unknown-linux-gnu",
    architecture: "aarch64",
  }),
  Object.freeze({
    targetTriple: "x86_64-unknown-linux-gnu",
    architecture: "x86_64",
  }),
] as const);
const BACKENDS = Object.freeze(["primary", "backend2"] as const);
const MANIFEST_KEYS = Object.freeze([
  "schema",
  "status",
  "driverRole",
  "parserIngressRaw32",
  "sourceBundleRaw32",
  "officialDriverRaw32",
  "executionRaw32",
  "sevenStageRootRaw32",
  "sourceSnapshotManifest",
  "parserHarnessManifest",
  "executionPolicy",
  "sevenStageManifest",
  "semanticSnapshotAudit",
  "semanticSnapshotBitmapReceipt",
  "semanticPublishedStdout",
  "semanticSourceClosure",
  "semanticPublishedObject",
  "semanticBinding",
  "semanticQueryProjection",
  "semanticOpenDocumentUniverse",
  "semanticSnapshotArtifact",
  "memoryReleaseManifest",
  "baselineDriver",
  "driverSource",
  "backend2Epoch",
  "generationEnvironment",
  "gen2Driver",
  "gen3Driver",
  "gen2Receipt",
  "gen3Receipt",
  "officialDriver",
  "targets",
  "performanceEvidence",
  "freshMcpRuntime",
  "freshMcpTypeArenaExecution",
  "tools",
  "releaseIdentityRaw32",
  "manifestRaw32",
] as const);
const ARTIFACT_ROLE_BASENAMES = Object.freeze({
  semanticSnapshotAudit: "semantic-snapshot-audit.json",
  semanticSnapshotBitmapReceipt: "semantic-snapshot-bitmap-receipt.json",
  semanticPublishedStdout: "published-candidate.stdout.txt",
  semanticSourceClosure: "published-source-closure.bin",
  semanticPublishedObject: "published-candidate.o",
  semanticBinding: "published-binding.bin",
  semanticQueryProjection: "published-query-projection.bin",
  semanticOpenDocumentUniverse: "published-open-document-universe.bin",
  semanticSnapshotArtifact: "published-snapshot.bin",
  memoryReleaseManifest: "memory-release-manifest.json",
  generationEnvironment: "generation-environment.json",
  gen2Driver: "GEN2",
  gen3Driver: "GEN3",
  gen2Receipt: "GEN2.generation-receipt.json",
  gen3Receipt: "GEN3.generation-receipt.json",
  performanceEvidence: "performance-evidence.json",
  freshMcpRuntime: "fresh-mcp-runtime-identity.json",
  freshMcpTypeArenaExecution: "fresh-mcp-type-arena-execution.json",
} as const);
const TARGET_ARTIFACT_SUFFIXES = Object.freeze({
  object: ".o",
  executable: ".exe",
  action: ".action.json",
  fragment: ".fragment.json",
  runStatus: ".run-status.bin",
  runStdout: ".run-stdout.bin",
  runStderr: ".run-stderr.bin",
  orcEvents: ".orc-events.json",
} as const);
const PUBLISHER_RECEIPT_KEYS = Object.freeze([
  "schema",
  "status",
  "release_status",
  "red_count",
  "driver_role",
  "release_marker",
  "producer_root_fshex",
  "artifact_manifest_path_fshex",
  "artifact_manifest_sha256",
  "artifact_manifest_device",
  "artifact_manifest_inode",
  "artifact_manifest_size",
  "artifact_manifest_mode",
  "artifact_manifest_mtime_ns",
  "artifact_manifest_ctime_ns",
  "artifact_count",
  "directory_count",
  "contract_sha256",
  "binding_sha256",
  "completion_index_sha256",
  "source_closure_sha256",
  "performance_source_sha256",
  "official_driver_sha256",
  "seven_stage_execution_raw32",
  "seven_stage_root_raw32",
  "seven_stage_report_sha256",
  "backend_epoch_sha256",
  "jobs_sha256",
  "action_ledger_sha256",
  "fragment_snapshot_sha256",
  "performance_raw_sha256",
  "performance_verdict_sha256",
  "performance_evidence_sha256",
  "receipt_payload_sha256",
] as const);
const TOOL_ROLES = Object.freeze([
  "parser_ingress",
  "seven_stage_runner",
  "execution_validator",
  "semantic_snapshot_audit",
  "memory_release_gate",
  "release_evidence_validator",
  "target_performance_validator",
  "mcp_runtime_identity",
  "fresh_mcp_probe",
  "fresh_mcp_runtime_cli",
  "fresh_mcp_type_arena_execution",
  "fresh_mcp_type_arena_cli",
  "release_publisher_validator",
  "release_auditor",
  "release_cli",
] as const);
const FUSION_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CURRENT_RELEASE_PUBLISHER_VALIDATOR = resolve(
  CHENG_CURRENT_ROOT,
  "tools/backend2_current_source_release_evidence",
);
const EXPECTED_TOOL_PATHS = Object.freeze(
  new Map([
    [
      "parser_ingress",
      resolve(FUSION_ROOT, "src/cheng_current_parser_receipt_ingress.ts"),
    ],
    [
      "seven_stage_runner",
      resolve(FUSION_ROOT, "src/cheng_current_official_seven_stage_runner.ts"),
    ],
    [
      "execution_validator",
      resolve(FUSION_ROOT, "src/cheng_execution_stage_receipt_validator.ts"),
    ],
    [
      "semantic_snapshot_audit",
      resolve(FUSION_ROOT, "src/cheng_semantic_snapshot_audit.ts"),
    ],
    [
      "memory_release_gate",
      resolve(FUSION_ROOT, "src/cheng_memory_release_gate.ts"),
    ],
    [
      "release_evidence_validator",
      resolve(FUSION_ROOT, "src/cheng_current_release_evidence_validator.ts"),
    ],
    [
      "target_performance_validator",
      resolve(
        FUSION_ROOT,
        "src/cheng_current_release_target_performance_validator.ts",
      ),
    ],
    [
      "mcp_runtime_identity",
      resolve(FUSION_ROOT, "src/cheng_fusion_mcp_runtime_identity.ts"),
    ],
    [
      "fresh_mcp_probe",
      resolve(FUSION_ROOT, "src/cheng_fusion_fresh_mcp_probe.ts"),
    ],
    [
      "fresh_mcp_runtime_cli",
      resolve(FUSION_ROOT, "tools/current_fresh_mcp_runtime_identity.ts"),
    ],
    [
      "fresh_mcp_type_arena_execution",
      resolve(
        FUSION_ROOT,
        "src/cheng_fusion_fresh_mcp_type_arena_execution.ts",
      ),
    ],
    [
      "fresh_mcp_type_arena_cli",
      resolve(
        FUSION_ROOT,
        "tools/current_fresh_mcp_type_arena_execution.ts",
      ),
    ],
    [
      "release_publisher_validator",
      CURRENT_RELEASE_PUBLISHER_VALIDATOR,
    ],
    [
      "release_auditor",
      resolve(FUSION_ROOT, "src/cheng_current_release_green_audit.ts"),
    ],
    [
      "release_cli",
      resolve(FUSION_ROOT, "tools/current_release_green_audit.ts"),
    ],
  ]),
);

interface ArtifactPin {
  readonly path: string;
  readonly byteLength: number;
  readonly bytesRaw32: string;
}

interface BackendEvidence {
  readonly backend: (typeof BACKENDS)[number];
  readonly object: ArtifactPin;
  readonly executable: ArtifactPin;
  readonly action: ArtifactPin;
  readonly fragment: ArtifactPin;
  readonly runStatus: ArtifactPin;
  readonly runStdout: ArtifactPin;
  readonly runStderr: ArtifactPin;
  readonly orcEvents: ArtifactPin;
}

interface TargetEvidence {
  readonly targetTriple: (typeof TARGETS)[number]["targetTriple"];
  readonly architecture: (typeof TARGETS)[number]["architecture"];
  readonly driverRaw32: string;
  readonly backends: readonly BackendEvidence[];
}

interface ToolEvidence {
  readonly role: (typeof TOOL_ROLES)[number];
  readonly artifact: ArtifactPin;
}

interface CurrentReleaseManifest {
  readonly schema: typeof CHENG_CURRENT_RELEASE_MANIFEST_SCHEMA;
  readonly status: "COMPLETE";
  readonly driverRole: "production";
  readonly parserIngressRaw32: string;
  readonly sourceBundleRaw32: string;
  readonly officialDriverRaw32: string;
  readonly executionRaw32: string;
  readonly sevenStageRootRaw32: string;
  readonly sourceSnapshotManifest: ArtifactPin;
  readonly parserHarnessManifest: ArtifactPin;
  readonly executionPolicy: ArtifactPin;
  readonly sevenStageManifest: ArtifactPin;
  readonly semanticSnapshotAudit: ArtifactPin;
  readonly semanticSnapshotBitmapReceipt: ArtifactPin;
  readonly semanticPublishedStdout: ArtifactPin;
  readonly semanticSourceClosure: ArtifactPin;
  readonly semanticPublishedObject: ArtifactPin;
  readonly semanticBinding: ArtifactPin;
  readonly semanticQueryProjection: ArtifactPin;
  readonly semanticOpenDocumentUniverse: ArtifactPin;
  readonly semanticSnapshotArtifact: ArtifactPin;
  readonly memoryReleaseManifest: ArtifactPin;
  readonly baselineDriver: ArtifactPin;
  readonly driverSource: ArtifactPin;
  readonly backend2Epoch: ArtifactPin;
  readonly generationEnvironment: ArtifactPin;
  readonly gen2Driver: ArtifactPin;
  readonly gen3Driver: ArtifactPin;
  readonly gen2Receipt: ArtifactPin;
  readonly gen3Receipt: ArtifactPin;
  readonly officialDriver: ArtifactPin;
  readonly targets: readonly TargetEvidence[];
  readonly performanceEvidence: ArtifactPin;
  readonly freshMcpRuntime: ArtifactPin;
  readonly freshMcpTypeArenaExecution: ArtifactPin;
  readonly tools: readonly ToolEvidence[];
  readonly releaseIdentityRaw32: string;
  readonly manifestRaw32: string;
}

interface StableFile {
  readonly path: string;
  readonly raw: Buffer;
  readonly raw32: string;
  readonly stat: BigIntStats;
}

export interface CurrentReleaseManifestAssemblyInput extends CurrentOfficialSevenStageRunnerInput {
  readonly publisherReceiptPath: string;
}

export interface CurrentReleaseManifestAssembly {
  readonly manifestJson: string;
  readonly releaseIdentityRaw32: string;
  readonly publisherReceiptRaw32: string;
  readonly publisherManifestRaw32: string;
  readonly publisherArtifactCount: number;
}

export interface CurrentReleasePublisherArtifact {
  readonly path: string;
  readonly byteLength: number;
  readonly bytesRaw32: string;
}

export interface CurrentReleasePublisherEnvelope {
  readonly producerRoot: string;
  readonly receiptRaw32: string;
  readonly manifestRaw32: string;
  readonly artifacts: readonly CurrentReleasePublisherArtifact[];
}

export interface CurrentReleaseGreenAuditInput extends CurrentOfficialSevenStageRunnerInput {
  readonly releaseManifestPath: string;
}

export interface CurrentReleaseGreenAuditReport {
  readonly schema: typeof CHENG_CURRENT_RELEASE_AUDIT_SCHEMA;
  readonly status: "GREEN" | "HARD_RED";
  readonly red_count: 0 | 1;
  readonly driver_role: "production";
  readonly verdict: "RELEASE_GREEN" | "RED";
  readonly reason: string;
  readonly parserIngressRaw32: string;
  readonly sourceBundleRaw32: string;
  readonly officialDriverRaw32: string;
  readonly executionRaw32: string;
  readonly sevenStageRootRaw32: string;
  readonly semanticSnapshotRaw32: string;
  readonly memoryReleaseRaw32: string;
  readonly genFixedPointRaw32: string;
  readonly targetMatrixRaw32: string;
  readonly performanceRaw32: string;
  readonly mcpRuntimeRaw32: string;
  readonly mcpExecutionRaw32: string;
  readonly releaseIdentityRaw32: string;
  readonly targetCount: number;
  readonly backendEvidenceCount: number;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function observedHash(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !HASH.test(value) ||
    value === "0".repeat(64) ||
    value === EMPTY_HASH
  ) {
    throw new Error(`${label}_raw32_invalid`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label}_positive_integer_required`);
  }
  return Number(value);
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
  return { path, raw, raw32: sha256(raw), stat: after };
}

function stablePublisherFile(pathRaw: string, label: string): StableFile {
  const path = resolve(pathRaw);
  const before = lstatSync(path, { bigint: true });
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.nlink !== 1n ||
    before.size < 0n ||
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
  return { path, raw, raw32: sha256(raw), stat: after };
}

function canonicalUintRaw(value: string | undefined, label: string): bigint {
  if (value === undefined || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label}_uint_invalid`);
  }
  return BigInt(value);
}

function canonicalOctalRaw(value: string | undefined, label: string): bigint {
  if (value === undefined || !/^(?:0|[1-7][0-7]*)$/.test(value)) {
    throw new Error(`${label}_octal_invalid`);
  }
  return BigInt(`0o${value}`);
}

function decodeFsHex(value: string | undefined, label: string): string {
  if (
    value === undefined ||
    value.length === 0 ||
    value.length % 2 !== 0 ||
    !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label}_fshex_invalid`);
  }
  const raw = Buffer.from(value, "hex");
  const path = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  if (Buffer.from(path, "utf8").toString("hex") !== value) {
    throw new Error(`${label}_fshex_noncanonical`);
  }
  return path;
}

function parseCurrentReleaseKv(
  file: StableFile,
  label: string,
  payloadKey: string,
): { readonly rows: ReadonlyMap<string, string> } {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(file.raw);
  if (
    !text.endsWith("\n") ||
    text.includes("\r") ||
    text.includes("\0") ||
    Buffer.from(text, "utf8").length !== file.raw.length
  ) {
    throw new Error(`${label}_encoding_invalid`);
  }
  const lines = text.slice(0, -1).split("\n");
  const rows = new Map<string, string>();
  for (const line of lines) {
    const separator = line.indexOf("=");
    const key = line.slice(0, separator);
    if (
      separator <= 0 ||
      !/^[a-z0-9_.-]+$/.test(key) ||
      rows.has(key)
    ) {
      throw new Error(`${label}_row_invalid`);
    }
    rows.set(key, line.slice(separator + 1));
  }
  if (
    lines.length === 0 ||
    !lines.at(-1)!.startsWith(`${payloadKey}=`) ||
    rows.get(payloadKey) !== sha256(`${lines.slice(0, -1).join("\n")}\n`)
  ) {
    throw new Error(`${label}_payload_invalid`);
  }
  return { rows };
}

function requireExactKvKeys(
  rows: ReadonlyMap<string, string>,
  expected: readonly string[],
  label: string,
): void {
  const actual = [...rows.keys()].sort();
  const exact = [...expected].sort();
  if (
    actual.length !== exact.length ||
    actual.some((key, index) => key !== exact[index])
  ) {
    throw new Error(`${label}_keys_invalid`);
  }
}

function requirePublisherRelativePath(
  root: string,
  encoded: string | undefined,
  label: string,
): { readonly relativePath: string; readonly path: string } {
  const relativePath = decodeFsHex(encoded, label);
  if (
    relativePath.startsWith("/") ||
    relativePath.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`${label}_relative_path_invalid`);
  }
  const path = resolve(root, ...relativePath.split("/"));
  if (
    relative(root, path) !== relativePath ||
    path === root ||
    !relative(root, path) ||
    relative(root, path).startsWith("..")
  ) {
    throw new Error(`${label}_path_escape`);
  }
  return { relativePath, path };
}

function publisherTreePaths(
  root: string,
): {
  readonly files: readonly string[];
  readonly directories: readonly string[];
} {
  const files: string[] = [];
  const directories: string[] = [];
  const visit = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) =>
        Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)),
    );
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const stat = lstatSync(path, { bigint: true });
      if (stat.isSymbolicLink()) {
        throw new Error(`current_release_publisher_tree_symlink:${path}`);
      }
      const relativePath = relative(root, path);
      if (entry.isDirectory() && stat.isDirectory()) {
        directories.push(relativePath);
        visit(path);
      } else if (entry.isFile() && stat.isFile() && stat.nlink === 1n) {
        if (
          relativePath !== "artifact-manifest.kv" &&
          relativePath !== "publisher-receipt.kv"
        ) {
          files.push(relativePath);
        }
      } else {
        throw new Error(`current_release_publisher_tree_member_invalid:${path}`);
      }
    }
  };
  visit(root);
  return {
    files: Object.freeze(files.sort()),
    directories: Object.freeze(directories.sort()),
  };
}

interface PublisherEnvelopeInternal {
  readonly envelope: CurrentReleasePublisherEnvelope;
  readonly receiptRows: ReadonlyMap<string, string>;
}

function inspectPublisherEnvelope(
  publisherReceiptPath: string,
): PublisherEnvelopeInternal {
  if (
    publisherReceiptPath !== resolve(publisherReceiptPath) ||
    basename(publisherReceiptPath) !== "publisher-receipt.kv"
  ) {
    throw new Error("current_release_publisher_receipt_path_invalid");
  }
  const receiptFile = stableFile(
    publisherReceiptPath,
    "current_release_publisher_receipt",
  );
  const receipt = parseCurrentReleaseKv(
    receiptFile,
    "current_release_publisher_receipt",
    "receipt_payload_sha256",
  );
  requireExactKvKeys(
    receipt.rows,
    PUBLISHER_RECEIPT_KEYS,
    "current_release_publisher_receipt",
  );
  for (const [key, expected] of [
    ["schema", "cheng.backend2.current_source_release_publisher_receipt"],
    ["status", "PASS"],
    ["release_status", "GREEN"],
    ["red_count", "0"],
    ["driver_role", "production"],
    ["release_marker", "RELEASE_GREEN"],
  ] as const) {
    if (receipt.rows.get(key) !== expected) {
      throw new Error(`current_release_publisher_receipt_header_invalid:${key}`);
    }
  }
  for (const key of PUBLISHER_RECEIPT_KEYS) {
    if (
      key.endsWith("_sha256") ||
      key.endsWith("_raw32")
    ) {
      observedHash(
        receipt.rows.get(key),
        `current_release_publisher_receipt_${key}`,
      );
    }
  }
  const producerRoot = decodeFsHex(
    receipt.rows.get("producer_root_fshex"),
    "current_release_publisher_root",
  );
  const rootStat = lstatSync(producerRoot, { bigint: true });
  if (
    producerRoot !== resolve(producerRoot) ||
    rootStat.isSymbolicLink() ||
    !rootStat.isDirectory() ||
    realpathSync.native(producerRoot) !== producerRoot ||
    publisherReceiptPath !== join(producerRoot, "publisher-receipt.kv")
  ) {
    throw new Error("current_release_publisher_root_invalid");
  }
  const manifestPath = decodeFsHex(
    receipt.rows.get("artifact_manifest_path_fshex"),
    "current_release_publisher_manifest_path",
  );
  if (manifestPath !== join(producerRoot, "artifact-manifest.kv")) {
    throw new Error("current_release_publisher_manifest_location_invalid");
  }
  const manifestFile = stableFile(
    manifestPath,
    "current_release_publisher_manifest",
  );
  if (
    manifestFile.raw32 !==
      observedHash(
        receipt.rows.get("artifact_manifest_sha256"),
        "current_release_publisher_manifest",
      ) ||
    manifestFile.stat.dev !==
      canonicalUintRaw(
        receipt.rows.get("artifact_manifest_device"),
        "current_release_publisher_manifest_device",
      ) ||
    manifestFile.stat.ino !==
      canonicalUintRaw(
        receipt.rows.get("artifact_manifest_inode"),
        "current_release_publisher_manifest_inode",
      ) ||
    manifestFile.stat.size !==
      canonicalUintRaw(
        receipt.rows.get("artifact_manifest_size"),
        "current_release_publisher_manifest_size",
      ) ||
    manifestFile.stat.mode !==
      canonicalOctalRaw(
        receipt.rows.get("artifact_manifest_mode"),
        "current_release_publisher_manifest_mode",
      ) ||
    manifestFile.stat.mtimeNs !==
      canonicalUintRaw(
        receipt.rows.get("artifact_manifest_mtime_ns"),
        "current_release_publisher_manifest_mtime",
      ) ||
    manifestFile.stat.ctimeNs !==
      canonicalUintRaw(
        receipt.rows.get("artifact_manifest_ctime_ns"),
        "current_release_publisher_manifest_ctime",
      )
  ) {
    throw new Error("current_release_publisher_manifest_identity_drift");
  }
  const manifest = parseCurrentReleaseKv(
    manifestFile,
    "current_release_publisher_manifest",
    "manifest_payload_sha256",
  );
  if (
    manifest.rows.get("schema") !==
      "cheng.backend2.current_source_release_artifact_manifest" ||
    manifest.rows.get("status") !== "PASS" ||
    manifest.rows.get("driver_role") !== "production" ||
    decodeFsHex(
      manifest.rows.get("producer_root_fshex"),
      "current_release_publisher_manifest_root",
    ) !== producerRoot
  ) {
    throw new Error("current_release_publisher_manifest_header_invalid");
  }
  const directoryCount = Number(
    canonicalUintRaw(
      manifest.rows.get("directory_count"),
      "current_release_publisher_directory_count",
    ),
  );
  const artifactCount = Number(
    canonicalUintRaw(
      manifest.rows.get("artifact_count"),
      "current_release_publisher_artifact_count",
    ),
  );
  if (
    !Number.isSafeInteger(directoryCount) ||
    !Number.isSafeInteger(artifactCount) ||
    artifactCount <= 0 ||
    receipt.rows.get("directory_count") !== String(directoryCount) ||
    receipt.rows.get("artifact_count") !== String(artifactCount)
  ) {
    throw new Error("current_release_publisher_counts_invalid");
  }
  const manifestKeys = [
    "schema",
    "status",
    "driver_role",
    "producer_root_fshex",
    "directory_count",
    "artifact_count",
    "manifest_payload_sha256",
  ];
  for (let index = 0; index < directoryCount; index += 1) {
    for (const field of [
      "path_fshex",
      "device",
      "inode",
      "mode",
      "nlink",
      "mtime_ns",
      "ctime_ns",
    ]) {
      manifestKeys.push(`directory.${index}.${field}`);
    }
  }
  for (let index = 0; index < artifactCount; index += 1) {
    for (const field of [
      "path_fshex",
      "sha256",
      "device",
      "inode",
      "size",
      "mode",
      "mtime_ns",
      "ctime_ns",
    ]) {
      manifestKeys.push(`artifact.${index}.${field}`);
    }
  }
  requireExactKvKeys(
    manifest.rows,
    manifestKeys,
    "current_release_publisher_manifest",
  );
  const directories: string[] = [];
  for (let index = 0; index < directoryCount; index += 1) {
    const prefix = `directory.${index}.`;
    const row = requirePublisherRelativePath(
      producerRoot,
      manifest.rows.get(`${prefix}path_fshex`),
      `current_release_publisher_directory_${index}`,
    );
    if (
      index > 0 &&
      Buffer.compare(
        Buffer.from(directories[index - 1]!),
        Buffer.from(row.relativePath),
      ) >= 0
    ) {
      throw new Error("current_release_publisher_directory_order_invalid");
    }
    const stat = lstatSync(row.path, { bigint: true });
    if (
      stat.isSymbolicLink() ||
      !stat.isDirectory() ||
      realpathSync.native(row.path) !== row.path ||
      stat.dev !==
        canonicalUintRaw(
          manifest.rows.get(`${prefix}device`),
          `current_release_publisher_directory_${index}_device`,
        ) ||
      stat.ino !==
        canonicalUintRaw(
          manifest.rows.get(`${prefix}inode`),
          `current_release_publisher_directory_${index}_inode`,
        ) ||
      stat.mode !==
        canonicalOctalRaw(
          manifest.rows.get(`${prefix}mode`),
          `current_release_publisher_directory_${index}_mode`,
        ) ||
      stat.nlink !==
        canonicalUintRaw(
          manifest.rows.get(`${prefix}nlink`),
          `current_release_publisher_directory_${index}_nlink`,
        ) ||
      stat.mtimeNs !==
        canonicalUintRaw(
          manifest.rows.get(`${prefix}mtime_ns`),
          `current_release_publisher_directory_${index}_mtime`,
        ) ||
      stat.ctimeNs !==
        canonicalUintRaw(
          manifest.rows.get(`${prefix}ctime_ns`),
          `current_release_publisher_directory_${index}_ctime`,
        )
    ) {
      throw new Error(
        `current_release_publisher_directory_${index}_identity_drift`,
      );
    }
    directories.push(row.relativePath);
  }
  const artifacts: CurrentReleasePublisherArtifact[] = [];
  const artifactRelativePaths: string[] = [];
  const inodes = new Set<string>();
  for (let index = 0; index < artifactCount; index += 1) {
    const prefix = `artifact.${index}.`;
    const row = requirePublisherRelativePath(
      producerRoot,
      manifest.rows.get(`${prefix}path_fshex`),
      `current_release_publisher_artifact_${index}`,
    );
    if (
      index > 0 &&
      Buffer.compare(
        Buffer.from(artifactRelativePaths[index - 1]!),
        Buffer.from(row.relativePath),
      ) >= 0
    ) {
      throw new Error("current_release_publisher_artifact_order_invalid");
    }
    const file = stablePublisherFile(
      row.path,
      `current_release_publisher_artifact_${index}`,
    );
    const inode = `${file.stat.dev}:${file.stat.ino}`;
    if (inodes.has(inode)) {
      throw new Error("current_release_publisher_artifact_inode_alias");
    }
    inodes.add(inode);
    if (
      file.raw32 !==
        observedHash(
          manifest.rows.get(`${prefix}sha256`),
          `current_release_publisher_artifact_${index}`,
        ) ||
      file.stat.dev !==
        canonicalUintRaw(
          manifest.rows.get(`${prefix}device`),
          `current_release_publisher_artifact_${index}_device`,
        ) ||
      file.stat.ino !==
        canonicalUintRaw(
          manifest.rows.get(`${prefix}inode`),
          `current_release_publisher_artifact_${index}_inode`,
        ) ||
      file.stat.size !==
        canonicalUintRaw(
          manifest.rows.get(`${prefix}size`),
          `current_release_publisher_artifact_${index}_size`,
        ) ||
      file.stat.mode !==
        canonicalOctalRaw(
          manifest.rows.get(`${prefix}mode`),
          `current_release_publisher_artifact_${index}_mode`,
        ) ||
      file.stat.mtimeNs !==
        canonicalUintRaw(
          manifest.rows.get(`${prefix}mtime_ns`),
          `current_release_publisher_artifact_${index}_mtime`,
        ) ||
      file.stat.ctimeNs !==
        canonicalUintRaw(
          manifest.rows.get(`${prefix}ctime_ns`),
          `current_release_publisher_artifact_${index}_ctime`,
        )
    ) {
      throw new Error(
        `current_release_publisher_artifact_${index}_identity_drift`,
      );
    }
    artifactRelativePaths.push(row.relativePath);
    artifacts.push({
      path: file.path,
      byteLength: file.raw.length,
      bytesRaw32: file.raw32,
    });
  }
  const tree = publisherTreePaths(producerRoot);
  if (
    canonicalJson(tree.files) !==
      canonicalJson([...artifactRelativePaths].sort()) ||
    canonicalJson(tree.directories) !==
      canonicalJson([...directories].sort())
  ) {
    throw new Error("current_release_publisher_tree_manifest_drift");
  }
  const byRelativePath = new Map(
    artifactRelativePaths.map((path, index) => [path, artifacts[index]!] as const),
  );
  for (const [relativePath, receiptKey] of [
    ["contract.kv", "contract_sha256"],
    ["binding.kv", "binding_sha256"],
    ["completion-index.kv", "completion_index_sha256"],
  ] as const) {
    if (
      byRelativePath.get(relativePath)?.bytesRaw32 !==
      receipt.rows.get(receiptKey)
    ) {
      throw new Error(
        `current_release_publisher_receipt_artifact_drift:${relativePath}`,
      );
    }
  }
  return {
    envelope: Object.freeze({
      producerRoot,
      receiptRaw32: receiptFile.raw32,
      manifestRaw32: manifestFile.raw32,
      artifacts: Object.freeze(artifacts),
    }),
    receiptRows: receipt.rows,
  };
}

export function inspectCurrentReleasePublisherEnvelope(
  publisherReceiptPath: string,
): CurrentReleasePublisherEnvelope {
  return inspectPublisherEnvelope(publisherReceiptPath).envelope;
}

function sameFile(left: StableFile, right: StableFile): boolean {
  return (
    left.path === right.path &&
    left.raw32 === right.raw32 &&
    sameStat(left.stat, right.stat) &&
    left.raw.equals(right.raw)
  );
}

function parsePin(value: unknown, label: string): ArtifactPin {
  assertExactCurrentObjectKeys(
    value,
    ["path", "byteLength", "bytesRaw32"],
    label,
  );
  const pin = value as Record<string, unknown>;
  if (typeof pin.path !== "string" || pin.path !== resolve(pin.path)) {
    throw new Error(`${label}_path_invalid`);
  }
  return {
    path: pin.path,
    byteLength: positiveInteger(pin.byteLength, `${label}_byte_length`),
    bytesRaw32: observedHash(pin.bytesRaw32, `${label}_bytes`),
  };
}

function readPin(pin: ArtifactPin, label: string): StableFile {
  const actual = stableFile(pin.path, label);
  if (actual.raw.length !== pin.byteLength || actual.raw32 !== pin.bytesRaw32) {
    throw new Error(`${label}_pin_drift`);
  }
  return actual;
}

function canonicalJsonFile(
  pin: ArtifactPin,
  label: string,
): { file: StableFile; value: unknown } {
  const file = readPin(pin, label);
  const text = file.raw.toString("utf8");
  if (
    !text.endsWith("\n") ||
    Buffer.from(text, "utf8").length !== file.raw.length
  ) {
    throw new Error(`${label}_utf8_line_invalid`);
  }
  const value = parseUniqueCurrentJson(text, label);
  if (`${canonicalJson(value)}\n` !== text) {
    throw new Error(`${label}_canonical_json_invalid`);
  }
  return { file, value };
}

export function pinCurrentExecutionPolicyClosure(
  policyValue: unknown,
): ExecutionPolicyClosureValidation {
  assertExactCurrentObjectKeys(
    policyValue,
    [
      "schema",
      "evidenceRoot",
      "receipt",
      "caseId",
      "targetTriple",
      "identityInputs",
      "parserReceiptRaw32",
      "parserSemanticRaw32",
      "stages",
    ],
    "current_release_execution_policy",
  );
  const policy = policyValue as Record<string, unknown>;
  if (
    policy.schema !== "cheng_fusion.execution_stage_receipt_policy" ||
    typeof policy.evidenceRoot !== "string"
  ) {
    throw new Error("current_release_execution_policy_header_invalid");
  }
  const root = resolve(policy.evidenceRoot);
  const rootStat = lstatSync(root, { bigint: true });
  if (
    policy.evidenceRoot !== root ||
    rootStat.isSymbolicLink() ||
    !rootStat.isDirectory() ||
    realpathSync.native(root) !== root
  ) {
    throw new Error("current_release_execution_policy_root_invalid");
  }
  const files: StableFile[] = [];
  const parts: string[] = [];
  const pin = (value: unknown, label: string): void => {
    assertExactCurrentObjectKeys(value, ["path", "bytesRaw32"], label);
    const row = value as Record<string, unknown>;
    if (
      typeof row.path !== "string" ||
      row.path.length === 0 ||
      row.path.startsWith("/") ||
      row.path.split("/").some((part) => !part || part === "." || part === "..")
    ) {
      throw new Error(`${label}_path_invalid`);
    }
    const path = resolve(root, ...row.path.split("/"));
    const fromRoot = relative(root, path);
    if (
      fromRoot.length === 0 ||
      fromRoot.startsWith("..") ||
      resolve(root, fromRoot) !== path
    ) {
      throw new Error(`${label}_path_escape`);
    }
    const expectedRaw32 = observedHash(row.bytesRaw32, `${label}_bytes`);
    const file = stableFile(path, label);
    if (file.raw32 !== expectedRaw32) {
      throw new Error(`${label}_pin_drift`);
    }
    files.push(file);
    parts.push(row.path, file.raw32);
  };
  pin(policy.receipt, "current_release_policy_receipt");
  assertExactCurrentObjectKeys(
    policy.identityInputs,
    [
      "sourceBundle",
      "materializerBytes",
      "grammarObligation",
      "compilerSourceClosure",
      "driverBytes",
      "toolchainManifest",
      "commandManifest",
    ],
    "current_release_policy_identity_inputs",
  );
  const identities = policy.identityInputs as Record<string, unknown>;
  for (const key of [
    "sourceBundle",
    "materializerBytes",
    "grammarObligation",
    "compilerSourceClosure",
    "driverBytes",
    "toolchainManifest",
    "commandManifest",
  ] as const) {
    pin(identities[key], `current_release_policy_identity_${key}`);
  }
  if (!Array.isArray(policy.stages) || policy.stages.length !== 7) {
    throw new Error("current_release_execution_policy_stage_count_invalid");
  }
  for (let index = 0; index < policy.stages.length; index += 1) {
    const stage = policy.stages[index];
    assertExactCurrentObjectKeys(
      stage,
      [
        "stageKind",
        "producerSource",
        "sidecarPath",
        "sidecarBytesRaw32",
        "artifactPath",
        "artifactBytesRaw32",
      ],
      `current_release_policy_stage_${index}`,
    );
    const row = stage as Record<string, unknown>;
    pin(row.producerSource, `current_release_policy_stage_${index}_producer`);
    pin(
      { path: row.sidecarPath, bytesRaw32: row.sidecarBytesRaw32 },
      `current_release_policy_stage_${index}_sidecar`,
    );
    pin(
      { path: row.artifactPath, bytesRaw32: row.artifactBytesRaw32 },
      `current_release_policy_stage_${index}_artifact`,
    );
  }
  const uniqueFiles = [
    ...new Map(files.map((file) => [file.path, file] as const)).values(),
  ];
  return Object.freeze({
    raw32: currentReleaseDomainCid(
      "cheng.compiler.current_execution_policy_closure",
      parts,
    ),
    files: Object.freeze(uniqueFiles),
  });
}

export function pinCurrentParserHarnessClosure(
  manifestValue: unknown,
): HarnessClosureValidation {
  assertExactCurrentObjectKeys(
    manifestValue,
    [
      "schema",
      "status",
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
    ],
    "current_release_parser_harness",
  );
  const manifest = manifestValue as Record<string, unknown>;
  if (
    manifest.schema !== "cheng_parser_production_receipt_harness" ||
    manifest.status !== "accepted"
  ) {
    throw new Error("current_release_parser_harness_header_invalid");
  }
  const files: StableFile[] = [];
  const parts: string[] = [];
  const pin = (
    pathValue: unknown,
    raw32Value: unknown,
    label: string,
    byteLength?: unknown,
    inode?: unknown,
  ): void => {
    if (typeof pathValue !== "string" || pathValue !== resolve(pathValue)) {
      throw new Error(`${label}_path_invalid`);
    }
    const raw32 = observedHash(raw32Value, `${label}_bytes`);
    const file = stableFile(pathValue, label);
    if (
      file.raw32 !== raw32 ||
      (byteLength !== undefined &&
        (!Number.isSafeInteger(byteLength) ||
          Number(byteLength) !== file.raw.length)) ||
      (inode !== undefined &&
        (typeof inode !== "string" || inode !== file.stat.ino.toString()))
    ) {
      throw new Error(`${label}_pin_drift`);
    }
    files.push(file);
    parts.push(label, file.path, file.raw32);
  };
  const pinObject = (
    value: unknown,
    keys: readonly string[],
    label: string,
  ): Record<string, unknown> => {
    assertExactCurrentObjectKeys(value, keys, label);
    return value as Record<string, unknown>;
  };
  for (const key of [
    "formalSpec",
    "parser",
    "receiptProducer",
    "driverEntry",
    "bootstrap",
    "harness",
  ] as const) {
    const row = pinObject(
      manifest[key],
      ["path", "sha256"],
      `current_release_harness_${key}`,
    );
    pin(row.path, row.sha256, `current_release_harness_${key}`);
  }
  const pinClosure = (value: unknown, root: string, label: string): void => {
    const closure = pinObject(value, ["fileCount", "sha256", "rows"], label);
    if (
      !Array.isArray(closure.rows) ||
      !Number.isSafeInteger(closure.fileCount) ||
      Number(closure.fileCount) !== closure.rows.length ||
      closure.rows.length <= 0
    ) {
      throw new Error(`${label}_count_invalid`);
    }
    const publicRows: {
      path: string;
      byteLength: number;
      sha256: string;
    }[] = [];
    for (let index = 0; index < closure.rows.length; index += 1) {
      const row = pinObject(
        closure.rows[index],
        ["path", "byteLength", "sha256"],
        `${label}_${index}`,
      );
      if (
        typeof row.path !== "string" ||
        row.path.length === 0 ||
        row.path.startsWith("/") ||
        row.path
          .split("/")
          .some((part) => !part || part === "." || part === "..")
      ) {
        throw new Error(`${label}_${index}_path_invalid`);
      }
      const path = resolve(root, ...row.path.split("/"));
      if (relative(root, path).startsWith("..")) {
        throw new Error(`${label}_${index}_path_escape`);
      }
      pin(path, row.sha256, `${label}_${index}`, row.byteLength);
      publicRows.push({
        path: row.path,
        byteLength: Number(row.byteLength),
        sha256: String(row.sha256),
      });
    }
    if (
      observedHash(closure.sha256, `${label}_root`) !==
      sha256(canonicalJson(publicRows))
    ) {
      throw new Error(`${label}_root_drift`);
    }
  };
  pinClosure(
    manifest.dependencyClosure,
    CHENG_CURRENT_ROOT,
    "current_release_harness_cheng_closure",
  );
  pinClosure(
    manifest.toolClosure,
    FUSION_ROOT,
    "current_release_harness_tool_closure",
  );
  const buildCompiler = pinObject(
    manifest.buildCompiler,
    ["command", "executablePath", "executableSha256", "versionSha256"],
    "current_release_harness_build_compiler",
  );
  pin(
    buildCompiler.executablePath,
    buildCompiler.executableSha256,
    "current_release_harness_build_compiler",
  );
  observedHash(
    buildCompiler.versionSha256,
    "current_release_harness_build_compiler_version",
  );
  const runtime = pinObject(
    manifest.runtime,
    ["executablePath", "executableSha256", "version"],
    "current_release_harness_runtime",
  );
  pin(
    runtime.executablePath,
    runtime.executableSha256,
    "current_release_harness_runtime",
  );
  for (const [collection, keys] of [
    ["drivers", ["role", "path", "sha256", "inode", "byteLength"]],
    ["sources", ["path", "sha256", "byteLength"]],
    [
      "receipts",
      [
        "path",
        "sha256",
        "inode",
        "byteLength",
        "sourcePath",
        "driverRole",
        "driverSha256",
        "parserTraceRootSha256",
      ],
    ],
  ] as const) {
    const rows = manifest[collection];
    if (!Array.isArray(rows) || rows.length <= 0) {
      throw new Error(`current_release_harness_${collection}_empty`);
    }
    for (let index = 0; index < rows.length; index += 1) {
      const row = pinObject(
        rows[index],
        keys,
        `current_release_harness_${collection}_${index}`,
      );
      pin(
        row.path,
        row.sha256,
        `current_release_harness_${collection}_${index}`,
        row.byteLength,
        "inode" in row ? row.inode : undefined,
      );
    }
  }
  const uniqueFiles = [
    ...new Map(files.map((file) => [file.path, file] as const)).values(),
  ];
  return Object.freeze({
    raw32: currentReleaseDomainCid(
      "cheng.compiler.current_parser_harness_closure",
      parts,
    ),
    files: Object.freeze(uniqueFiles),
  });
}

function parseBackend(
  value: unknown,
  targetIndex: number,
  backendIndex: number,
): BackendEvidence {
  const label = `release_target_${targetIndex}_backend_${backendIndex}`;
  assertExactCurrentObjectKeys(
    value,
    [
      "backend",
      "object",
      "executable",
      "action",
      "fragment",
      "runStatus",
      "runStdout",
      "runStderr",
      "orcEvents",
    ],
    label,
  );
  const row = value as Record<string, unknown>;
  if (row.backend !== BACKENDS[backendIndex]) {
    throw new Error(`${label}_order_invalid`);
  }
  return {
    backend: BACKENDS[backendIndex]!,
    object: parsePin(row.object, `${label}_object`),
    executable: parsePin(row.executable, `${label}_executable`),
    action: parsePin(row.action, `${label}_action`),
    fragment: parsePin(row.fragment, `${label}_fragment`),
    runStatus: parsePin(row.runStatus, `${label}_run_status`),
    runStdout: parsePin(row.runStdout, `${label}_run_stdout`),
    runStderr: parsePin(row.runStderr, `${label}_run_stderr`),
    orcEvents: parsePin(row.orcEvents, `${label}_orc_events`),
  };
}

function parseTarget(value: unknown, index: number): TargetEvidence {
  const label = `release_target_${index}`;
  assertExactCurrentObjectKeys(
    value,
    ["targetTriple", "architecture", "driverRaw32", "backends"],
    label,
  );
  const row = value as Record<string, unknown>;
  const expected = TARGETS[index];
  if (
    expected === undefined ||
    row.targetTriple !== expected.targetTriple ||
    row.architecture !== expected.architecture ||
    !Array.isArray(row.backends) ||
    row.backends.length !== BACKENDS.length
  ) {
    throw new Error(`${label}_identity_or_backend_count_invalid`);
  }
  return {
    targetTriple: expected.targetTriple,
    architecture: expected.architecture,
    driverRaw32: observedHash(row.driverRaw32, `${label}_driver`),
    backends: row.backends.map((backend, backendIndex) =>
      parseBackend(backend, index, backendIndex),
    ),
  };
}

function parseManifest(value: unknown): CurrentReleaseManifest {
  assertExactCurrentObjectKeys(
    value,
    MANIFEST_KEYS,
    "current_release_manifest",
  );
  const manifest = value as Record<string, unknown>;
  if (
    manifest.schema !== CHENG_CURRENT_RELEASE_MANIFEST_SCHEMA ||
    manifest.status !== "COMPLETE" ||
    manifest.driverRole !== "production" ||
    !Array.isArray(manifest.targets) ||
    manifest.targets.length !== TARGETS.length ||
    !Array.isArray(manifest.tools) ||
    manifest.tools.length !== TOOL_ROLES.length
  ) {
    throw new Error("current_release_manifest_header_invalid");
  }
  const manifestRaw32 = observedHash(
    manifest.manifestRaw32,
    "current_release_manifest",
  );
  const payload = { ...manifest };
  delete payload.manifestRaw32;
  if (sha256(canonicalJson(payload)) !== manifestRaw32) {
    throw new Error("current_release_manifest_self_hash_invalid");
  }
  const tools = manifest.tools.map((value, index): ToolEvidence => {
    assertExactCurrentObjectKeys(
      value,
      ["role", "artifact"],
      `current_release_tool_${index}`,
    );
    const row = value as Record<string, unknown>;
    const role = TOOL_ROLES[index]!;
    const artifact = parsePin(
      row.artifact,
      `current_release_tool_${index}_artifact`,
    );
    if (row.role !== role || artifact.path !== EXPECTED_TOOL_PATHS.get(role)) {
      throw new Error(`current_release_tool_${index}_identity_invalid`);
    }
    return { role, artifact };
  });
  const out: CurrentReleaseManifest = {
    schema: CHENG_CURRENT_RELEASE_MANIFEST_SCHEMA,
    status: "COMPLETE",
    driverRole: "production",
    parserIngressRaw32: observedHash(
      manifest.parserIngressRaw32,
      "current_release_parser_ingress",
    ),
    sourceBundleRaw32: observedHash(
      manifest.sourceBundleRaw32,
      "current_release_source_bundle",
    ),
    officialDriverRaw32: observedHash(
      manifest.officialDriverRaw32,
      "current_release_official_driver",
    ),
    executionRaw32: observedHash(
      manifest.executionRaw32,
      "current_release_execution",
    ),
    sevenStageRootRaw32: observedHash(
      manifest.sevenStageRootRaw32,
      "current_release_seven_stage",
    ),
    sourceSnapshotManifest: parsePin(
      manifest.sourceSnapshotManifest,
      "current_release_source_snapshot_manifest",
    ),
    parserHarnessManifest: parsePin(
      manifest.parserHarnessManifest,
      "current_release_parser_harness_manifest",
    ),
    executionPolicy: parsePin(
      manifest.executionPolicy,
      "current_release_execution_policy",
    ),
    sevenStageManifest: parsePin(
      manifest.sevenStageManifest,
      "current_release_seven_stage_manifest",
    ),
    semanticSnapshotAudit: parsePin(
      manifest.semanticSnapshotAudit,
      "current_release_semantic_snapshot",
    ),
    semanticSnapshotBitmapReceipt: parsePin(
      manifest.semanticSnapshotBitmapReceipt,
      "current_release_semantic_bitmap",
    ),
    semanticPublishedStdout: parsePin(
      manifest.semanticPublishedStdout,
      "current_release_semantic_published_stdout",
    ),
    semanticSourceClosure: parsePin(
      manifest.semanticSourceClosure,
      "current_release_semantic_source_closure",
    ),
    semanticPublishedObject: parsePin(
      manifest.semanticPublishedObject,
      "current_release_semantic_published_object",
    ),
    semanticBinding: parsePin(
      manifest.semanticBinding,
      "current_release_semantic_binding",
    ),
    semanticQueryProjection: parsePin(
      manifest.semanticQueryProjection,
      "current_release_semantic_query_projection",
    ),
    semanticOpenDocumentUniverse: parsePin(
      manifest.semanticOpenDocumentUniverse,
      "current_release_semantic_open_document_universe",
    ),
    semanticSnapshotArtifact: parsePin(
      manifest.semanticSnapshotArtifact,
      "current_release_semantic_snapshot_artifact",
    ),
    memoryReleaseManifest: parsePin(
      manifest.memoryReleaseManifest,
      "current_release_memory",
    ),
    baselineDriver: parsePin(
      manifest.baselineDriver,
      "current_release_baseline",
    ),
    driverSource: parsePin(
      manifest.driverSource,
      "current_release_driver_source",
    ),
    backend2Epoch: parsePin(
      manifest.backend2Epoch,
      "current_release_backend2_epoch",
    ),
    generationEnvironment: parsePin(
      manifest.generationEnvironment,
      "current_release_generation_environment",
    ),
    gen2Driver: parsePin(manifest.gen2Driver, "current_release_gen2"),
    gen3Driver: parsePin(manifest.gen3Driver, "current_release_gen3"),
    gen2Receipt: parsePin(manifest.gen2Receipt, "current_release_gen2_receipt"),
    gen3Receipt: parsePin(manifest.gen3Receipt, "current_release_gen3_receipt"),
    officialDriver: parsePin(
      manifest.officialDriver,
      "current_release_official",
    ),
    targets: manifest.targets.map(parseTarget),
    performanceEvidence: parsePin(
      manifest.performanceEvidence,
      "current_release_performance",
    ),
    freshMcpRuntime: parsePin(
      manifest.freshMcpRuntime,
      "current_release_fresh_mcp_runtime",
    ),
    freshMcpTypeArenaExecution: parsePin(
      manifest.freshMcpTypeArenaExecution,
      "current_release_fresh_mcp_type_arena_execution",
    ),
    tools,
    releaseIdentityRaw32: observedHash(
      manifest.releaseIdentityRaw32,
      "current_release_identity",
    ),
    manifestRaw32,
  };
  const exactBasenames = [
    [out.sourceSnapshotManifest, "cheng-source-snapshot.manifest.txt"],
    [out.parserHarnessManifest, "parser-production-receipt-harness.json"],
    [out.executionPolicy, "execution-stage-policy.json"],
    [out.sevenStageManifest, "current-official-seven-stage-manifest.json"],
    [
      out.semanticSnapshotAudit,
      ARTIFACT_ROLE_BASENAMES.semanticSnapshotAudit,
    ],
    [
      out.semanticSnapshotBitmapReceipt,
      ARTIFACT_ROLE_BASENAMES.semanticSnapshotBitmapReceipt,
    ],
    [
      out.semanticPublishedStdout,
      ARTIFACT_ROLE_BASENAMES.semanticPublishedStdout,
    ],
    [
      out.semanticSourceClosure,
      ARTIFACT_ROLE_BASENAMES.semanticSourceClosure,
    ],
    [
      out.semanticPublishedObject,
      ARTIFACT_ROLE_BASENAMES.semanticPublishedObject,
    ],
    [out.semanticBinding, ARTIFACT_ROLE_BASENAMES.semanticBinding],
    [
      out.semanticQueryProjection,
      ARTIFACT_ROLE_BASENAMES.semanticQueryProjection,
    ],
    [
      out.semanticOpenDocumentUniverse,
      ARTIFACT_ROLE_BASENAMES.semanticOpenDocumentUniverse,
    ],
    [
      out.semanticSnapshotArtifact,
      ARTIFACT_ROLE_BASENAMES.semanticSnapshotArtifact,
    ],
    [
      out.memoryReleaseManifest,
      ARTIFACT_ROLE_BASENAMES.memoryReleaseManifest,
    ],
    [out.baselineDriver, "cheng.stage3"],
    [out.driverSource, "compiler_main.cheng"],
    [out.backend2Epoch, "backend2_version_manifest.rec"],
    [
      out.generationEnvironment,
      ARTIFACT_ROLE_BASENAMES.generationEnvironment,
    ],
    [out.gen2Driver, ARTIFACT_ROLE_BASENAMES.gen2Driver],
    [out.gen3Driver, ARTIFACT_ROLE_BASENAMES.gen3Driver],
    [out.gen2Receipt, ARTIFACT_ROLE_BASENAMES.gen2Receipt],
    [out.gen3Receipt, ARTIFACT_ROLE_BASENAMES.gen3Receipt],
    [out.officialDriver, "cheng"],
    [
      out.performanceEvidence,
      ARTIFACT_ROLE_BASENAMES.performanceEvidence,
    ],
    [out.freshMcpRuntime, ARTIFACT_ROLE_BASENAMES.freshMcpRuntime],
    [
      out.freshMcpTypeArenaExecution,
      ARTIFACT_ROLE_BASENAMES.freshMcpTypeArenaExecution,
    ],
  ] as const;
  for (const [pin, expectedBasename] of exactBasenames) {
    if (basename(pin.path) !== expectedBasename) {
      throw new Error(
        `current_release_receipt_role_path_invalid:${expectedBasename}`,
      );
    }
  }
  const paths: string[] = [
    ...exactBasenames.map(([pin]) => pin.path),
    ...out.tools.map((tool) => tool.artifact.path),
  ];
  for (const target of out.targets) {
    const targetStem = target.targetTriple.replaceAll("-", "_");
    for (const backend of target.backends) {
      const stem = `${targetStem}.${backend.backend}`;
      for (const [key, suffix] of Object.entries(
        TARGET_ARTIFACT_SUFFIXES,
      ) as readonly [
        keyof typeof TARGET_ARTIFACT_SUFFIXES,
        (typeof TARGET_ARTIFACT_SUFFIXES)[keyof typeof TARGET_ARTIFACT_SUFFIXES],
      ][]) {
        const pin = backend[key];
        if (basename(pin.path) !== `${stem}${suffix}`) {
          throw new Error(
            `current_release_target_receipt_role_path_invalid:${stem}${suffix}`,
          );
        }
        paths.push(pin.path);
      }
    }
  }
  if (new Set(paths).size !== paths.length) {
    throw new Error("current_release_artifact_paths_alias");
  }
  return out;
}

export function validateCurrentReleaseManifestBindings(
  value: unknown,
  sevenStage: CurrentOfficialSevenStageRunnerReport,
): CurrentReleaseManifest {
  const manifest = parseManifest(value);
  if (sevenStage.status !== "ADMITTED" || sevenStage.verifiedStageCount !== 7) {
    throw new Error("current_release_seven_stage_not_admitted");
  }
  for (const [label, actual, expected] of [
    [
      "parser_ingress",
      manifest.parserIngressRaw32,
      sevenStage.parserIngressRaw32,
    ],
    ["source_bundle", manifest.sourceBundleRaw32, sevenStage.sourceBundleRaw32],
    [
      "official_driver",
      manifest.officialDriverRaw32,
      sevenStage.officialDriverRaw32,
    ],
    ["execution", manifest.executionRaw32, sevenStage.executionRaw32],
    [
      "seven_stage",
      manifest.sevenStageRootRaw32,
      sevenStage.sevenStageRootRaw32,
    ],
  ] as const) {
    if (actual !== expected) {
      throw new Error(`current_release_${label}_binding_drift`);
    }
  }
  if (
    manifest.officialDriver.path !== CHENG_CURRENT_OFFICIAL_DRIVER ||
    manifest.officialDriver.bytesRaw32 !== sevenStage.officialDriverRaw32 ||
    manifest.sourceSnapshotManifest.bytesRaw32 !==
      sevenStage.sourceSnapshotManifestRaw32 ||
    manifest.executionPolicy.bytesRaw32 !== sevenStage.policyRaw32 ||
    manifest.sevenStageManifest.bytesRaw32 !== sevenStage.runnerManifestRaw32
  ) {
    throw new Error("current_release_official_driver_path_drift");
  }
  return manifest;
}

export function validateCurrentReleaseOfficialReplay(
  first: CurrentOfficialSevenStageRunnerReport,
  final: CurrentOfficialSevenStageRunnerReport,
): void {
  if (
    first.status !== "ADMITTED" ||
    final.status !== "ADMITTED" ||
    first.verifiedStageCount !== 7 ||
    final.verifiedStageCount !== 7 ||
    canonicalJson(final) !== canonicalJson(first)
  ) {
    throw new Error("current_release_final_seven_stage_drift");
  }
}

export function validateCurrentReleaseMemoryIdentityBinding(
  memory: CurrentMemoryReleaseIdentity,
  sourceSnapshotManifestRaw32: string,
  officialDriverRaw32: string,
  targets: readonly {
    readonly targetTriple: string;
    readonly driverRaw32: string;
  }[],
): void {
  observedHash(
    sourceSnapshotManifestRaw32,
    "current_release_source_snapshot_manifest",
  );
  observedHash(officialDriverRaw32, "current_release_official_driver");
  if (
    memory.sourceClosureRaw32 !== sourceSnapshotManifestRaw32 ||
    memory.drivers.length !== 2 ||
    targets.length !== TARGETS.length
  ) {
    throw new Error("current_release_memory_source_identity_drift");
  }
  const expectedDrivers = [
    officialDriverRaw32,
    ...memory.drivers.map((driver, index) => {
      if (driver.targetTriple !== TARGETS[index + 1]!.targetTriple) {
        throw new Error(`current_release_memory_driver_${index}_target_drift`);
      }
      return observedHash(
        driver.bytesRaw32,
        `current_release_memory_driver_${index}`,
      );
    }),
  ];
  for (let index = 0; index < TARGETS.length; index += 1) {
    if (
      targets[index]!.targetTriple !== TARGETS[index]!.targetTriple ||
      targets[index]!.driverRaw32 !== expectedDrivers[index]
    ) {
      throw new Error(`current_release_target_${index}_driver_identity_drift`);
    }
  }
}

export function validateCurrentReleaseCompositeIdentity(
  claimedRaw32: string,
  computedRaw32: string,
): void {
  if (
    observedHash(claimedRaw32, "current_release_claimed_identity") !==
    observedHash(computedRaw32, "current_release_computed_identity")
  ) {
    throw new Error("current_release_composite_identity_drift");
  }
}

export interface CurrentReleaseIdentityBinding {
  readonly sourceBundleRaw32: string;
  readonly officialDriverRaw32: string;
  readonly executionRaw32: string;
}

export function validateCurrentReleaseSemanticSnapshotReceipts(
  auditValue: unknown,
  bitmapValue: unknown,
  identity: CurrentReleaseIdentityBinding,
  evidence: CurrentSemanticSnapshotRawEvidence,
): CurrentSemanticSnapshotValidation {
  return validateCurrentSemanticSnapshotEvidence(
    auditValue,
    bitmapValue,
    identity,
    evidence,
  );
}

interface GenerationChainValidation {
  readonly raw32: string;
  readonly files: readonly StableFile[];
  readonly receiptRaw32s: readonly string[];
  readonly executionRaw32s: readonly string[];
}

export interface ExecutionPolicyClosureValidation {
  readonly raw32: string;
  readonly files: readonly StableFile[];
}

export interface HarnessClosureValidation {
  readonly raw32: string;
  readonly files: readonly StableFile[];
}

export function validateCurrentReleaseFreshMcpBinding(
  pinned: ChengFusionFreshMcpRuntimeReceipt,
  live: ChengFusionFreshMcpRuntimeReceipt,
): void {
  if (
    pinned.status !== "FRESH" ||
    live.status !== "FRESH" ||
    pinned.serverInfoName !== "cheng-fusion" ||
    live.serverInfoName !== "cheng-fusion" ||
    pinned.serverInfoVersion !== "current" ||
    live.serverInfoVersion !== "current" ||
    pinned.runtimeIdentity.sourceSetRaw32 !==
      live.runtimeIdentity.sourceSetRaw32 ||
    pinned.runtimeIdentity.implementationRaw32 !==
      live.runtimeIdentity.implementationRaw32 ||
    canonicalJson(pinned.runtimeIdentity.sources) !==
      canonicalJson(live.runtimeIdentity.sources) ||
    canonicalJson(pinned.runtimeIdentity.toolRegistry) !==
      canonicalJson(live.runtimeIdentity.toolRegistry)
  ) {
    throw new Error("current_release_fresh_mcp_runtime_drift");
  }
}

export function validateCurrentReleaseFreshMcpTypeArenaBinding(
  pinned: FreshMcpTypeArenaExecutionReport,
  live: FreshMcpTypeArenaExecutionReport,
): void {
  if (
    pinned.status !== "PASS" ||
    live.status !== "PASS" ||
    canonicalJson(pinned.officialDriver) !==
      canonicalJson(live.officialDriver) ||
    canonicalJson(pinned.sourceFiles) !==
      canonicalJson(live.sourceFiles) ||
    canonicalJson(pinned.generationArtifacts) !==
      canonicalJson(live.generationArtifacts) ||
    pinned.runtimeIdentity === null ||
    live.runtimeIdentity === null ||
    pinned.runtimeIdentity.sourceSetRaw32 !==
      live.runtimeIdentity.sourceSetRaw32 ||
    pinned.runtimeIdentity.implementationRaw32 !==
      live.runtimeIdentity.implementationRaw32 ||
    canonicalJson(pinned.runtimeIdentity.sources) !==
      canonicalJson(live.runtimeIdentity.sources) ||
    canonicalJson(pinned.runtimeIdentity.runtimeExecutable) !==
      canonicalJson(live.runtimeIdentity.runtimeExecutable) ||
    canonicalJson(pinned.runtimeIdentity.toolRegistry) !==
      canonicalJson(live.runtimeIdentity.toolRegistry) ||
    pinned.steps.length !== live.steps.length ||
    pinned.steps.some((step, index) => {
      const actual = live.steps[index];
      return (
        actual === undefined ||
        step.ordinal !== actual.ordinal ||
        step.requestId !== actual.requestId ||
        step.toolName !== actual.toolName ||
        step.inputRaw32 !== actual.inputRaw32 ||
        step.outputByteLength !== actual.outputByteLength ||
        step.outputRaw32 !== actual.outputRaw32
      );
    }) ||
    canonicalJson(pinned.semantic) !== canonicalJson(live.semantic) ||
    pinned.semanticRaw32 !== live.semanticRaw32
  ) {
    throw new Error("current_release_fresh_mcp_type_arena_execution_drift");
  }
}

function pinCurrentReleaseFreshMcpClosure(
  receipt: ChengFusionFreshMcpRuntimeReceipt,
): readonly StableFile[] {
  const files = receipt.runtimeIdentity.sources.map((row, index) => {
    const path = resolve(FUSION_ROOT, ...row.path.split("/"));
    if (
      relative(FUSION_ROOT, path).startsWith("..") ||
      relative(FUSION_ROOT, path) !== row.path
    ) {
      throw new Error(`current_release_fresh_mcp_source_${index}_path_drift`);
    }
    const file = stableFile(path, `current_release_fresh_mcp_source_${index}`);
    if (file.raw.length !== row.byteLength || file.raw32 !== row.bytesRaw32) {
      throw new Error(`current_release_fresh_mcp_source_${index}_pin_drift`);
    }
    return file;
  });
  const runtime = stableFile(
    receipt.runtimeIdentity.runtimeExecutable.path,
    "current_release_fresh_mcp_runtime_executable",
  );
  if (
    runtime.raw.length !==
      receipt.runtimeIdentity.runtimeExecutable.byteLength ||
    runtime.raw32 !== receipt.runtimeIdentity.runtimeExecutable.bytesRaw32
  ) {
    throw new Error("current_release_fresh_mcp_runtime_executable_pin_drift");
  }
  return Object.freeze([...files, runtime]);
}

function generationCommandRaw32(
  generation: "GEN2" | "GEN3",
  producerDriverRaw32: string,
  driverSourceRaw32: string,
  inputSourceClosureRaw32: string,
): string {
  return sha256(
    canonicalJson({
      schema: "cheng_current_driver_generation_command",
      generation,
      producerDriverRaw32,
      driverSourceRaw32,
      inputSourceClosureRaw32,
      root: CHENG_CURRENT_ROOT,
      targetTriple: "aarch64-apple-darwin",
      argv: [
        "system-link-exec",
        `--root:${CHENG_CURRENT_ROOT}`,
        `--in:${join(
          CHENG_CURRENT_ROOT,
          "src/core/tooling/compiler_main.cheng",
        )}`,
        "--emit:exe",
        "--link-providers",
        "--target:aarch64-apple-darwin",
        "--out:$PRIVATE_GENERATION_OUTPUT",
      ],
    }),
  );
}

async function executeGeneration(
  producer: StableFile,
  outputPath: string,
  environment: Readonly<Record<string, string>>,
): Promise<{ readonly stdout: Buffer; readonly stderr: Buffer }> {
  if ((Number(producer.stat.mode) & 0o111) === 0) {
    throw new Error("current_release_generation_producer_not_executable");
  }
  const args = [
    "system-link-exec",
    `--root:${CHENG_CURRENT_ROOT}`,
    `--in:${join(CHENG_CURRENT_ROOT, "src/core/tooling/compiler_main.cheng")}`,
    "--emit:exe",
    "--link-providers",
    "--target:aarch64-apple-darwin",
    `--out:${outputPath}`,
  ];
  const outputLimit = 16 * 1024 * 1024;
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(producer.path, args, {
      cwd: CHENG_CURRENT_ROOT,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...environment, TMPDIR: dirname(outputPath) },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const kill = (): void => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    };
    const finish = (
      error?: Error,
      code?: number | null,
      signal?: NodeJS.Signals | null,
    ): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (error !== undefined) {
        kill();
        rejectPromise(error);
        return;
      }
      if (code !== 0 || signal !== null) {
        rejectPromise(
          new Error(
            `current_release_generation_failed:exit=${code}:signal=${
              signal ?? "none"
            }`,
          ),
        );
        return;
      }
      resolvePromise({
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      });
    };
    const append = (target: Buffer[], chunk: Buffer): void => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > outputLimit) {
        finish(new Error("current_release_generation_output_overflow"));
        return;
      }
      target.push(Buffer.from(chunk));
    };
    child.stdout.on("data", (chunk: Buffer) => append(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => append(stderr, chunk));
    child.once("error", (error) => finish(error));
    child.once("close", (code, signal) => finish(undefined, code, signal));
    timer = setTimeout(
      () => {
        finish(new Error("current_release_generation_timeout"));
      },
      30 * 60 * 1000,
    );
  });
}

async function fixedPoint(
  manifest: CurrentReleaseManifest,
  sourceSnapshotManifestRaw32: string,
): Promise<GenerationChainValidation> {
  const baseline = readPin(manifest.baselineDriver, "current_release_baseline");
  const driverSource = readPin(
    manifest.driverSource,
    "current_release_driver_source",
  );
  const backend2Epoch = readPin(
    manifest.backend2Epoch,
    "current_release_backend2_epoch",
  );
  const environmentFile = canonicalJsonFile(
    manifest.generationEnvironment,
    "current_release_generation_environment",
  );
  const environment = parseCurrentGenerationEnvironment(environmentFile.value);
  const gen2 = readPin(manifest.gen2Driver, "current_release_gen2");
  const gen3 = readPin(manifest.gen3Driver, "current_release_gen3");
  const official = readPin(manifest.officialDriver, "current_release_official");
  if (gen2.stat.dev === gen3.stat.dev && gen2.stat.ino === gen3.stat.ino) {
    throw new Error("current_release_gen2_gen3_inode_alias");
  }
  if (
    !gen2.raw.equals(gen3.raw) ||
    !gen3.raw.equals(official.raw) ||
    official.raw32 !== manifest.officialDriverRaw32
  ) {
    throw new Error("current_release_gen2_gen3_raw_fixed_point_failed");
  }
  if (
    manifest.baselineDriver.path !==
      join(CHENG_CURRENT_ROOT, "artifacts/bootstrap/cheng.stage3") ||
    manifest.driverSource.path !==
      join(CHENG_CURRENT_ROOT, "src/core/tooling/compiler_main.cheng") ||
    manifest.backend2Epoch.path !==
      join(CHENG_CURRENT_ROOT, "tools/backend2_version_manifest.rec")
  ) {
    throw new Error("current_release_generation_canonical_input_drift");
  }
  const work = mkdtempSync(join(tmpdir(), "cheng-current-release-generation-"));
  try {
    const executions: CurrentGenerationExecution[] = [];
    const runOne = async (
      generation: "GEN2" | "GEN3",
      producer: StableFile,
      expected: StableFile,
      receiptPin: ArtifactPin,
    ): Promise<string> => {
      const outputPath = join(work, `${generation}.replayed`);
      const commandRaw32 = generationCommandRaw32(
        generation,
        producer.raw32,
        driverSource.raw32,
        sourceSnapshotManifestRaw32,
      );
      const run = await executeGeneration(producer, outputPath, {
        ...environment.env,
        BACKEND2_EPOCH_SHA256: backend2Epoch.raw32,
      });
      const output = stableFile(
        outputPath,
        `current_release_${generation}_replayed`,
      );
      if (
        (Number(output.stat.mode) & 0o111) === 0 ||
        !output.raw.equals(expected.raw) ||
        output.raw32 !== expected.raw32
      ) {
        throw new Error(`current_release_${generation}_producer_output_drift`);
      }
      const actual: CurrentGenerationExecution = {
        generation,
        producerDriverRaw32: producer.raw32,
        inputSourceClosureRaw32: sourceSnapshotManifestRaw32,
        commandRaw32,
        environmentRaw32: environmentFile.file.raw32,
        backend2EpochRaw32: backend2Epoch.raw32,
        jobs: environment.jobs,
        stdoutRaw32: sha256(run.stdout),
        stderrRaw32: sha256(run.stderr),
        outputDriverRaw32: output.raw32,
      };
      executions.push(actual);
      const receipt = canonicalJsonFile(
        receiptPin,
        `current_release_${generation}_receipt`,
      );
      return validateCurrentDriverGenerationReceipt(receipt.value, actual);
    };
    const gen2ReceiptRaw32 = await runOne(
      "GEN2",
      baseline,
      gen2,
      manifest.gen2Receipt,
    );
    const gen3ReceiptRaw32 = await runOne(
      "GEN3",
      gen2,
      gen3,
      manifest.gen3Receipt,
    );
    return {
      raw32: currentReleaseDomainCid(
        "cheng.compiler.current_driver_generation_chain",
        [
          sourceSnapshotManifestRaw32,
          baseline.raw32,
          driverSource.raw32,
          backend2Epoch.raw32,
          environmentFile.file.raw32,
          ...executions.map(currentGenerationExecutionRaw32),
          gen2ReceiptRaw32,
          gen3ReceiptRaw32,
          gen2.raw32,
          gen3.raw32,
          official.raw32,
        ],
      ),
      files: [
        baseline,
        driverSource,
        backend2Epoch,
        environmentFile.file,
        gen2,
        gen3,
        official,
        readPin(manifest.gen2Receipt, "current_release_gen2_receipt_final"),
        readPin(manifest.gen3Receipt, "current_release_gen3_receipt_final"),
      ],
      receiptRaw32s: [gen2ReceiptRaw32, gen3ReceiptRaw32],
      executionRaw32s: executions.map(currentGenerationExecutionRaw32),
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function compositeReleaseIdentity(
  manifest: CurrentReleaseManifest,
  sevenStage: CurrentOfficialSevenStageRunnerReport,
  sourceSnapshot: {
    readonly manifestSha256: string;
    readonly closureSha256: string;
  },
  stages: unknown,
  harnessClosure: HarnessClosureValidation,
  policyClosure: ExecutionPolicyClosureValidation,
  semantic: CurrentSemanticSnapshotValidation,
  memory: CurrentMemoryReleaseIdentity,
  generation: GenerationChainValidation,
  targets: CurrentTargetMatrixValidation,
  performance: CurrentPerformanceValidation,
  freshMcpRuntime: ChengFusionFreshMcpRuntimeReceipt,
  freshMcpTypeArena: FreshMcpTypeArenaExecutionReport,
): string {
  return currentReleaseDomainCid("cheng.compiler.current_release_identity", [
    manifest.parserIngressRaw32,
    sevenStage.officialCurrentBuildBindingRaw32,
    sevenStage.parserMapRaw32,
    manifest.sourceBundleRaw32,
    sourceSnapshot.manifestSha256,
    sourceSnapshot.closureSha256,
    manifest.parserHarnessManifest.bytesRaw32,
    harnessClosure.raw32,
    manifest.executionPolicy.bytesRaw32,
    policyClosure.raw32,
    manifest.sevenStageManifest.bytesRaw32,
    manifest.officialDriverRaw32,
    manifest.executionRaw32,
    manifest.sevenStageRootRaw32,
    sha256(canonicalJson(stages)),
    semantic.sourceSetCid,
    semantic.structuralReceiptCid,
    semantic.closureReceiptCid,
    semantic.compilerInputReceiptCid,
    semantic.publishedReceiptCid,
    semantic.queryProjectionCid,
    semantic.openDocumentUniverseCid,
    semantic.snapshotRaw32,
    manifest.semanticSnapshotAudit.bytesRaw32,
    manifest.semanticSnapshotBitmapReceipt.bytesRaw32,
    manifest.semanticPublishedStdout.bytesRaw32,
    manifest.semanticSourceClosure.bytesRaw32,
    manifest.semanticPublishedObject.bytesRaw32,
    manifest.semanticBinding.bytesRaw32,
    manifest.semanticQueryProjection.bytesRaw32,
    manifest.semanticOpenDocumentUniverse.bytesRaw32,
    manifest.semanticSnapshotArtifact.bytesRaw32,
    manifest.memoryReleaseManifest.bytesRaw32,
    memory.sourceClosureRaw32,
    ...memory.drivers.flatMap((driver) => [
      driver.targetTriple,
      driver.bytesRaw32,
    ]),
    generation.raw32,
    ...generation.executionRaw32s,
    ...generation.receiptRaw32s,
    targets.raw32,
    manifest.performanceEvidence.bytesRaw32,
    performance.raw32,
    manifest.freshMcpRuntime.bytesRaw32,
    freshMcpRuntime.runtimeIdentity.implementationRaw32,
    manifest.freshMcpTypeArenaExecution.bytesRaw32,
    freshMcpTypeArena.executionRaw32,
    freshMcpTypeArena.semanticRaw32,
    sha256(canonicalJson(manifest.targets)),
    sha256(canonicalJson(manifest.tools)),
  ]);
}

function pinStableFile(path: string, label: string): ArtifactPin {
  const file = stableFile(path, label);
  return Object.freeze({
    path: file.path,
    byteLength: file.raw.length,
    bytesRaw32: file.raw32,
  });
}

function requirePublisherArtifact(
  envelope: CurrentReleasePublisherEnvelope,
  expectedBasename: string,
): ArtifactPin {
  const matches = envelope.artifacts.filter(
    (artifact) => basename(artifact.path) === expectedBasename,
  );
  if (matches.length !== 1) {
    throw new Error(
      `current_release_publisher_artifact_role_count_invalid:${expectedBasename}:${matches.length}`,
    );
  }
  const artifact = matches[0]!;
  if (artifact.byteLength <= 0) {
    throw new Error(
      `current_release_publisher_artifact_role_empty:${expectedBasename}`,
    );
  }
  return Object.freeze({
    path: artifact.path,
    byteLength: artifact.byteLength,
    bytesRaw32: artifact.bytesRaw32,
  });
}

async function runCurrentReleasePublisherValidator(
  publisherReceiptPath: string,
): Promise<void> {
  const validatorBefore = stableFile(
    CURRENT_RELEASE_PUBLISHER_VALIDATOR,
    "current_release_publisher_validator",
  );
  if ((validatorBefore.stat.mode & 0o111n) === 0n) {
    throw new Error("current_release_publisher_validator_not_executable");
  }
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(
      CURRENT_RELEASE_PUBLISHER_VALIDATOR,
      ["validate-published", "--receipt", publisherReceiptPath],
      {
        cwd: CHENG_CURRENT_ROOT,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const output: Buffer[] = [];
    let outputBytes = 0;
    const receive = (chunk: Buffer): void => {
      outputBytes += chunk.length;
      if (outputBytes > 64 * 1024) {
        child.kill("SIGKILL");
        rejectPromise(
          new Error("current_release_publisher_validator_output_excessive"),
        );
        return;
      }
      output.push(chunk);
    };
    child.stdout.on("data", receive);
    child.stderr.on("data", receive);
    child.once("error", (error) => {
      rejectPromise(
        new Error(`current_release_publisher_validator_spawn:${error.message}`),
      );
    });
    child.once("close", (code, signal) => {
      if (code !== 0 || signal !== null) {
        const detail = Buffer.concat(output).toString("utf8").trim();
        rejectPromise(
          new Error(
            `current_release_publisher_validator_red:${code ?? signal}:${detail}`,
          ),
        );
        return;
      }
      resolvePromise();
    });
  });
  const validatorAfter = stableFile(
    CURRENT_RELEASE_PUBLISHER_VALIDATOR,
    "current_release_publisher_validator_final",
  );
  if (!sameFile(validatorBefore, validatorAfter)) {
    throw new Error("current_release_publisher_validator_drift");
  }
}

function sealCurrentReleaseManifest(
  value: Omit<CurrentReleaseManifest, "manifestRaw32">,
): CurrentReleaseManifest {
  const manifest = {
    ...value,
    manifestRaw32: sha256(canonicalJson(value)),
  } satisfies CurrentReleaseManifest;
  return parseManifest(manifest);
}

export async function assembleCurrentReleaseManifest(
  input: CurrentReleaseManifestAssemblyInput,
): Promise<CurrentReleaseManifestAssembly> {
  assertExactCurrentObjectKeys(
    input,
    [
      "officialCurrentBuildBindingPath",
      "harnessManifestPath",
      "executionPolicyPath",
      "runnerManifestPath",
      "publisherReceiptPath",
    ],
    "current_release_manifest_assembly_input",
  );
  for (const [label, path] of [
    ["official_binding", input.officialCurrentBuildBindingPath],
    ["parser_harness", input.harnessManifestPath],
    ["execution_policy", input.executionPolicyPath],
    ["runner_manifest", input.runnerManifestPath],
    ["publisher_receipt", input.publisherReceiptPath],
  ] as const) {
    if (path !== resolve(path)) {
      throw new Error(`current_release_assembly_${label}_path_invalid`);
    }
  }
  const publisherBefore = inspectPublisherEnvelope(input.publisherReceiptPath);
  await runCurrentReleasePublisherValidator(input.publisherReceiptPath);
  const publisher = inspectPublisherEnvelope(input.publisherReceiptPath);
  if (
    canonicalJson(publisher.envelope) !==
      canonicalJson(publisherBefore.envelope)
  ) {
    throw new Error("current_release_publisher_evidence_drift");
  }
  const officialBinding = validateOfficialCurrentBuildBinding(
    input.officialCurrentBuildBindingPath,
  );
  const sevenStageInput = {
    officialCurrentBuildBindingPath: input.officialCurrentBuildBindingPath,
    harnessManifestPath: input.harnessManifestPath,
    executionPolicyPath: input.executionPolicyPath,
    runnerManifestPath: input.runnerManifestPath,
  } as const;
  const sevenStage = await runCurrentOfficialSevenStageAdmission(
    sevenStageInput,
  );
  if (sevenStage.status !== "ADMITTED" || sevenStage.verifiedStageCount !== 7) {
    throw new Error(`current_release_assembly_seven_stage_red:${sevenStage.reason}`);
  }
  for (const [receiptKey, actual] of [
    ["official_driver_sha256", sevenStage.officialDriverRaw32],
    ["seven_stage_execution_raw32", sevenStage.executionRaw32],
    ["seven_stage_root_raw32", sevenStage.sevenStageRootRaw32],
  ] as const) {
    if (publisher.receiptRows.get(receiptKey) !== actual) {
      throw new Error(
        `current_release_publisher_seven_stage_binding_drift:${receiptKey}`,
      );
    }
  }
  const bindingArtifact = publisher.envelope.artifacts.find(
    (artifact) => artifact.path === join(publisher.envelope.producerRoot, "binding.kv"),
  );
  if (bindingArtifact === undefined) {
    throw new Error("current_release_publisher_binding_missing");
  }
  const publisherBinding = parseCurrentReleaseKv(
    stableFile(bindingArtifact.path, "current_release_publisher_binding"),
    "current_release_publisher_binding",
    "binding_payload_sha256",
  ).rows;
  if (
    publisherBinding.get("snapshot_manifest_sha256") !==
      sevenStage.sourceBundleRaw32
  ) {
    throw new Error("current_release_publisher_source_bundle_drift");
  }
  const published = <K extends keyof typeof ARTIFACT_ROLE_BASENAMES>(
    key: K,
  ): ArtifactPin =>
    requirePublisherArtifact(
      publisher.envelope,
      ARTIFACT_ROLE_BASENAMES[key],
    );
  const memoryReleaseManifest = published("memoryReleaseManifest");
  const memoryIdentity = extractCurrentMemoryReleaseIdentity(
    parseCurrentCanonicalJson(
      readPin(
        memoryReleaseManifest,
        "current_release_assembly_memory_manifest",
      ).raw,
      "current_release_assembly_memory_manifest",
    ),
  );
  const sourceSnapshotManifest = pinStableFile(
    officialBinding.sourceSnapshotManifestPath,
    "current_release_assembly_source_snapshot",
  );
  const parserHarnessManifest = pinStableFile(
    input.harnessManifestPath,
    "current_release_assembly_parser_harness",
  );
  const executionPolicy = pinStableFile(
    input.executionPolicyPath,
    "current_release_assembly_execution_policy",
  );
  const sevenStageManifest = pinStableFile(
    input.runnerManifestPath,
    "current_release_assembly_seven_stage_manifest",
  );
  const officialDriver = pinStableFile(
    officialBinding.officialDriverPath,
    "current_release_assembly_official_driver",
  );
  const baselineDriver = pinStableFile(
    join(CHENG_CURRENT_ROOT, "artifacts/bootstrap/cheng.stage3"),
    "current_release_assembly_baseline_driver",
  );
  const driverSource = pinStableFile(
    join(CHENG_CURRENT_ROOT, "src/core/tooling/compiler_main.cheng"),
    "current_release_assembly_driver_source",
  );
  const backend2Epoch = pinStableFile(
    join(CHENG_CURRENT_ROOT, "tools/backend2_version_manifest.rec"),
    "current_release_assembly_backend2_epoch",
  );
  if (
    publisher.receiptRows.get("backend_epoch_sha256") !==
      backend2Epoch.bytesRaw32
  ) {
    throw new Error("current_release_publisher_backend_epoch_drift");
  }
  const targets = TARGETS.map((target, targetIndex): TargetEvidence => {
    const targetStem = target.targetTriple.replaceAll("-", "_");
    const driverRaw32 =
      targetIndex === 0
        ? officialDriver.bytesRaw32
        : memoryIdentity.drivers[targetIndex - 1]!.bytesRaw32;
    if (
      targetIndex > 0 &&
      memoryIdentity.drivers[targetIndex - 1]!.targetTriple !==
        target.targetTriple
    ) {
      throw new Error(
        `current_release_assembly_memory_driver_${targetIndex - 1}_drift`,
      );
    }
    return Object.freeze({
      targetTriple: target.targetTriple,
      architecture: target.architecture,
      driverRaw32,
      backends: Object.freeze(
        BACKENDS.map((backend): BackendEvidence => {
          const stem = `${targetStem}.${backend}`;
          const artifacts = Object.fromEntries(
            Object.entries(TARGET_ARTIFACT_SUFFIXES).map(([key, suffix]) => [
              key,
              requirePublisherArtifact(
                publisher.envelope,
                `${stem}${suffix}`,
              ),
            ]),
          ) as unknown as Omit<BackendEvidence, "backend">;
          return Object.freeze({ backend, ...artifacts });
        }),
      ),
    });
  });
  const performanceEvidence = published("performanceEvidence");
  if (
    publisher.receiptRows.get("performance_evidence_sha256") !==
      performanceEvidence.bytesRaw32
  ) {
    throw new Error("current_release_publisher_performance_evidence_drift");
  }
  const tools = TOOL_ROLES.map((role): ToolEvidence => {
    const path = EXPECTED_TOOL_PATHS.get(role);
    if (path === undefined) {
      throw new Error(`current_release_assembly_tool_path_missing:${role}`);
    }
    return Object.freeze({
      role,
      artifact: pinStableFile(path, `current_release_assembly_tool_${role}`),
    });
  });
  const unsealed = sealCurrentReleaseManifest({
    schema: CHENG_CURRENT_RELEASE_MANIFEST_SCHEMA,
    status: "COMPLETE",
    driverRole: "production",
    parserIngressRaw32: sevenStage.parserIngressRaw32,
    sourceBundleRaw32: sevenStage.sourceBundleRaw32,
    officialDriverRaw32: sevenStage.officialDriverRaw32,
    executionRaw32: sevenStage.executionRaw32,
    sevenStageRootRaw32: sevenStage.sevenStageRootRaw32,
    sourceSnapshotManifest,
    parserHarnessManifest,
    executionPolicy,
    sevenStageManifest,
    semanticSnapshotAudit: published("semanticSnapshotAudit"),
    semanticSnapshotBitmapReceipt: published(
      "semanticSnapshotBitmapReceipt",
    ),
    semanticPublishedStdout: published("semanticPublishedStdout"),
    semanticSourceClosure: published("semanticSourceClosure"),
    semanticPublishedObject: published("semanticPublishedObject"),
    semanticBinding: published("semanticBinding"),
    semanticQueryProjection: published("semanticQueryProjection"),
    semanticOpenDocumentUniverse: published(
      "semanticOpenDocumentUniverse",
    ),
    semanticSnapshotArtifact: published("semanticSnapshotArtifact"),
    memoryReleaseManifest,
    baselineDriver,
    driverSource,
    backend2Epoch,
    generationEnvironment: published("generationEnvironment"),
    gen2Driver: published("gen2Driver"),
    gen3Driver: published("gen3Driver"),
    gen2Receipt: published("gen2Receipt"),
    gen3Receipt: published("gen3Receipt"),
    officialDriver,
    targets: Object.freeze(targets),
    performanceEvidence,
    freshMcpRuntime: published("freshMcpRuntime"),
    freshMcpTypeArenaExecution: published(
      "freshMcpTypeArenaExecution",
    ),
    tools: Object.freeze(tools),
    releaseIdentityRaw32: sha256(
      "cheng.compiler.current_release_identity.unsealed",
    ),
  });
  const temporaryRoot = realpathSync.native(
    mkdtempSync(join(tmpdir(), "cheng-current-release-assembly-")),
  );
  try {
    const candidatePath = join(temporaryRoot, "current-release-manifest.json");
    writeFileSync(candidatePath, `${canonicalJson(unsealed)}\n`, {
      flag: "wx",
      mode: 0o400,
    });
    let computedReleaseIdentity: string | undefined;
    const unsealedAudit = await auditCurrentReleaseGreenInternal(
      {
        ...sevenStageInput,
        releaseManifestPath: candidatePath,
      },
      (raw32) => {
        computedReleaseIdentity = raw32;
      },
    );
    if (
      unsealedAudit.status !== "HARD_RED" ||
      unsealedAudit.reason !== "current_release_composite_identity_drift" ||
      computedReleaseIdentity === undefined
    ) {
      throw new Error(
        `current_release_assembly_audit_red:${unsealedAudit.reason}`,
      );
    }
    const {
      manifestRaw32: _unsealedManifestRaw32,
      ...unsealedPayload
    } = unsealed;
    const finalManifest = sealCurrentReleaseManifest({
      ...unsealedPayload,
      releaseIdentityRaw32: computedReleaseIdentity,
    });
    const finalPublisher = inspectPublisherEnvelope(
      input.publisherReceiptPath,
    );
    if (
      canonicalJson(finalPublisher.envelope) !==
        canonicalJson(publisher.envelope)
    ) {
      throw new Error("current_release_publisher_final_drift");
    }
    return Object.freeze({
      manifestJson: `${canonicalJson(finalManifest)}\n`,
      releaseIdentityRaw32: finalManifest.releaseIdentityRaw32,
      publisherReceiptRaw32: publisher.envelope.receiptRaw32,
      publisherManifestRaw32: publisher.envelope.manifestRaw32,
      publisherArtifactCount: publisher.envelope.artifacts.length,
    });
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function hardRed(reason: string): CurrentReleaseGreenAuditReport {
  return {
    schema: CHENG_CURRENT_RELEASE_AUDIT_SCHEMA,
    status: "HARD_RED",
    red_count: 1,
    driver_role: "production",
    verdict: "RED",
    reason,
    parserIngressRaw32: "",
    sourceBundleRaw32: "",
    officialDriverRaw32: "",
    executionRaw32: "",
    sevenStageRootRaw32: "",
    semanticSnapshotRaw32: "",
    memoryReleaseRaw32: "",
    genFixedPointRaw32: "",
    targetMatrixRaw32: "",
    performanceRaw32: "",
    mcpRuntimeRaw32: "",
    mcpExecutionRaw32: "",
    releaseIdentityRaw32: "",
    targetCount: 0,
    backendEvidenceCount: 0,
  };
}

async function auditCurrentReleaseGreenInternal(
  input: CurrentReleaseGreenAuditInput,
  captureComputedReleaseIdentity?: (raw32: string) => void,
): Promise<CurrentReleaseGreenAuditReport> {
  try {
    assertExactCurrentObjectKeys(
      input,
      [
        "officialCurrentBuildBindingPath",
        "harnessManifestPath",
        "executionPolicyPath",
        "runnerManifestPath",
        "releaseManifestPath",
      ],
      "current_release_audit_input",
    );
    if (
      input.releaseManifestPath !== resolve(input.releaseManifestPath) ||
      basename(input.releaseManifestPath) !== "current-release-manifest.json"
    ) {
      throw new Error("current_release_manifest_path_invalid");
    }
    const releaseManifestFile = stableFile(
      input.releaseManifestPath,
      "current_release_manifest",
    );
    const releaseText = releaseManifestFile.raw.toString("utf8");
    if (
      !releaseText.endsWith("\n") ||
      Buffer.from(releaseText, "utf8").length !== releaseManifestFile.raw.length
    ) {
      throw new Error("current_release_manifest_encoding_invalid");
    }
    const releaseValue = parseUniqueCurrentJson(
      releaseText,
      "current_release_manifest",
    );
    if (`${canonicalJson(releaseValue)}\n` !== releaseText) {
      throw new Error("current_release_manifest_canonical_json_invalid");
    }
    const manifestBeforeAdmission = parseManifest(releaseValue);
    const officialBinding = validateOfficialCurrentBuildBinding(
      input.officialCurrentBuildBindingPath,
    );
    const officialBindingFile = stableFile(
      input.officialCurrentBuildBindingPath,
      "current_release_official_build_binding",
    );
    if (officialBindingFile.raw32 !== officialBinding.bindingSha256) {
      throw new Error("current_release_official_build_binding_drift");
    }
    for (const [label, pin, path] of [
      [
        "source_snapshot_manifest",
        manifestBeforeAdmission.sourceSnapshotManifest,
        officialBinding.sourceSnapshotManifestPath,
      ],
      [
        "parser_harness_manifest",
        manifestBeforeAdmission.parserHarnessManifest,
        input.harnessManifestPath,
      ],
      [
        "execution_policy",
        manifestBeforeAdmission.executionPolicy,
        input.executionPolicyPath,
      ],
      [
        "seven_stage_manifest",
        manifestBeforeAdmission.sevenStageManifest,
        input.runnerManifestPath,
      ],
      [
        "official_driver",
        manifestBeforeAdmission.officialDriver,
        officialBinding.officialDriverPath,
      ],
    ] as const) {
      if (pin.path !== path || path !== resolve(path)) {
        throw new Error(`current_release_${label}_input_path_drift`);
      }
    }
    const pinnedFiles: StableFile[] = [officialBindingFile];
    for (const tool of manifestBeforeAdmission.tools) {
      pinnedFiles.push(readPin(tool.artifact, `current_release_${tool.role}`));
    }
    const freshMcpFile = canonicalJsonFile(
      manifestBeforeAdmission.freshMcpRuntime,
      "current_release_fresh_mcp_runtime",
    );
    const pinnedFreshMcpRuntime = validateFreshChengFusionMcpRuntimeReceipt(
      freshMcpFile.value,
    );
    const initialFreshMcpRuntime = await probeFreshChengFusionMcpRuntime();
    validateCurrentReleaseFreshMcpBinding(
      pinnedFreshMcpRuntime,
      initialFreshMcpRuntime,
    );
    pinnedFiles.push(
      freshMcpFile.file,
      ...pinCurrentReleaseFreshMcpClosure(pinnedFreshMcpRuntime),
    );
    const freshMcpTypeArenaFile = canonicalJsonFile(
      manifestBeforeAdmission.freshMcpTypeArenaExecution,
      "current_release_fresh_mcp_type_arena_execution",
    );
    validateFreshMcpTypeArenaExecutionReport(freshMcpTypeArenaFile.value);
    const pinnedFreshMcpTypeArena =
      freshMcpTypeArenaFile.value as FreshMcpTypeArenaExecutionReport;
    if (pinnedFreshMcpTypeArena.status !== "PASS") {
      throw new Error(
        `current_release_fresh_mcp_type_arena_receipt_red:${pinnedFreshMcpTypeArena.reason}`,
      );
    }
    const initialFreshMcpTypeArena =
      await runFreshMcpTypeArenaExecution();
    if (initialFreshMcpTypeArena.status !== "PASS") {
      throw new Error(
        `current_release_fresh_mcp_type_arena_red:${initialFreshMcpTypeArena.reason}`,
      );
    }
    validateCurrentReleaseFreshMcpTypeArenaBinding(
      pinnedFreshMcpTypeArena,
      initialFreshMcpTypeArena,
    );
    pinnedFiles.push(freshMcpTypeArenaFile.file);
    const officialInputPins = [
      manifestBeforeAdmission.sourceSnapshotManifest,
      manifestBeforeAdmission.parserHarnessManifest,
      manifestBeforeAdmission.executionPolicy,
      manifestBeforeAdmission.sevenStageManifest,
      manifestBeforeAdmission.officialDriver,
    ] as const;
    for (const pin of officialInputPins) {
      pinnedFiles.push(readPin(pin, "current_release_official_input"));
    }
    const policyFile = readPin(
      manifestBeforeAdmission.executionPolicy,
      "current_release_execution_policy_closure_input",
    );
    const harnessFile = readPin(
      manifestBeforeAdmission.parserHarnessManifest,
      "current_release_parser_harness_closure_input",
    );
    const harnessText = new TextDecoder("utf-8", { fatal: true }).decode(
      harnessFile.raw,
    );
    const harnessValue = parseUniqueCurrentJson(
      harnessText,
      "current_release_parser_harness_closure_input",
    );
    if (
      !harnessText.endsWith("\n") ||
      `${JSON.stringify(harnessValue, null, 2)}\n` !== harnessText
    ) {
      throw new Error("current_release_parser_harness_encoding_invalid");
    }
    const harnessClosure = pinCurrentParserHarnessClosure(harnessValue);
    const policyClosure = pinCurrentExecutionPolicyClosure(
      parseCurrentCanonicalJson(
        policyFile.raw,
        "current_release_execution_policy_closure_input",
      ),
    );
    pinnedFiles.push(
      harnessFile,
      ...harnessClosure.files,
      policyFile,
      ...policyClosure.files,
    );
    const sourceSnapshot = validateCurrentSourceSnapshot(
      officialBinding.sourceSnapshotManifestPath,
      officialBinding.sourceSnapshotRoot,
    );
    if (
      sourceSnapshot.manifestSha256 !==
        manifestBeforeAdmission.sourceSnapshotManifest.bytesRaw32 ||
      sourceSnapshot.manifestSha256 !==
        officialBinding.sourceSnapshotManifestSha256
    ) {
      throw new Error("current_release_source_snapshot_pin_drift");
    }
    const sevenStageInput = {
      officialCurrentBuildBindingPath:
        input.officialCurrentBuildBindingPath,
      harnessManifestPath: input.harnessManifestPath,
      executionPolicyPath: input.executionPolicyPath,
      runnerManifestPath: input.runnerManifestPath,
    } as const;
    const sevenStage =
      await runCurrentOfficialSevenStageAdmission(sevenStageInput);
    if (sevenStage.status !== "ADMITTED") {
      throw new Error(`current_release_seven_stage_red:${sevenStage.reason}`);
    }
    const manifest = validateCurrentReleaseManifestBindings(
      releaseValue,
      sevenStage,
    );
    const sevenStageValue = parseCurrentCanonicalJson(
      readPin(
        manifest.sevenStageManifest,
        "current_release_seven_stage_manifest",
      ).raw,
      "current_release_seven_stage_manifest",
    ) as Record<string, unknown>;
    if (
      !Array.isArray(sevenStageValue.stages) ||
      sevenStageValue.stages.length !== 7
    ) {
      throw new Error("current_release_seven_stage_rows_invalid");
    }
    const semantic = canonicalJsonFile(
      manifest.semanticSnapshotAudit,
      "current_release_semantic_snapshot",
    );
    const bitmap = canonicalJsonFile(
      manifest.semanticSnapshotBitmapReceipt,
      "current_release_semantic_bitmap",
    );
    const semanticRawFiles = {
      publishedStdout: readPin(
        manifest.semanticPublishedStdout,
        "current_release_semantic_published_stdout",
      ),
      sourceClosure: readPin(
        manifest.semanticSourceClosure,
        "current_release_semantic_source_closure",
      ),
      publishedObject: readPin(
        manifest.semanticPublishedObject,
        "current_release_semantic_published_object",
      ),
      binding: readPin(
        manifest.semanticBinding,
        "current_release_semantic_binding",
      ),
      query: readPin(
        manifest.semanticQueryProjection,
        "current_release_semantic_query",
      ),
      openDocumentUniverse: readPin(
        manifest.semanticOpenDocumentUniverse,
        "current_release_semantic_open_document_universe",
      ),
      snapshot: readPin(
        manifest.semanticSnapshotArtifact,
        "current_release_semantic_snapshot_artifact",
      ),
    };
    const semanticInputFiles = CHENG_CURRENT_SEMANTIC_INPUT_SPECS.map(
      ([relativePath, role]) => ({
        relativePath,
        role,
        file: stableFile(
          join(CHENG_CURRENT_ROOT, relativePath),
          `current_release_semantic_input_${relativePath}`,
        ),
      }),
    );
    const semanticValidation = validateCurrentReleaseSemanticSnapshotReceipts(
      semantic.value,
      bitmap.value,
      manifest,
      {
        expectedRoot: CHENG_CURRENT_ROOT,
        inputArtifacts: semanticInputFiles.map((row) => ({
          relativePath: row.relativePath,
          role: row.role,
          raw: row.file.raw,
        })),
        sourceSnapshotRows: sourceSnapshot.rows,
        publishedStdoutRaw: semanticRawFiles.publishedStdout.raw,
        sourceClosureRaw: semanticRawFiles.sourceClosure.raw,
        publishedObjectRaw: semanticRawFiles.publishedObject.raw,
        bindingRaw: semanticRawFiles.binding.raw,
        queryProjectionRaw: semanticRawFiles.query.raw,
        openDocumentUniverseRaw: semanticRawFiles.openDocumentUniverse.raw,
        snapshotRaw: semanticRawFiles.snapshot.raw,
      },
    );
    pinnedFiles.push(
      semantic.file,
      bitmap.file,
      ...Object.values(semanticRawFiles),
      ...semanticInputFiles.map((row) => row.file),
    );

    const memoryManifest = readPin(
      manifest.memoryReleaseManifest,
      "current_release_memory_manifest",
    );
    const memory = verifyMemoryReleaseGate(memoryManifest.path);
    if (
      memory.status !== CHENG_MEMORY_RELEASE_GATE_STATUS ||
      memory.caseIds.length !== CHENG_MEMORY_RELEASE_REQUIRED_CASES.length ||
      canonicalJson(memory.targets) !==
        canonicalJson(["aarch64-unknown-linux-gnu", "x86_64-unknown-linux-gnu"])
    ) {
      throw new Error("current_release_memory_gate_incomplete");
    }
    const memoryIdentity = extractCurrentMemoryReleaseIdentity(
      parseCurrentCanonicalJson(
        memoryManifest.raw,
        "current_release_memory_manifest",
      ),
    );
    validateCurrentReleaseMemoryIdentityBinding(
      memoryIdentity,
      sourceSnapshot.manifestSha256,
      manifest.officialDriverRaw32,
      manifest.targets,
    );
    pinnedFiles.push(memoryManifest);

    const fixed = await fixedPoint(manifest, sourceSnapshot.manifestSha256);
    pinnedFiles.push(...fixed.files);
    const targetFiles: StableFile[] = [];
    const targetValidation = validateCurrentTargetMatrix(
      manifest.targets,
      manifest,
      (pin, label) => {
        const file = readPin(pin, label);
        targetFiles.push(file);
        return file.raw;
      },
    );
    pinnedFiles.push(...targetFiles);
    const performance = canonicalJsonFile(
      manifest.performanceEvidence,
      "current_release_performance",
    );
    const performanceFiles: StableFile[] = [];
    const performanceValidation = validateCurrentPerformanceEvidence(
      performance.value,
      manifest,
      targetValidation,
      {
        candidateAction: manifest.targets[0]!.backends[0]!.action,
        candidateFragment: manifest.targets[0]!.backends[0]!.fragment,
        candidateObject: manifest.targets[0]!.backends[0]!.object,
        currentTextBinary: manifest.officialDriver,
        baselineTextBinary: manifest.baselineDriver,
      },
      (pin, label) => {
        const file = readPin(pin, label);
        performanceFiles.push(file);
        return file.raw;
      },
    );
    pinnedFiles.push(performance.file, ...performanceFiles);

    const releaseIdentityRaw32 = compositeReleaseIdentity(
      manifest,
      sevenStage,
      sourceSnapshot,
      sevenStageValue.stages,
      harnessClosure,
      policyClosure,
      semanticValidation,
      memoryIdentity,
      fixed,
      targetValidation,
      performanceValidation,
      pinnedFreshMcpRuntime,
      pinnedFreshMcpTypeArena,
    );
    captureComputedReleaseIdentity?.(releaseIdentityRaw32);

    const finalSevenStage =
      await runCurrentOfficialSevenStageAdmission(sevenStageInput);
    validateCurrentReleaseOfficialReplay(sevenStage, finalSevenStage);
    const finalFreshMcpRuntime = await probeFreshChengFusionMcpRuntime();
    validateCurrentReleaseFreshMcpBinding(
      pinnedFreshMcpRuntime,
      finalFreshMcpRuntime,
    );
    validateCurrentReleaseFreshMcpBinding(
      initialFreshMcpRuntime,
      finalFreshMcpRuntime,
    );
    const finalFreshMcpTypeArena =
      await runFreshMcpTypeArenaExecution();
    if (finalFreshMcpTypeArena.status !== "PASS") {
      throw new Error(
        `current_release_final_fresh_mcp_type_arena_red:${finalFreshMcpTypeArena.reason}`,
      );
    }
    validateCurrentReleaseFreshMcpTypeArenaBinding(
      pinnedFreshMcpTypeArena,
      finalFreshMcpTypeArena,
    );
    validateCurrentReleaseFreshMcpTypeArenaBinding(
      initialFreshMcpTypeArena,
      finalFreshMcpTypeArena,
    );
    const finalOfficialBinding = validateOfficialCurrentBuildBinding(
      input.officialCurrentBuildBindingPath,
    );
    if (canonicalJson(finalOfficialBinding) !== canonicalJson(officialBinding)) {
      throw new Error("current_release_final_official_binding_drift");
    }
    const finalSourceSnapshot = validateCurrentSourceSnapshot(
      finalOfficialBinding.sourceSnapshotManifestPath,
      finalOfficialBinding.sourceSnapshotRoot,
    );
    if (canonicalJson(finalSourceSnapshot) !== canonicalJson(sourceSnapshot)) {
      throw new Error("current_release_final_source_snapshot_drift");
    }
    for (const file of pinnedFiles) {
      const after = stableFile(file.path, "current_release_final_pin");
      if (!sameFile(file, after)) {
        throw new Error(`current_release_input_drift:${file.path}`);
      }
    }
    if (
      !sameFile(
        releaseManifestFile,
        stableFile(input.releaseManifestPath, "current_release_manifest_final"),
      )
    ) {
      throw new Error("current_release_manifest_drift");
    }
    validateCurrentReleaseCompositeIdentity(
      manifest.releaseIdentityRaw32,
      releaseIdentityRaw32,
    );
    const report: CurrentReleaseGreenAuditReport = {
      schema: CHENG_CURRENT_RELEASE_AUDIT_SCHEMA,
      status: "GREEN",
      red_count: 0,
      driver_role: "production",
      verdict: "RELEASE_GREEN",
      reason: "",
      parserIngressRaw32: manifest.parserIngressRaw32,
      sourceBundleRaw32: manifest.sourceBundleRaw32,
      officialDriverRaw32: manifest.officialDriverRaw32,
      executionRaw32: manifest.executionRaw32,
      sevenStageRootRaw32: manifest.sevenStageRootRaw32,
      semanticSnapshotRaw32: semantic.file.raw32,
      memoryReleaseRaw32: memoryManifest.raw32,
      genFixedPointRaw32: fixed.raw32,
      targetMatrixRaw32: targetValidation.raw32,
      performanceRaw32: performanceValidation.raw32,
      mcpRuntimeRaw32:
        pinnedFreshMcpRuntime.runtimeIdentity.implementationRaw32,
      mcpExecutionRaw32: pinnedFreshMcpTypeArena.executionRaw32,
      releaseIdentityRaw32,
      targetCount: TARGETS.length,
      backendEvidenceCount: TARGETS.length * BACKENDS.length,
    };
    validateCurrentReleaseGreenAuditReport(report);
    return report;
  } catch (error) {
    const report = hardRed(
      error instanceof Error ? error.message : String(error),
    );
    validateCurrentReleaseGreenAuditReport(report);
    return report;
  }
}

export async function auditCurrentReleaseGreen(
  input: CurrentReleaseGreenAuditInput,
): Promise<CurrentReleaseGreenAuditReport> {
  return auditCurrentReleaseGreenInternal(input);
}

export function validateCurrentReleaseGreenAuditReport(
  value: unknown,
): asserts value is CurrentReleaseGreenAuditReport {
  assertExactCurrentObjectKeys(
    value,
    [
      "schema",
      "status",
      "red_count",
      "driver_role",
      "verdict",
      "reason",
      "parserIngressRaw32",
      "sourceBundleRaw32",
      "officialDriverRaw32",
      "executionRaw32",
      "sevenStageRootRaw32",
      "semanticSnapshotRaw32",
      "memoryReleaseRaw32",
      "genFixedPointRaw32",
      "targetMatrixRaw32",
      "performanceRaw32",
      "mcpRuntimeRaw32",
      "mcpExecutionRaw32",
      "releaseIdentityRaw32",
      "targetCount",
      "backendEvidenceCount",
    ],
    "current_release_audit_report",
  );
  const report = value;
  if (
    report.schema !== CHENG_CURRENT_RELEASE_AUDIT_SCHEMA ||
    report.driver_role !== "production" ||
    typeof report.reason !== "string"
  ) {
    throw new Error("current_release_audit_report_header_invalid");
  }
  const hashes = [
    report.parserIngressRaw32,
    report.sourceBundleRaw32,
    report.officialDriverRaw32,
    report.executionRaw32,
    report.sevenStageRootRaw32,
    report.semanticSnapshotRaw32,
    report.memoryReleaseRaw32,
    report.genFixedPointRaw32,
    report.targetMatrixRaw32,
    report.performanceRaw32,
    report.mcpRuntimeRaw32,
    report.mcpExecutionRaw32,
    report.releaseIdentityRaw32,
  ];
  if (report.status === "GREEN") {
    if (
      report.red_count !== 0 ||
      report.verdict !== "RELEASE_GREEN" ||
      report.reason !== "" ||
      hashes.some((hash) => !HASH.test(hash)) ||
      report.targetCount !== 3 ||
      report.backendEvidenceCount !== 6
    ) {
      throw new Error("current_release_green_contract_invalid");
    }
  } else if (
    report.status !== "HARD_RED" ||
    report.red_count !== 1 ||
    report.verdict !== "RED" ||
    report.reason === "" ||
    hashes.some((hash) => hash !== "") ||
    report.targetCount !== 0 ||
    report.backendEvidenceCount !== 0
  ) {
    throw new Error("current_release_hard_red_must_not_witness");
  }
}

export function serializeCurrentReleaseGreenAuditReport(
  report: CurrentReleaseGreenAuditReport,
): string {
  validateCurrentReleaseGreenAuditReport(report);
  return JSON.stringify(report, null, 2) + "\n";
}
