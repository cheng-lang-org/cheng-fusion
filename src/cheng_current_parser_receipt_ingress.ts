import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  type BigIntStats,
} from "node:fs";
import {createHash} from "node:crypto";
import {basename, dirname, join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {
  CHENG_PARSER_RECEIPT_BUILD_COMPILER,
  CHENG_PARSER_RECEIPT_DRIVER_ENTRY_RELATIVE,
  buildEbnfParserNodeMap,
  buildParserReceiptHarnessChengClosure,
  buildParserReceiptHarnessExecutableIdentity,
  buildParserReceiptHarnessToolClosure,
  serializeEbnfParserNodeMap,
  validateParserProductionReceiptHarnessArtifactFiles,
  validateParserProductionReceiptHarnessSourcePlan,
} from "./cheng_ebnf_parser_node_map.ts";
import {canonicalJson} from "./cheng_semantic_matrix_m9023.ts";
import {
  assertExactCurrentObjectKeys,
  parseUniqueCurrentJson,
} from "./current_schema_json.ts";
import {
  readCurrentChengGrammarCorpus,
  type ChengGrammarCorpusSnapshot,
} from "./cheng_grammar_corpus_store.ts";

export const CHENG_CURRENT_PARSER_RECEIPT_INGRESS_SCHEMA =
  "cheng_current_parser_receipt_ingress";
export const CHENG_CURRENT_PARSER_RECEIPT_PRODUCTION_COUNT = 125;
export const CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT = 971;
export const CHENG_CURRENT_PARSER_RECEIPT_SOURCE_COUNT = 29;
export const CHENG_CURRENT_ROOT = "/Users/lbcheng/cheng-lang";
export const CHENG_CURRENT_OFFICIAL_DRIVER = join(
  CHENG_CURRENT_ROOT,
  "artifacts/backend_driver/cheng",
);
export const CHENG_CURRENT_OFFICIAL_BUILD_RECEIPT = join(
  CHENG_CURRENT_ROOT,
  "artifacts/backend_driver/cheng.current-build-receipt.kv",
);

const FUSION_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const HARNESS_PATH = join(
  FUSION_ROOT,
  "tools/current_parser_production_receipt_harness.ts",
);
const CORPUS_ROOT = join(
  FUSION_ROOT,
  "fixtures/semantic/grammar_corpus",
);
const CLAIMS_PATH = join(
  FUSION_ROOT,
  "fixtures/semantic/ebnf_parser_producer_claims.json",
);
const FORMAL_SPEC_RELATIVE = "docs/cheng-formal-spec.md";
const PARSER_RELATIVE = "src/core/lang/parser.cheng";
const RECEIPT_PRODUCER_RELATIVE =
  "src/core/tooling/compiler_parser_receipt.cheng";
const BOOTSTRAP_RELATIVE = "bootstrap/cheng_cold.c";
const SNAPSHOT_ROLES = new Set([
  "compiler_source",
  "backend2_manifest",
  "backend2_sentinel_script",
  "exact_probe_source",
]);
const REQUIRED_SNAPSHOT_ROWS = [
  FORMAL_SPEC_RELATIVE,
  PARSER_RELATIVE,
  RECEIPT_PRODUCER_RELATIVE,
  CHENG_PARSER_RECEIPT_DRIVER_ENTRY_RELATIVE,
  BOOTSTRAP_RELATIVE,
] as const;
const SHA256 = /^[0-9a-f]{64}$/;
const CANONICAL_UINT = /^(?:0|[1-9][0-9]*)$/;
const LOWER_HEX = /^(?:[0-9a-f][0-9a-f])*$/;
const OFFICIAL_BINDING_KEYS = new Set([
  "schema",
  "status",
  "driver_role",
  "official_build_receipt_path_fshex",
  "official_build_receipt_sha256",
  "official_source_manifest_path_fshex",
  "official_source_manifest_sha256",
  "compiler_private_source_manifest_path_fshex",
  "compiler_private_source_manifest_sha256",
  "official_driver_path_fshex",
  "official_driver_sha256",
  "final_receipt_source_manifest_sha256",
  "receipt_payload_sha256",
]);
const OFFICIAL_BUILD_RECEIPT_KEYS = new Set([
  "schema",
  "status",
  "driver_role",
  "source_manifest_sha256",
  "source_manifest_before_path_fshex",
  "source_manifest_after_path_fshex",
  "official_sha256",
  "install_receipt_path_fshex",
  "install_receipt_sha256",
  "publisher_receipt_path_fshex",
  "publisher_receipt_sha256",
  "source_postflight_status",
  "raw_bytes_fixed_point",
  "receipt_payload_sha256",
]);
const OFFICIAL_INSTALL_RECEIPT_KEYS = new Set([
  "schema",
  "status",
  "driver_role",
  "source_manifest_path_fshex",
  "source_manifest_sha256",
  "compiler_candidate_path_fshex",
  "compiler_candidate_sha256",
  "compiler_build_receipt_path_fshex",
  "compiler_build_receipt_sha256",
  "bootstrap_summary_sha256",
  "bootstrap_fixed_point_sha256",
  "bootstrap_gen2_sha256",
  "bootstrap_gen3_sha256",
  "previous_official_present",
  "previous_official_sha256",
  "previous_official_device",
  "previous_official_inode",
  "official_path_fshex",
  "official_sha256",
  "official_device",
  "official_inode",
  "official_size",
  "receipt_payload_sha256",
]);

interface StableFileIdentity {
  readonly path: string;
  readonly bytes: Buffer;
  readonly sha256: string;
  readonly byteLength: number;
  readonly device: string;
  readonly inode: string;
  readonly mode: number;
  readonly modifiedNs: string;
  readonly changedNs: string;
}

export interface CurrentSourceSnapshotRow {
  readonly relativePath: string;
  readonly role: string;
  readonly sha256: string;
  readonly byteLength: number;
}

export interface CurrentSourceSnapshotIdentity {
  readonly manifestPath: string;
  readonly manifestSha256: string;
  readonly closureSha256: string;
  readonly entryCount: number;
  readonly compilerSourceCount: number;
  readonly rows: readonly CurrentSourceSnapshotRow[];
}

export interface OfficialCurrentBuildBindingIdentity {
  readonly bindingPath: string;
  readonly bindingSha256: string;
  readonly officialBuildReceiptPath: string;
  readonly officialBuildReceiptSha256: string;
  readonly sourceSnapshotManifestPath: string;
  readonly sourceSnapshotManifestSha256: string;
  readonly sourceSnapshotRoot: string;
  readonly officialDriverPath: string;
  readonly officialDriverSha256: string;
}

export interface CurrentParserReceiptIngressReport {
  readonly schema: typeof CHENG_CURRENT_PARSER_RECEIPT_INGRESS_SCHEMA;
  readonly status: "ADMITTED" | "HARD_RED";
  readonly reason: string;
  readonly officialCurrentBuildBindingPath: string;
  readonly officialCurrentBuildBindingSha256: string;
  readonly sourceSnapshotManifestPath: string;
  readonly sourceSnapshotManifestSha256: string;
  readonly sourceSnapshotClosureSha256: string;
  readonly officialDriverPath: string;
  readonly officialDriverSha256: string;
  readonly harnessManifestPath: string;
  readonly harnessManifestSha256: string;
  readonly productionCount: number;
  readonly requiredObligationCount: number;
  readonly witnessedObligationCount: number;
  readonly missingObligationCount: number;
  readonly receiptCount: number;
  readonly admittedMapSha256: string;
}

export interface CurrentParserReceiptIngressResult {
  readonly report: CurrentParserReceiptIngressReport;
  readonly admittedMapJson?: string;
}

export interface CurrentParserReceiptIngressInput {
  readonly officialCurrentBuildBindingPath: string;
  readonly harnessManifestPath: string;
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameStableStat(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs;
}

function stableRegularFile(
  pathRaw: string,
  label: string,
  requireSingleLink = false,
): StableFileIdentity {
  const path = resolve(pathRaw);
  if (realpathSync(path) !== path) {
    throw new Error(`${label}_path_not_canonical`);
  }
  const flags = constants.O_RDONLY |
    ((constants as typeof constants & {O_CLOEXEC?: number}).O_CLOEXEC ?? 0) |
    (constants.O_NOFOLLOW ?? 0);
  const fd = openSync(path, flags);
  try {
    const before = fstatSync(fd, {bigint: true});
    if (!before.isFile() ||
        (requireSingleLink && before.nlink !== 1n) ||
        before.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`${label}_identity_invalid`);
    }
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, {bigint: true});
    const pathStat = lstatSync(path, {bigint: true});
    if (!sameStableStat(before, after) ||
        !sameStableStat(before, pathStat) ||
        bytes.length !== Number(before.size)) {
      throw new Error(`${label}_drift`);
    }
    return {
      path,
      bytes,
      sha256: sha256(bytes),
      byteLength: bytes.length,
      device: before.dev.toString(),
      inode: before.ino.toString(),
      mode: Number(before.mode & 0o7777n),
      modifiedNs: before.mtimeNs.toString(),
      changedNs: before.ctimeNs.toString(),
    };
  } finally {
    closeSync(fd);
  }
}

function sameFileIdentity(
  left: StableFileIdentity,
  right: StableFileIdentity,
): boolean {
  return left.path === right.path &&
    left.sha256 === right.sha256 &&
    left.byteLength === right.byteLength &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.mode === right.mode &&
    left.modifiedNs === right.modifiedNs &&
    left.changedNs === right.changedNs &&
    left.bytes.equals(right.bytes);
}

function requireExactKeys(
  rows: ReadonlyMap<string, string>,
  expected: ReadonlySet<string>,
  label: string,
): void {
  if (rows.size !== expected.size ||
      [...rows.keys()].some((key) => !expected.has(key))) {
    throw new Error(`${label}_key_set_invalid`);
  }
}

function parseHashedKv(
  file: StableFileIdentity,
  label: string,
  expectedKeys?: ReadonlySet<string>,
): Map<string, string> {
  const text = file.bytes.toString("utf8");
  if (!text.endsWith("\n") || text.includes("\r") || text.includes("\0") ||
      Buffer.from(text, "utf8").length !== file.bytes.length) {
    throw new Error(`${label}_encoding_invalid`);
  }
  const lines = text.slice(0, -1).split("\n");
  const rows = new Map<string, string>();
  for (const line of lines) {
    const separator = line.indexOf("=");
    const key = line.slice(0, separator);
    if (separator <= 0 || rows.has(key)) {
      throw new Error(`${label}_row_invalid`);
    }
    rows.set(key, line.slice(separator + 1));
  }
  const hashKey = "receipt_payload_sha256";
  if (!lines.at(-1)?.startsWith(`${hashKey}=`) ||
      !SHA256.test(rows.get(hashKey) ?? "")) {
    throw new Error(`${label}_payload_hash_position_invalid`);
  }
  const payload = Buffer.from(`${lines.slice(0, -1).join("\n")}\n`, "utf8");
  if (rows.get(hashKey) !== sha256(payload)) {
    throw new Error(`${label}_payload_hash_invalid`);
  }
  if (expectedKeys !== undefined) {
    requireExactKeys(rows, expectedKeys, label);
  }
  return rows;
}

function requiredRow(
  rows: ReadonlyMap<string, string>,
  key: string,
  label: string,
): string {
  const value = rows.get(key);
  if (value === undefined || value === "") {
    throw new Error(`${label}_missing:${key}`);
  }
  return value;
}

function requiredSha(
  rows: ReadonlyMap<string, string>,
  key: string,
  label: string,
): string {
  const value = requiredRow(rows, key, label);
  if (!SHA256.test(value)) {
    throw new Error(`${label}_sha_invalid:${key}`);
  }
  return value;
}

function decodeFsHexPath(
  rows: ReadonlyMap<string, string>,
  key: string,
  label: string,
): string {
  const raw = requiredRow(rows, key, label);
  if (!LOWER_HEX.test(raw)) {
    throw new Error(`${label}_fshex_invalid:${key}`);
  }
  const bytes = Buffer.from(raw, "hex");
  const decoded = bytes.toString("utf8");
  if (decoded.includes("\0") ||
      !Buffer.from(decoded, "utf8").equals(bytes) ||
      decoded !== resolve(decoded)) {
    throw new Error(`${label}_path_not_canonical:${key}`);
  }
  return decoded;
}

function requireHeader(
  rows: ReadonlyMap<string, string>,
  schema: string,
  label: string,
): void {
  if (rows.get("schema") !== schema ||
      rows.get("status") !== "PASS" ||
      rows.get("driver_role") !== "production") {
    throw new Error(`${label}_header_invalid`);
  }
}

function requireFileHash(
  file: StableFileIdentity,
  expected: string,
  label: string,
): void {
  if (file.sha256 !== expected) {
    throw new Error(`${label}_sha_drift`);
  }
}

export function validateOfficialCurrentBuildBindingClosure(
  bindingPathRaw: string,
  expectedOfficialBuildReceiptRaw: string,
  expectedOfficialDriverRaw: string,
): OfficialCurrentBuildBindingIdentity {
  const expectedOfficialBuildReceipt = resolve(
    expectedOfficialBuildReceiptRaw,
  );
  const expectedOfficialDriver = resolve(expectedOfficialDriverRaw);
  const binding = stableRegularFile(
    bindingPathRaw,
    "official_current_build_binding",
    true,
  );
  const bindingRows = parseHashedKv(
    binding,
    "official_current_build_binding",
    OFFICIAL_BINDING_KEYS,
  );
  requireHeader(
    bindingRows,
    "cheng.backend2.current_source_official_binding",
    "official_current_build_binding",
  );

  const officialBuildReceiptPath = decodeFsHexPath(
    bindingRows,
    "official_build_receipt_path_fshex",
    "official_current_build_binding",
  );
  if (officialBuildReceiptPath !== expectedOfficialBuildReceipt) {
    throw new Error("official_current_build_receipt_path_not_authoritative");
  }
  const officialBuildReceipt = stableRegularFile(
    officialBuildReceiptPath,
    "official_current_build_receipt",
    true,
  );
  requireFileHash(
    officialBuildReceipt,
    requiredSha(
      bindingRows,
      "official_build_receipt_sha256",
      "official_current_build_binding",
    ),
    "official_current_build_receipt",
  );
  const officialBuildRows = parseHashedKv(
    officialBuildReceipt,
    "official_current_build_receipt",
    OFFICIAL_BUILD_RECEIPT_KEYS,
  );
  requireHeader(
    officialBuildRows,
    "cheng.backend2.current_source_official_build_receipt",
    "official_current_build_receipt",
  );
  if (officialBuildRows.get("source_postflight_status") !== "stable" ||
      officialBuildRows.get("raw_bytes_fixed_point") !== "true") {
    throw new Error("official_current_build_receipt_status_invalid");
  }
  for (const key of [
    "source_manifest_sha256",
    "official_sha256",
    "install_receipt_sha256",
    "publisher_receipt_sha256",
  ]) {
    requiredSha(
      officialBuildRows,
      key,
      "official_current_build_receipt",
    );
  }

  const manifestBeforePath = decodeFsHexPath(
    officialBuildRows,
    "source_manifest_before_path_fshex",
    "official_current_build_receipt",
  );
  const manifestAfterPath = decodeFsHexPath(
    officialBuildRows,
    "source_manifest_after_path_fshex",
    "official_current_build_receipt",
  );
  const manifestBefore = stableRegularFile(
    manifestBeforePath,
    "official_source_manifest_before",
    true,
  );
  const manifestAfter = stableRegularFile(
    manifestAfterPath,
    "official_source_manifest_after",
    true,
  );
  const officialSourceManifestSha256 = requiredSha(
    officialBuildRows,
    "source_manifest_sha256",
    "official_current_build_receipt",
  );
  if (manifestBefore.sha256 !== officialSourceManifestSha256 ||
      manifestAfter.sha256 !== officialSourceManifestSha256 ||
      !manifestBefore.bytes.equals(manifestAfter.bytes)) {
    throw new Error("official_current_source_manifest_drift");
  }

  const installReceiptPath = decodeFsHexPath(
    officialBuildRows,
    "install_receipt_path_fshex",
    "official_current_build_receipt",
  );
  const installReceipt = stableRegularFile(
    installReceiptPath,
    "official_current_install_receipt",
    true,
  );
  requireFileHash(
    installReceipt,
    requiredSha(
      officialBuildRows,
      "install_receipt_sha256",
      "official_current_build_receipt",
    ),
    "official_current_install_receipt",
  );
  const installRows = parseHashedKv(
    installReceipt,
    "official_current_install_receipt",
    OFFICIAL_INSTALL_RECEIPT_KEYS,
  );
  requireHeader(
    installRows,
    "cheng.backend2.current_source_official_install_receipt",
    "official_current_install_receipt",
  );
  if (!["true", "false"].includes(
    installRows.get("previous_official_present") ?? "",
  )) {
    throw new Error("official_current_install_receipt_previous_invalid");
  }
  for (const key of [
    "source_manifest_sha256",
    "compiler_candidate_sha256",
    "compiler_build_receipt_sha256",
    "bootstrap_summary_sha256",
    "bootstrap_fixed_point_sha256",
    "bootstrap_gen2_sha256",
    "bootstrap_gen3_sha256",
    "official_sha256",
  ]) {
    requiredSha(installRows, key, "official_current_install_receipt");
  }
  if (installRows.get("previous_official_present") === "true") {
    requiredSha(
      installRows,
      "previous_official_sha256",
      "official_current_install_receipt",
    );
  } else if (installRows.get("previous_official_sha256") !== "") {
    throw new Error(
      "official_current_install_receipt_previous_sha_invalid",
    );
  }
  const publisherReceiptPath = decodeFsHexPath(
    officialBuildRows,
    "publisher_receipt_path_fshex",
    "official_current_build_receipt",
  );
  const publisherReceipt = stableRegularFile(
    publisherReceiptPath,
    "official_current_publisher_receipt",
    true,
  );
  requireFileHash(
    publisherReceipt,
    requiredSha(
      officialBuildRows,
      "publisher_receipt_sha256",
      "official_current_build_receipt",
    ),
    "official_current_publisher_receipt",
  );
  const installSourceManifestPath = decodeFsHexPath(
    installRows,
    "source_manifest_path_fshex",
    "official_current_install_receipt",
  );
  if (installSourceManifestPath !== manifestBeforePath ||
      requiredSha(
        installRows,
        "source_manifest_sha256",
        "official_current_install_receipt",
      ) !== officialSourceManifestSha256 ||
      decodeFsHexPath(
        bindingRows,
        "official_source_manifest_path_fshex",
        "official_current_build_binding",
      ) !== installSourceManifestPath ||
      requiredSha(
        bindingRows,
        "official_source_manifest_sha256",
        "official_current_build_binding",
      ) !== officialSourceManifestSha256 ||
      requiredSha(
        bindingRows,
        "final_receipt_source_manifest_sha256",
        "official_current_build_binding",
      ) !== officialSourceManifestSha256) {
    throw new Error("official_current_source_manifest_binding_drift");
  }

  const compilerCandidatePath = decodeFsHexPath(
    installRows,
    "compiler_candidate_path_fshex",
    "official_current_install_receipt",
  );
  const compilerCandidate = stableRegularFile(
    compilerCandidatePath,
    "official_current_compiler_candidate",
    true,
  );
  requireFileHash(
    compilerCandidate,
    requiredSha(
      installRows,
      "compiler_candidate_sha256",
      "official_current_install_receipt",
    ),
    "official_current_compiler_candidate",
  );
  if ((compilerCandidate.mode & 0o111) === 0) {
    throw new Error("official_current_compiler_candidate_not_executable");
  }
  const compilerRoot = dirname(compilerCandidatePath);
  const compilerReceiptPath = decodeFsHexPath(
    installRows,
    "compiler_build_receipt_path_fshex",
    "official_current_install_receipt",
  );
  if (compilerCandidatePath !== join(compilerRoot, "cheng.compiler-main") ||
      compilerReceiptPath !==
        join(compilerRoot, "cheng.compiler-main.build-receipt.txt")) {
    throw new Error("official_current_compiler_evidence_layout_invalid");
  }
  const compilerReceipt = stableRegularFile(
    compilerReceiptPath,
    "official_current_compiler_receipt",
    true,
  );
  requireFileHash(
    compilerReceipt,
    requiredSha(
      installRows,
      "compiler_build_receipt_sha256",
      "official_current_install_receipt",
    ),
    "official_current_compiler_receipt",
  );
  const compilerRows = parseHashedKv(
    compilerReceipt,
    "official_current_compiler_receipt",
  );
  const sourceSnapshotManifestPath = requiredRow(
    compilerRows,
    "private_source_snapshot_manifest_path",
    "official_current_compiler_receipt",
  );
  const sourceSnapshotRoot = requiredRow(
    compilerRows,
    "private_source_snapshot_root",
    "official_current_compiler_receipt",
  );
  if (sourceSnapshotManifestPath !== resolve(sourceSnapshotManifestPath) ||
      sourceSnapshotRoot !== resolve(sourceSnapshotRoot) ||
      sourceSnapshotManifestPath !==
        join(compilerRoot, "cheng-source-snapshot.manifest.txt") ||
      sourceSnapshotRoot !== join(compilerRoot, "source-snapshot")) {
    throw new Error("official_current_private_snapshot_layout_invalid");
  }
  const sourceSnapshotManifest = stableRegularFile(
    sourceSnapshotManifestPath,
    "official_current_private_source_manifest",
    true,
  );
  const sourceSnapshotManifestSha256 = requiredSha(
    compilerRows,
    "private_source_snapshot_manifest_sha256",
    "official_current_compiler_receipt",
  );
  requireFileHash(
    sourceSnapshotManifest,
    sourceSnapshotManifestSha256,
    "official_current_private_source_manifest",
  );
  if (decodeFsHexPath(
        bindingRows,
        "compiler_private_source_manifest_path_fshex",
        "official_current_build_binding",
      ) !== sourceSnapshotManifestPath ||
      requiredSha(
        bindingRows,
        "compiler_private_source_manifest_sha256",
        "official_current_build_binding",
      ) !== sourceSnapshotManifestSha256) {
    throw new Error("official_current_private_source_manifest_binding_drift");
  }

  const officialDriverPath = decodeFsHexPath(
    bindingRows,
    "official_driver_path_fshex",
    "official_current_build_binding",
  );
  if (officialDriverPath !== expectedOfficialDriver ||
      decodeFsHexPath(
        installRows,
        "official_path_fshex",
        "official_current_install_receipt",
      ) !== officialDriverPath) {
    throw new Error("official_current_driver_path_not_authoritative");
  }
  const officialDriver = stableRegularFile(
    officialDriverPath,
    "official_current_driver",
    true,
  );
  if ((officialDriver.mode & 0o111) === 0) {
    throw new Error("official_current_driver_not_executable");
  }
  const officialDriverSha256 = requiredSha(
    bindingRows,
    "official_driver_sha256",
    "official_current_build_binding",
  );
  if (officialDriver.sha256 !== officialDriverSha256 ||
      officialBuildRows.get("official_sha256") !== officialDriverSha256 ||
      installRows.get("official_sha256") !== officialDriverSha256) {
    throw new Error("official_current_driver_binding_drift");
  }
  if (installRows.get("official_device") !== officialDriver.device ||
      installRows.get("official_inode") !== officialDriver.inode ||
      installRows.get("official_size") !==
        officialDriver.byteLength.toString()) {
    throw new Error("official_current_driver_identity_drift");
  }

  const finalFiles = [
    [binding, "official_current_build_binding"],
    [officialBuildReceipt, "official_current_build_receipt"],
    [manifestBefore, "official_source_manifest_before"],
    [manifestAfter, "official_source_manifest_after"],
    [installReceipt, "official_current_install_receipt"],
    [publisherReceipt, "official_current_publisher_receipt"],
    [compilerCandidate, "official_current_compiler_candidate"],
    [compilerReceipt, "official_current_compiler_receipt"],
    [sourceSnapshotManifest, "official_current_private_source_manifest"],
    [officialDriver, "official_current_driver"],
  ] as const;
  for (const [before, label] of finalFiles) {
    if (!sameFileIdentity(
      before,
      stableRegularFile(before.path, label, true),
    )) {
      throw new Error(`${label}_drift`);
    }
  }
  return {
    bindingPath: binding.path,
    bindingSha256: binding.sha256,
    officialBuildReceiptPath,
    officialBuildReceiptSha256: officialBuildReceipt.sha256,
    sourceSnapshotManifestPath,
    sourceSnapshotManifestSha256,
    sourceSnapshotRoot,
    officialDriverPath,
    officialDriverSha256,
  };
}

export function validateOfficialCurrentBuildBinding(
  bindingPathRaw: string,
): OfficialCurrentBuildBindingIdentity {
  return validateOfficialCurrentBuildBindingClosure(
    bindingPathRaw,
    CHENG_CURRENT_OFFICIAL_BUILD_RECEIPT,
    CHENG_CURRENT_OFFICIAL_DRIVER,
  );
}

function requireRealParentChain(rootRaw: string, pathRaw: string): void {
  const root = resolve(rootRaw);
  const path = resolve(pathRaw);
  const rel = relative(root, path);
  if (rel === "" || rel.startsWith("..") || resolve(root, rel) !== path) {
    throw new Error("source_snapshot_parent_chain_escape");
  }
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error("source_snapshot_parent_chain_root_invalid");
  }
  let current = root;
  for (const part of rel.split("/").slice(0, -1)) {
    current = join(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error("source_snapshot_parent_chain_component_invalid");
    }
  }
}

function canonicalUint(rows: Map<string, string>, key: string): number {
  const raw = rows.get(key);
  if (raw === undefined || !CANONICAL_UINT.test(raw)) {
    throw new Error(`source_snapshot_manifest_noncanonical_uint:${key}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`source_snapshot_manifest_uint_range:${key}`);
  }
  return value;
}

function parseSourceSnapshotManifest(
  bytes: Buffer,
): {
  readonly rows: Map<string, string>;
  readonly entries: readonly (CurrentSourceSnapshotRow & {
    readonly prefix: string;
    readonly device: string;
    readonly inode: string;
    readonly mode: number;
    readonly modifiedNs: string;
    readonly changedNs: string;
  })[];
  readonly entryCount: number;
  readonly compilerSourceCount: number;
} {
  const text = bytes.toString("utf8");
  if (!text.endsWith("\n") || text.includes("\r") ||
      Buffer.from(text, "utf8").length !== bytes.length) {
    throw new Error("source_snapshot_manifest_encoding_invalid");
  }
  const rows = new Map<string, string>();
  for (const line of text.slice(0, -1).split("\n")) {
    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw new Error("source_snapshot_manifest_non_key_value");
    }
    const key = line.slice(0, separator);
    if (rows.has(key)) {
      throw new Error(`source_snapshot_manifest_duplicate_key:${key}`);
    }
    rows.set(key, line.slice(separator + 1));
  }
  const need = (key: string): string => {
    const value = rows.get(key);
    if (value === undefined) {
      throw new Error(`source_snapshot_manifest_missing:${key}`);
    }
    return value;
  };
  if (need("schema") !== "cheng.private_source_snapshot" ||
      need("status") !== "frozen") {
    throw new Error("source_snapshot_manifest_header_invalid");
  }
  const entryCount = canonicalUint(rows, "entry_count");
  const compilerSourceCount = canonicalUint(rows, "compiler_source_count");
  if (entryCount <= 0 || compilerSourceCount <= 0 ||
      compilerSourceCount > entryCount) {
    throw new Error("source_snapshot_manifest_count_invalid");
  }
  const exactKeys = new Set([
    "schema",
    "status",
    "workspace_root",
    "snapshot_root",
    "entry_count",
    "compiler_source_count",
    "closure_sha256",
  ]);
  const entries = Array.from({length: entryCount}, (_, index) => {
    const prefix = `entry.${index}.`;
    for (const key of [
      "relative",
      "role",
      "sha256",
      "bytes",
      "device",
      "inode",
      "mode",
      "mtime_ns",
      "ctime_ns",
    ]) {
      exactKeys.add(prefix + key);
    }
    const relativePath = need(prefix + "relative");
    const role = need(prefix + "role");
    const digest = need(prefix + "sha256");
    const parts = relativePath.split("/");
    if (relativePath === "" || relativePath.startsWith("/") ||
        relativePath.includes("\\") ||
        parts.some((part) => part === "" || part === "." || part === "..") ||
        parts.join("/") !== relativePath) {
      throw new Error("source_snapshot_manifest_relative_invalid");
    }
    if (!SNAPSHOT_ROLES.has(role)) {
      throw new Error("source_snapshot_manifest_role_invalid");
    }
    if (!SHA256.test(digest)) {
      throw new Error("source_snapshot_manifest_sha_invalid");
    }
    const modeRaw = need(prefix + "mode");
    if (!/^[0-7]+$/.test(modeRaw) ||
        (modeRaw.length > 1 && modeRaw.startsWith("0"))) {
      throw new Error("source_snapshot_manifest_mode_invalid");
    }
    return {
      relativePath,
      role,
      sha256: digest,
      byteLength: canonicalUint(rows, prefix + "bytes"),
      prefix,
      device: need(prefix + "device"),
      inode: need(prefix + "inode"),
      mode: Number.parseInt(modeRaw, 8),
      modifiedNs: need(prefix + "mtime_ns"),
      changedNs: need(prefix + "ctime_ns"),
    };
  });
  if (rows.size !== exactKeys.size ||
      [...rows.keys()].some((key) => !exactKeys.has(key)) ||
      entries.some((entry, index) =>
        index > 0 &&
        Buffer.compare(
          Buffer.from(entries[index - 1]!.relativePath),
          Buffer.from(entry.relativePath),
        ) >= 0) ||
      entries.filter((entry) => entry.role === "compiler_source").length !==
        compilerSourceCount) {
    throw new Error("source_snapshot_manifest_key_set_or_order_invalid");
  }
  for (const entry of entries) {
    for (const [key, value] of [
      ["device", entry.device],
      ["inode", entry.inode],
      ["mtime_ns", entry.modifiedNs],
      ["ctime_ns", entry.changedNs],
    ] as const) {
      if (!CANONICAL_UINT.test(value)) {
        throw new Error(
          `source_snapshot_manifest_noncanonical_uint:${entry.prefix}${key}`,
        );
      }
    }
  }
  return {rows, entries, entryCount, compilerSourceCount};
}

function framed32(value: Buffer): Buffer {
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(value.length);
  return Buffer.concat([length, value]);
}

function framed64(value: number): Buffer {
  const out = Buffer.allocUnsafe(8);
  out.writeBigUInt64BE(BigInt(value));
  return out;
}

function walkSnapshotFiles(root: string, directory: string, out: string[]): void {
  const directoryStat = lstatSync(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory() ||
      (directoryStat.mode & 0o7777) !== 0o500) {
    throw new Error("source_snapshot_directory_invalid");
  }
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new Error("source_snapshot_directory_symlink");
    }
    if (stat.isDirectory()) {
      walkSnapshotFiles(root, path, out);
    } else if (stat.isFile()) {
      out.push(realpathSync(path));
    } else {
      throw new Error("source_snapshot_entry_type_invalid");
    }
  }
}

export function validateFrozenCurrentSourceSnapshotClosure(
  manifestPathRaw: string,
  expectedWorkspaceRootRaw: string,
  expectedSnapshotRootRaw: string,
): CurrentSourceSnapshotIdentity {
  const manifestPath = resolve(manifestPathRaw);
  const expectedWorkspaceRoot = realpathSync(expectedWorkspaceRootRaw);
  const expectedSnapshotRoot = resolve(expectedSnapshotRootRaw);
  const manifest = stableRegularFile(
    manifestPath,
    "source_snapshot_manifest",
    true,
  );
  const parsed = parseSourceSnapshotManifest(manifest.bytes);
  const workspaceRoot = parsed.rows.get("workspace_root");
  const snapshotRoot = parsed.rows.get("snapshot_root");
  if (workspaceRoot !== expectedWorkspaceRoot ||
      realpathSync(workspaceRoot) !== expectedWorkspaceRoot ||
      snapshotRoot !== expectedSnapshotRoot ||
      resolve(snapshotRoot) !== expectedSnapshotRoot) {
    throw new Error("source_snapshot_manifest_root_mismatch");
  }
  const snapshotFiles: string[] = [];
  for (const entry of parsed.entries) {
    const snapshotPath = join(snapshotRoot, entry.relativePath);
    requireRealParentChain(snapshotRoot, snapshotPath);
    const snapshot = stableRegularFile(
      snapshotPath,
      "source_snapshot_file",
      true,
    );
    if (snapshot.sha256 !== entry.sha256 ||
        snapshot.byteLength !== entry.byteLength ||
        snapshot.device !== entry.device ||
        snapshot.inode !== entry.inode ||
        snapshot.mode !== entry.mode ||
        snapshot.modifiedNs !== entry.modifiedNs ||
        snapshot.changedNs !== entry.changedNs) {
      throw new Error(
        `source_snapshot_entry_mismatch:${entry.relativePath}`,
      );
    }
    const workspacePath = join(workspaceRoot, entry.relativePath);
    requireRealParentChain(workspaceRoot, workspacePath);
    const workspace = stableRegularFile(
      workspacePath,
      "source_snapshot_workspace_file",
    );
    if (workspace.sha256 !== snapshot.sha256 ||
        workspace.byteLength !== snapshot.byteLength ||
        !workspace.bytes.equals(snapshot.bytes)) {
      throw new Error(
        `source_snapshot_workspace_drift:${entry.relativePath}`,
      );
    }
    snapshotFiles.push(realpathSync(snapshotPath));
  }
  const actualFiles: string[] = [];
  walkSnapshotFiles(snapshotRoot, snapshotRoot, actualFiles);
  if (canonicalJson(actualFiles.sort()) !==
      canonicalJson(snapshotFiles.sort())) {
    throw new Error("source_snapshot_unmanifested_file");
  }
  const closureParts = [
    framed32(Buffer.from("cheng.private_source_snapshot")),
    (() => {
      const count = Buffer.allocUnsafe(4);
      count.writeUInt32BE(parsed.entryCount);
      return count;
    })(),
  ];
  for (const entry of parsed.entries) {
    closureParts.push(
      framed32(Buffer.from(entry.relativePath)),
      framed32(Buffer.from(entry.role, "ascii")),
      Buffer.from(entry.sha256, "hex"),
      framed64(entry.byteLength),
    );
  }
  const closureSha256 = sha256(Buffer.concat(closureParts));
  if (parsed.rows.get("closure_sha256") !== closureSha256) {
    throw new Error("source_snapshot_closure_sha_mismatch");
  }
  const rowByPath = new Map(
    parsed.entries.map((entry) => [entry.relativePath, entry]),
  );
  for (const path of REQUIRED_SNAPSHOT_ROWS) {
    if (rowByPath.get(path)?.role !== "compiler_source") {
      throw new Error(`source_snapshot_required_row_missing:${path}`);
    }
  }
  const currentManifest = stableRegularFile(
    manifestPath,
    "source_snapshot_manifest",
    true,
  );
  if (!sameFileIdentity(manifest, currentManifest)) {
    throw new Error("source_snapshot_manifest_drift");
  }
  return {
    manifestPath,
    manifestSha256: manifest.sha256,
    closureSha256,
    entryCount: parsed.entryCount,
    compilerSourceCount: parsed.compilerSourceCount,
    rows: parsed.entries.map((entry) => ({
      relativePath: entry.relativePath,
      role: entry.role,
      sha256: entry.sha256,
      byteLength: entry.byteLength,
    })),
  };
}

export function validateCurrentSourceSnapshot(
  manifestPathRaw: string,
  expectedSnapshotRootRaw: string,
): CurrentSourceSnapshotIdentity {
  const manifestPath = resolve(manifestPathRaw);
  const expectedSnapshotRoot = resolve(expectedSnapshotRootRaw);
  if (manifestPath !==
        join(dirname(expectedSnapshotRoot), "cheng-source-snapshot.manifest.txt") ||
      expectedSnapshotRoot !==
        join(dirname(manifestPath), "source-snapshot")) {
    throw new Error("source_snapshot_manifest_binding_layout_invalid");
  }
  return validateFrozenCurrentSourceSnapshotClosure(
    manifestPath,
    CHENG_CURRENT_ROOT,
    expectedSnapshotRoot,
  );
}

function currentCorpusSourceRows(
  snapshot: ChengGrammarCorpusSnapshot,
): readonly {path: string; sha256: string; byteLength: number}[] {
  return snapshot.sourcePaths.map((path) => {
    const source = stableRegularFile(path, "current_corpus_source");
    return {
      path,
      sha256: source.sha256,
      byteLength: source.byteLength,
    };
  });
}

export function validateCurrentParserReceiptIngressTopology(
  manifestValue: unknown,
  expectedSources: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly byteLength: number;
  }[],
  officialDriver: {
    readonly sha256: string;
    readonly byteLength: number;
  },
): void {
  if (manifestValue === null || typeof manifestValue !== "object" ||
      Array.isArray(manifestValue)) {
    throw new Error("current_ingress_harness_manifest_invalid");
  }
  const manifest = manifestValue as any;
  if (!Array.isArray(manifest.sources) ||
      canonicalJson(manifest.sources) !== canonicalJson(expectedSources)) {
    throw new Error("current_ingress_source_generation_invalid");
  }
  if (!Array.isArray(manifest.drivers) || manifest.drivers.length !== 2) {
    throw new Error("current_ingress_driver_count_invalid");
  }
  const roles = ["receipt_driver_a", "receipt_driver_b"];
  for (let index = 0; index < roles.length; index += 1) {
    const driver = manifest.drivers[index];
    if (driver?.role !== roles[index] ||
        driver?.sha256 !== officialDriver.sha256 ||
        driver?.byteLength !== officialDriver.byteLength) {
      throw new Error("current_ingress_official_driver_drift");
    }
  }
  if (!Array.isArray(manifest.receipts) ||
      manifest.receipts.length !== expectedSources.length * roles.length) {
    throw new Error("current_ingress_receipt_set_incomplete");
  }
  const receiptPaths = new Set<string>();
  for (let sourceIndex = 0;
    sourceIndex < expectedSources.length;
    sourceIndex += 1) {
    const source = expectedSources[sourceIndex]!;
    for (let roleIndex = 0; roleIndex < roles.length; roleIndex += 1) {
      const receipt = manifest.receipts[
        sourceIndex * roles.length + roleIndex
      ];
      if (typeof receipt?.path !== "string" ||
          receipt.path !== resolve(receipt.path) ||
          receiptPaths.has(receipt.path) ||
          receipt.sourcePath !== source.path ||
          receipt.driverRole !== roles[roleIndex] ||
          receipt.driverSha256 !== officialDriver.sha256) {
        throw new Error("current_ingress_receipt_source_driver_swap");
      }
      receiptPaths.add(receipt.path);
    }
  }
}

function hardRedReport(
  input: CurrentParserReceiptIngressInput,
  reason: string,
  identities: {
    officialCurrentBuildBindingSha256?: string | undefined;
    sourceSnapshotManifestSha256?: string | undefined;
    sourceSnapshotClosureSha256?: string | undefined;
    officialDriverSha256?: string | undefined;
    harnessManifestSha256?: string | undefined;
  } = {},
): CurrentParserReceiptIngressReport {
  return {
    schema: CHENG_CURRENT_PARSER_RECEIPT_INGRESS_SCHEMA,
    status: "HARD_RED",
    reason,
    officialCurrentBuildBindingPath:
      resolve(input.officialCurrentBuildBindingPath),
    officialCurrentBuildBindingSha256:
      identities.officialCurrentBuildBindingSha256 ?? "",
    sourceSnapshotManifestPath: "",
    sourceSnapshotManifestSha256:
      identities.sourceSnapshotManifestSha256 ?? "",
    sourceSnapshotClosureSha256:
      identities.sourceSnapshotClosureSha256 ?? "",
    officialDriverPath: "",
    officialDriverSha256: identities.officialDriverSha256 ?? "",
    harnessManifestPath: resolve(input.harnessManifestPath),
    harnessManifestSha256: identities.harnessManifestSha256 ?? "",
    productionCount: CHENG_CURRENT_PARSER_RECEIPT_PRODUCTION_COUNT,
    requiredObligationCount: CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT,
    witnessedObligationCount: 0,
    missingObligationCount: CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT,
    receiptCount: 0,
    admittedMapSha256: "",
  };
}

function validateIngressInputPaths(
  input: CurrentParserReceiptIngressInput,
): void {
  assertExactCurrentObjectKeys(input, [
    "officialCurrentBuildBindingPath",
    "harnessManifestPath",
  ], "current_parser_receipt_ingress_input");
  if (input.officialCurrentBuildBindingPath !==
        resolve(input.officialCurrentBuildBindingPath) ||
      input.harnessManifestPath !== resolve(input.harnessManifestPath) ||
      basename(input.harnessManifestPath) !==
        "parser-production-receipt-harness.json") {
    throw new Error("current_ingress_input_path_invalid");
  }
}

export async function admitCurrentParserReceipts(
  input: CurrentParserReceiptIngressInput,
): Promise<CurrentParserReceiptIngressResult> {
  let officialBinding: OfficialCurrentBuildBindingIdentity | undefined;
  let sourceSnapshot: CurrentSourceSnapshotIdentity | undefined;
  let officialDriver: StableFileIdentity | undefined;
  let harnessManifest: StableFileIdentity | undefined;
  try {
    validateIngressInputPaths(input);
    officialBinding = validateOfficialCurrentBuildBinding(
      input.officialCurrentBuildBindingPath,
    );
    officialDriver = stableRegularFile(
      officialBinding.officialDriverPath,
      "current_official_driver",
      true,
    );
    sourceSnapshot = validateCurrentSourceSnapshot(
      officialBinding.sourceSnapshotManifestPath,
      officialBinding.sourceSnapshotRoot,
    );
    if (sourceSnapshot.manifestSha256 !==
        officialBinding.sourceSnapshotManifestSha256 ||
        officialDriver.sha256 !== officialBinding.officialDriverSha256) {
      throw new Error("current_ingress_official_binding_identity_drift");
    }
    harnessManifest = stableRegularFile(
      input.harnessManifestPath,
      "current_harness_manifest",
      true,
    );
    const manifest = parseUniqueCurrentJson(
      harnessManifest.bytes.toString("utf8"),
      "current_parser_receipt_harness_manifest",
    ) as any;
    const corpusSnapshot = readCurrentChengGrammarCorpus(CORPUS_ROOT);
    const sourceRows = currentCorpusSourceRows(corpusSnapshot);
    validateCurrentParserReceiptIngressTopology(
      manifest,
      sourceRows,
      officialDriver,
    );
    validateParserProductionReceiptHarnessArtifactFiles(
      manifest,
      harnessManifest.path,
    );
    validateParserProductionReceiptHarnessSourcePlan(
      manifest,
      sourceRows,
    );

    const sourceSnapshotRoot = officialBinding.sourceSnapshotRoot;
    const formalSpecPath = join(sourceSnapshotRoot, FORMAL_SPEC_RELATIVE);
    const parserPath = join(sourceSnapshotRoot, PARSER_RELATIVE);
    const receiptProducerPath = join(
      sourceSnapshotRoot,
      RECEIPT_PRODUCER_RELATIVE,
    );
    const driverEntryPath = join(
      sourceSnapshotRoot,
      CHENG_PARSER_RECEIPT_DRIVER_ENTRY_RELATIVE,
    );
    const bootstrapPath = join(sourceSnapshotRoot, BOOTSTRAP_RELATIVE);
    const formalSpec = stableRegularFile(formalSpecPath, "formal_spec");
    const parser = stableRegularFile(parserPath, "parser");
    const receiptProducer = stableRegularFile(
      receiptProducerPath,
      "receipt_producer",
    );
    const driverEntry = stableRegularFile(driverEntryPath, "driver_entry");
    const bootstrap = stableRegularFile(bootstrapPath, "bootstrap");
    const harnessTool = stableRegularFile(HARNESS_PATH, "harness_tool");
    const claims = stableRegularFile(CLAIMS_PATH, "producer_claims");
    const dependencyClosure = buildParserReceiptHarnessChengClosure(
      sourceSnapshotRoot,
      formalSpecPath,
    );
    const toolClosure = await buildParserReceiptHarnessToolClosure(
      HARNESS_PATH,
      FUSION_ROOT,
    );
    const buildCompiler = buildParserReceiptHarnessExecutableIdentity(
      CHENG_PARSER_RECEIPT_BUILD_COMPILER,
    );
    const runtime = stableRegularFile(process.execPath, "harness_runtime");
    const receiptEvidence = manifest.receipts.map((receipt: any) => ({
      sourcePath: receipt.sourcePath,
      sourceBytes:
        stableRegularFile(receipt.sourcePath, "receipt_source").bytes,
      receiptPath: receipt.path,
      receiptBytes:
        stableRegularFile(receipt.path, "parser_receipt", true).bytes,
      manifestPath: harnessManifest!.path,
      manifestBytes: harnessManifest!.bytes,
    }));
    const map = buildEbnfParserNodeMap(
      formalSpec.bytes,
      parser.bytes,
      claims.bytes,
      {
        receiptProducerBytes: receiptProducer.bytes,
        receiptEvidence,
        harnessFormalSpecPath: formalSpec.path,
        harnessParserPath: parser.path,
        harnessReceiptProducerPath: receiptProducer.path,
        harnessDriverEntryPath: driverEntry.path,
        harnessDriverEntrySha256: driverEntry.sha256,
        harnessBootstrapPath: bootstrap.path,
        harnessBootstrapSha256: bootstrap.sha256,
        harnessPath: harnessTool.path,
        harnessSha256: harnessTool.sha256,
        harnessDependencyClosureSha256: dependencyClosure.sha256,
        harnessToolClosureSha256: toolClosure.sha256,
        harnessBuildCompilerExecutablePath:
          buildCompiler.executablePath,
        harnessBuildCompilerExecutableSha256:
          buildCompiler.executableSha256,
        harnessBuildCompilerVersionSha256:
          buildCompiler.versionSha256,
        harnessRuntimeExecutablePath: runtime.path,
        harnessRuntimeExecutableSha256: runtime.sha256,
        harnessRuntimeVersion: Bun.version,
        harnessOfficialCurrentBuild: {
          bindingPath: officialBinding.bindingPath,
          bindingSha256: officialBinding.bindingSha256,
          officialBuildReceiptPath:
            officialBinding.officialBuildReceiptPath,
          officialBuildReceiptSha256:
            officialBinding.officialBuildReceiptSha256,
          sourceSnapshotManifestPath:
            officialBinding.sourceSnapshotManifestPath,
          sourceSnapshotManifestSha256:
            officialBinding.sourceSnapshotManifestSha256,
          sourceSnapshotRoot: officialBinding.sourceSnapshotRoot,
          sourceSnapshotClosureSha256: sourceSnapshot.closureSha256,
          officialDriverPath: officialBinding.officialDriverPath,
          officialDriverSha256: officialBinding.officialDriverSha256,
        },
      },
    );
    const mapJson = serializeEbnfParserNodeMap(map);
    if (map.counts.total !== CHENG_CURRENT_PARSER_RECEIPT_PRODUCTION_COUNT ||
        map.counts.requiredObligationCount !==
          CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT ||
        map.counts.MAPPED !== map.counts.total ||
        map.counts.PARTIAL !== 0 ||
        map.counts.UNMAPPED !== 0 ||
        map.counts.witnessedRequiredCount !==
          CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT ||
        map.counts.missingRequiredCount !== 0 ||
        map.receiptEvidence.acceptedCount !== receiptEvidence.length ||
        map.receiptEvidence.rejectedCount !== 0) {
      throw new Error("current_ingress_obligation_admission_incomplete");
    }

    const finalOfficialBinding = validateOfficialCurrentBuildBinding(
      input.officialCurrentBuildBindingPath,
    );
    const finalSourceSnapshot = validateCurrentSourceSnapshot(
      finalOfficialBinding.sourceSnapshotManifestPath,
      finalOfficialBinding.sourceSnapshotRoot,
    );
    const finalOfficialDriver = stableRegularFile(
      finalOfficialBinding.officialDriverPath,
      "current_official_driver",
      true,
    );
    const finalHarnessManifest = stableRegularFile(
      input.harnessManifestPath,
      "current_harness_manifest",
      true,
    );
    const finalToolClosure = await buildParserReceiptHarnessToolClosure(
      HARNESS_PATH,
      FUSION_ROOT,
    );
    const finalDependencyClosure = buildParserReceiptHarnessChengClosure(
      sourceSnapshotRoot,
      formalSpecPath,
    );
    const finalBuildCompiler = buildParserReceiptHarnessExecutableIdentity(
      CHENG_PARSER_RECEIPT_BUILD_COMPILER,
    );
    const finalRuntime = stableRegularFile(
      process.execPath,
      "harness_runtime",
    );
    validateParserProductionReceiptHarnessArtifactFiles(
      parseUniqueCurrentJson(
        finalHarnessManifest.bytes.toString("utf8"),
        "current_parser_receipt_harness_manifest",
      ),
      finalHarnessManifest.path,
    );
    if (canonicalJson(finalOfficialBinding) !==
          canonicalJson(officialBinding) ||
        canonicalJson(finalSourceSnapshot) !==
          canonicalJson(sourceSnapshot) ||
        !sameFileIdentity(officialDriver, finalOfficialDriver) ||
        !sameFileIdentity(harnessManifest, finalHarnessManifest) ||
        canonicalJson(finalDependencyClosure) !==
          canonicalJson(dependencyClosure) ||
        canonicalJson(finalToolClosure) !== canonicalJson(toolClosure) ||
        canonicalJson(finalBuildCompiler) !==
          canonicalJson(buildCompiler) ||
        !sameFileIdentity(runtime, finalRuntime) ||
        readCurrentChengGrammarCorpus(CORPUS_ROOT).generationId !==
          corpusSnapshot.generationId ||
        !sameFileIdentity(
          claims,
          stableRegularFile(CLAIMS_PATH, "producer_claims"),
        )) {
      throw new Error("current_ingress_identity_drift");
    }
    const report: CurrentParserReceiptIngressReport = {
      schema: CHENG_CURRENT_PARSER_RECEIPT_INGRESS_SCHEMA,
      status: "ADMITTED",
      reason: "",
      officialCurrentBuildBindingPath: officialBinding.bindingPath,
      officialCurrentBuildBindingSha256: officialBinding.bindingSha256,
      sourceSnapshotManifestPath: sourceSnapshot.manifestPath,
      sourceSnapshotManifestSha256: sourceSnapshot.manifestSha256,
      sourceSnapshotClosureSha256: sourceSnapshot.closureSha256,
      officialDriverPath: officialDriver.path,
      officialDriverSha256: officialDriver.sha256,
      harnessManifestPath: harnessManifest.path,
      harnessManifestSha256: harnessManifest.sha256,
      productionCount: map.counts.total,
      requiredObligationCount: map.counts.requiredObligationCount,
      witnessedObligationCount: map.counts.witnessedRequiredCount,
      missingObligationCount: map.counts.missingRequiredCount,
      receiptCount: receiptEvidence.length,
      admittedMapSha256: sha256(mapJson),
    };
    validateCurrentParserReceiptIngressReport(report);
    return {report, admittedMapJson: mapJson};
  } catch (error) {
    const report = hardRedReport(
      input,
      error instanceof Error ? error.message : String(error),
      {
        officialCurrentBuildBindingSha256: officialBinding?.bindingSha256,
        sourceSnapshotManifestSha256: sourceSnapshot?.manifestSha256,
        sourceSnapshotClosureSha256: sourceSnapshot?.closureSha256,
        officialDriverSha256: officialDriver?.sha256,
        harnessManifestSha256: harnessManifest?.sha256,
      },
    );
    validateCurrentParserReceiptIngressReport(report);
    return {report};
  }
}

export function validateCurrentParserReceiptIngressReport(
  value: unknown,
): asserts value is CurrentParserReceiptIngressReport {
  assertExactCurrentObjectKeys(value, [
    "schema",
    "status",
    "reason",
    "officialCurrentBuildBindingPath",
    "officialCurrentBuildBindingSha256",
    "sourceSnapshotManifestPath",
    "sourceSnapshotManifestSha256",
    "sourceSnapshotClosureSha256",
    "officialDriverPath",
    "officialDriverSha256",
    "harnessManifestPath",
    "harnessManifestSha256",
    "productionCount",
    "requiredObligationCount",
    "witnessedObligationCount",
    "missingObligationCount",
    "receiptCount",
    "admittedMapSha256",
  ], "current_parser_receipt_ingress_report");
  const report = value;
  if (report.schema !== CHENG_CURRENT_PARSER_RECEIPT_INGRESS_SCHEMA ||
      !["ADMITTED", "HARD_RED"].includes(report.status) ||
      typeof report.reason !== "string" ||
      report.productionCount !==
        CHENG_CURRENT_PARSER_RECEIPT_PRODUCTION_COUNT ||
      report.requiredObligationCount !==
        CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT ||
      !Number.isSafeInteger(report.receiptCount) ||
      report.receiptCount < 0) {
    throw new Error("current_ingress_report_header_invalid");
  }
  for (const path of [
    report.officialCurrentBuildBindingPath,
    report.harnessManifestPath,
  ]) {
    if (typeof path !== "string" || path !== resolve(path)) {
      throw new Error("current_ingress_report_path_invalid");
    }
  }
  for (const digest of [
    report.officialCurrentBuildBindingSha256,
    report.sourceSnapshotManifestSha256,
    report.sourceSnapshotClosureSha256,
    report.officialDriverSha256,
    report.harnessManifestSha256,
    report.admittedMapSha256,
  ]) {
    if (typeof digest !== "string" ||
        (digest !== "" && !SHA256.test(digest))) {
      throw new Error("current_ingress_report_sha_invalid");
    }
  }
  if (report.status === "HARD_RED") {
    if (report.reason === "" ||
        report.sourceSnapshotManifestPath !== "" ||
        report.officialDriverPath !== "" ||
        report.witnessedObligationCount !== 0 ||
        report.missingObligationCount !==
          CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT ||
        report.receiptCount !== 0 ||
        report.admittedMapSha256 !== "") {
      throw new Error("current_ingress_hard_red_must_not_witness");
    }
  } else if (report.reason !== "" ||
      report.sourceSnapshotManifestPath !==
        resolve(report.sourceSnapshotManifestPath) ||
      report.officialDriverPath !== resolve(report.officialDriverPath) ||
      report.witnessedObligationCount !==
        CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT ||
      report.missingObligationCount !== 0 ||
      report.receiptCount <= 0 ||
      !SHA256.test(report.officialCurrentBuildBindingSha256) ||
      !SHA256.test(report.sourceSnapshotManifestSha256) ||
      !SHA256.test(report.sourceSnapshotClosureSha256) ||
      !SHA256.test(report.officialDriverSha256) ||
      !SHA256.test(report.harnessManifestSha256) ||
      !SHA256.test(report.admittedMapSha256)) {
    throw new Error("current_ingress_admitted_report_incomplete");
  }
}

export function serializeCurrentParserReceiptIngressReport(
  report: CurrentParserReceiptIngressReport,
): string {
  validateCurrentParserReceiptIngressReport(report);
  return JSON.stringify(report, null, 2) + "\n";
}
