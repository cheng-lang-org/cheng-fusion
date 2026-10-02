import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
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
// 与绑定的 corpus.json(spec.productionCount/counts.requiredObligationCount)
// 同步重钉(2026-10-02: 126/976, TREE spec d188abe 新增 regionStmt)。
// TODO(ingress-derive): 常量还被 HARD_RED 报告与纯报告校验函数在无 corpus
// 访问时使用, 派生改造牵动面大; 先常量重钉, 后续把 witnessed 链改为与
// 绑定 corpus.json 的一致性校验。
export const CHENG_CURRENT_PARSER_RECEIPT_PRODUCTION_COUNT = 126;
export const CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT = 976;
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
const COLD_SCRATCH_MEMORY_LIMIT_BYTES = "1073741824";
const COLD_SCRATCH_STDOUT = Buffer.from(
  "cold_codegen_scratch_static_mutations_rejected=16\n" +
  "cold_codegen_scratch_lifetime_gate_status=PASS\n" +
  "cold_codegen_scratch_begin_count=4\n" +
  "cold_codegen_scratch_release_count=4\n" +
  "cold_codegen_scratch_failure_release_count=3\n" +
  "cold_codegen_scratch_live_count=0\n" +
  "cold_codegen_scratch_signal_recovery=PROVED\n" +
  "cold_codegen_scratch_carrier_restore=PROVED\n" +
  "cold_codegen_scratch_release_internal_failure=HARD_FAIL\n" +
  "cold_codegen_scratch_lifetime_gate_status=PASS\n",
  "utf8",
);
const COLD_SCRATCH_STDERR = Buffer.from(
  "cheng_cold: focused codegen scratch failure (recovery=1 depth=1)\n" +
  "cheng_cold: codegen scratch release failed with live owner\n",
  "utf8",
);
const COLD_SCRATCH_BOUND_FILE_ROLES = [
  "guard_report",
  "stdout",
  "stderr",
  "resource_trace",
  "argv_manifest",
  "env_manifest",
  "execution_manifest",
  "execution_evidence",
] as const;
const COLD_SCRATCH_BOUND_FILE_SUFFIXES = [
  "path_fshex",
  "sha256",
  "device",
  "inode",
  "mode",
  "nlink",
  "uid",
  "gid",
  "size",
  "mtime_ns",
  "ctime_ns",
] as const;
const COLD_SCRATCH_RECEIPT_KEY_ORDER: readonly string[] = [
  "schema",
  "status",
  ...COLD_SCRATCH_BOUND_FILE_ROLES.flatMap((role) =>
    COLD_SCRATCH_BOUND_FILE_SUFFIXES.map((suffix) => `${role}_${suffix}`)),
  "process_guard_path_fshex",
  "process_guard_sha256",
  "monitor_runtime_path_fshex",
  "monitor_runtime_sha256",
  "monitor_python_path_fshex",
  "monitor_python_sha256",
  "command_path_fshex",
  "command_sha256",
  "source_snapshot_root_fshex",
  "source_manifest_path_fshex",
  "source_manifest_sha256",
  "scratch_gate_path_fshex",
  "scratch_gate_sha256",
  "scratch_harness_path_fshex",
  "scratch_harness_sha256",
  "cold_source_path_fshex",
  "cold_source_sha256",
  "command_argv_sha256",
  "target_env_requested_sha256",
  "memory_limit_bytes",
  "formal_command_identity_status",
  "receipt_payload_sha256",
];
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
const OFFICIAL_BUILD_RECEIPT_KEY_ORDER = [
  "schema",
  "status",
  "driver_role",
  "source_manifest_sha256",
  "source_manifest_before_path_fshex",
  "source_manifest_after_path_fshex",
  "official_sha256",
  "cold_scratch_execution_receipt_path_fshex",
  "cold_scratch_execution_receipt_sha256",
  "install_receipt_path_fshex",
  "install_receipt_sha256",
  "publisher_receipt_path_fshex",
  "publisher_receipt_sha256",
  "source_postflight_status",
  "raw_bytes_fixed_point",
  "receipt_payload_sha256",
] as const;
const OFFICIAL_BUILD_RECEIPT_KEYS = new Set(
  OFFICIAL_BUILD_RECEIPT_KEY_ORDER,
);
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
  readonly rawMode: string;
  readonly mode: number;
  readonly linkCount: string;
  readonly uid: string;
  readonly gid: string;
  readonly modifiedNs: string;
  readonly changedNs: string;
}

interface StableFileSeal {
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly device: string;
  readonly inode: string;
  readonly rawMode: string;
  readonly mode: number;
  readonly linkCount: string;
  readonly uid: string;
  readonly gid: string;
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
      rawMode: before.mode.toString(8),
      mode: Number(before.mode & 0o7777n),
      linkCount: before.nlink.toString(),
      uid: before.uid.toString(),
      gid: before.gid.toString(),
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
    left.rawMode === right.rawMode &&
    left.mode === right.mode &&
    left.linkCount === right.linkCount &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.modifiedNs === right.modifiedNs &&
    left.changedNs === right.changedNs &&
    left.bytes.equals(right.bytes);
}

function stableRegularFileSeal(
  pathRaw: string,
  label: string,
  requireSingleLink = false,
): StableFileSeal {
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
    const digest = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let observed = 0;
    for (;;) {
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      digest.update(buffer.subarray(0, count));
      observed += count;
    }
    const after = fstatSync(fd, {bigint: true});
    const pathStat = lstatSync(path, {bigint: true});
    if (!sameStableStat(before, after) ||
        !sameStableStat(before, pathStat) ||
        observed !== Number(before.size)) {
      throw new Error(`${label}_drift`);
    }
    return {
      path,
      sha256: digest.digest("hex"),
      byteLength: observed,
      device: before.dev.toString(),
      inode: before.ino.toString(),
      rawMode: before.mode.toString(8),
      mode: Number(before.mode & 0o7777n),
      linkCount: before.nlink.toString(),
      uid: before.uid.toString(),
      gid: before.gid.toString(),
      modifiedNs: before.mtimeNs.toString(),
      changedNs: before.ctimeNs.toString(),
    };
  } finally {
    closeSync(fd);
  }
}

function sameFileSeal(
  left: StableFileSeal,
  right: StableFileSeal,
): boolean {
  return left.path === right.path &&
    left.sha256 === right.sha256 &&
    left.byteLength === right.byteLength &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.rawMode === right.rawMode &&
    left.mode === right.mode &&
    left.linkCount === right.linkCount &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.modifiedNs === right.modifiedNs &&
    left.changedNs === right.changedNs;
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

function requireExactKeyOrder(
  rows: ReadonlyMap<string, string>,
  expected: readonly string[],
  label: string,
): void {
  if ([...rows.keys()].join("\0") !== expected.join("\0")) {
    throw new Error(`${label}_key_order_invalid`);
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

function parseUniqueKv(
  file: StableFileIdentity,
  label: string,
): Map<string, string> {
  const text = file.bytes.toString("utf8");
  if (!text.endsWith("\n") || text.includes("\r") || text.includes("\0") ||
      Buffer.from(text, "utf8").length !== file.bytes.length) {
    throw new Error(`${label}_encoding_invalid`);
  }
  const rows = new Map<string, string>();
  for (const line of text.slice(0, -1).split("\n")) {
    const separator = line.indexOf("=");
    const key = line.slice(0, separator);
    if (separator <= 0 || rows.has(key)) {
      throw new Error(`${label}_row_invalid`);
    }
    rows.set(key, line.slice(separator + 1));
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

function requireSealedScratchArtifact(
  file: StableFileIdentity,
  label: string,
): void {
  if (file.mode !== 0o400 || file.linkCount !== "1" ||
      file.uid !== String(process.geteuid?.() ?? -1) ||
      file.gid !== String(process.getegid?.() ?? -1)) {
    throw new Error(`${label}_seal_invalid`);
  }
}

function scratchFrame(bytes: Buffer): Buffer {
  if (bytes.length >= 2 ** 32) {
    throw new Error("cold_scratch_frame_too_large");
  }
  const size = Buffer.allocUnsafe(4);
  size.writeUInt32BE(bytes.length);
  return Buffer.concat([size, bytes]);
}

function scratchArgvSha256(values: readonly string[]): string {
  const count = Buffer.allocUnsafe(4);
  count.writeUInt32BE(values.length);
  return sha256(Buffer.concat([
    scratchFrame(Buffer.from("cheng.guard.command_argv", "utf8")),
    count,
    ...values.map((value) => scratchFrame(Buffer.from(value, "utf8"))),
  ]));
}

function scratchEnvSha256(values: ReadonlyMap<string, string>): string {
  const keys = [...values.keys()].sort((left, right) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
  const count = Buffer.allocUnsafe(4);
  count.writeUInt32BE(keys.length);
  return sha256(Buffer.concat([
    scratchFrame(Buffer.from("cheng.guard.target_env", "utf8")),
    count,
    ...keys.flatMap((key) => [
      scratchFrame(Buffer.from(key, "utf8")),
      scratchFrame(Buffer.from(values.get(key) ?? "", "utf8")),
    ]),
  ]));
}

function decodeFsHexText(
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
      !Buffer.from(decoded, "utf8").equals(bytes)) {
    throw new Error(`${label}_text_invalid:${key}`);
  }
  return decoded;
}

function requireCanonicalOctal(value: string, label: string): string {
  if (!/^(?:0|[1-7][0-7]*)$/.test(value)) {
    throw new Error(`${label}_octal_invalid`);
  }
  return value;
}

function requirePhysicalFileRows(
  rows: ReadonlyMap<string, string>,
  prefix: string,
  file: StableFileIdentity,
  label: string,
): void {
  const declaredPath = decodeFsHexPath(
    rows,
    `${prefix}path_fshex`,
    label,
  );
  const declaredSha = requiredSha(rows, `${prefix}sha256`, label);
  const declaredMode = requireCanonicalOctal(
    requiredRow(rows, `${prefix}mode`, label),
    `${label}_mode`,
  );
  const expected = new Map<string, string>([
    ["path_fshex", file.path],
    ["sha256", file.sha256],
    ["device", file.device],
    ["inode", file.inode],
    ["mode", file.rawMode],
    ["nlink", file.linkCount],
    ["uid", file.uid],
    ["gid", file.gid],
    ["size", String(file.byteLength)],
    ["mtime_ns", file.modifiedNs],
    ["ctime_ns", file.changedNs],
  ]);
  if (declaredPath !== expected.get("path_fshex") ||
      declaredSha !== expected.get("sha256") ||
      declaredMode !== expected.get("mode")) {
    throw new Error(`${label}_physical_identity_invalid`);
  }
  for (const suffix of [
    "device",
    "inode",
    "nlink",
    "uid",
    "gid",
    "size",
    "mtime_ns",
    "ctime_ns",
  ] as const) {
    const declared = exactCanonicalUint(
      requiredRow(rows, `${prefix}${suffix}`, label),
      `${label}_${suffix}`,
    ).toString();
    if (declared !== expected.get(suffix)) {
      throw new Error(`${label}_physical_identity_invalid:${suffix}`);
    }
  }
}

function validateScratchArgvManifest(
  file: StableFileIdentity,
  expectedValues: readonly string[],
): void {
  const label = "cold_scratch_argv_manifest";
  const rows = parseUniqueKv(file, label);
  const count = Number(exactCanonicalUint(
    requiredRow(rows, "count", label),
    `${label}_count`,
  ));
  const expectedOrder = [
    "schema",
    "count",
    "sha256",
    ...expectedValues.map((_value, index) => `arg.${index}.fshex`),
  ];
  if (count !== expectedValues.length) {
    throw new Error(`${label}_count_invalid`);
  }
  requireExactKeyOrder(rows, expectedOrder, label);
  if (rows.get("schema") !== "cheng.guard.argv_manifest") {
    throw new Error(`${label}_schema_invalid`);
  }
  const values = expectedValues.map((_expected, index) =>
    decodeFsHexText(rows, `arg.${index}.fshex`, label));
  if (values.some((value, index) => value !== expectedValues[index])) {
    throw new Error(`${label}_value_invalid`);
  }
  const digest = scratchArgvSha256(values);
  if (requiredSha(rows, "sha256", label) !== digest) {
    throw new Error(`${label}_digest_invalid`);
  }
}

function validateScratchEnvManifest(
  file: StableFileIdentity,
  expectedValues: ReadonlyMap<string, string>,
): void {
  const label = "cold_scratch_env_manifest";
  const rows = parseUniqueKv(file, label);
  const expectedKeys = [...expectedValues.keys()].sort((left, right) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
  const count = Number(exactCanonicalUint(
    requiredRow(rows, "count", label),
    `${label}_count`,
  ));
  const expectedOrder = ["schema", "count", "sha256"];
  for (let index = 0; index < expectedKeys.length; index += 1) {
    expectedOrder.push(
      `entry.${index}.key_fshex`,
      `entry.${index}.value_fshex`,
    );
  }
  if (count !== expectedKeys.length) {
    throw new Error(`${label}_count_invalid`);
  }
  requireExactKeyOrder(rows, expectedOrder, label);
  if (rows.get("schema") !== "cheng.guard.env_manifest") {
    throw new Error(`${label}_schema_invalid`);
  }
  const observed = new Map<string, string>();
  for (let index = 0; index < count; index += 1) {
    const key = decodeFsHexText(
      rows,
      `entry.${index}.key_fshex`,
      label,
    );
    const value = decodeFsHexText(
      rows,
      `entry.${index}.value_fshex`,
      label,
    );
    if (observed.has(key) || key !== expectedKeys[index] ||
        value !== expectedValues.get(key)) {
      throw new Error(`${label}_value_invalid`);
    }
    observed.set(key, value);
  }
  if (requiredSha(rows, "sha256", label) !== scratchEnvSha256(observed)) {
    throw new Error(`${label}_digest_invalid`);
  }
}

function validateScratchExecutionManifest(
  file: StableFileIdentity,
  inputs: ReadonlyMap<string, StableFileIdentity>,
  outputs: ReadonlyMap<string, StableFileIdentity>,
): void {
  const label = "cold_scratch_execution_manifest";
  const rows = parseUniqueKv(file, label);
  const inputRoles = ["command", "monitor_runtime", "monitor_python"] as const;
  const outputRoles = [
    "report",
    "stdout",
    "stderr",
    "resource_trace",
  ] as const;
  const expectedOrder = ["schema"];
  for (const role of inputRoles) {
    for (const suffix of COLD_SCRATCH_BOUND_FILE_SUFFIXES) {
      expectedOrder.push(`input.${role}.${suffix}`);
    }
  }
  expectedOrder.push("output_count");
  for (let index = 0; index < outputRoles.length; index += 1) {
    expectedOrder.push(
      `output.${index}.role`,
      `output.${index}.path_fshex`,
      `output.${index}.expected_kind`,
      `output.${index}.expected_mode`,
      `output.${index}.expected_nlink`,
      `output.${index}.expected_uid`,
      `output.${index}.expected_gid`,
      `output.${index}.pre_run_status`,
    );
  }
  expectedOrder.push("manifest_payload_sha256");
  requireExactKeyOrder(rows, expectedOrder, label);
  if (rows.get("schema") !== "cheng.guard.execution_manifest" ||
      exactCanonicalUint(
        requiredRow(rows, "output_count", label),
        `${label}_output_count`,
      ) !== BigInt(outputRoles.length)) {
    throw new Error(`${label}_header_invalid`);
  }
  const lines = file.bytes.toString("utf8").slice(0, -1).split("\n");
  const payload = Buffer.from(`${lines.slice(0, -1).join("\n")}\n`, "utf8");
  if (requiredSha(rows, "manifest_payload_sha256", label) !==
      sha256(payload)) {
    throw new Error(`${label}_payload_sha_invalid`);
  }
  for (const role of inputRoles) {
    const input = inputs.get(role);
    if (input === undefined) {
      throw new Error(`${label}_input_missing:${role}`);
    }
    requirePhysicalFileRows(
      rows,
      `input.${role}.`,
      input,
      `${label}_input_${role}`,
    );
  }
  const expectedUid = String(process.geteuid?.() ?? -1);
  const expectedGid = String(process.getegid?.() ?? -1);
  for (let index = 0; index < outputRoles.length; index += 1) {
    const role = outputRoles[index]!;
    const output = outputs.get(role);
    if (output === undefined) {
      throw new Error(`${label}_output_missing:${role}`);
    }
    const prefix = `output.${index}.`;
    if (rows.get(`${prefix}role`) !== role ||
        decodeFsHexPath(rows, `${prefix}path_fshex`, label) !== output.path ||
        rows.get(`${prefix}expected_kind`) !== "regular" ||
        rows.get(`${prefix}expected_mode`) !== "100400" ||
        rows.get(`${prefix}expected_nlink`) !== "1" ||
        rows.get(`${prefix}expected_uid`) !== expectedUid ||
        rows.get(`${prefix}expected_gid`) !== expectedGid ||
        rows.get(`${prefix}pre_run_status`) !== "absent") {
      throw new Error(`${label}_output_invalid:${role}`);
    }
  }
}

const CURRENT_SOURCE_MANIFEST_SCHEMA =
  "cheng.current_source_closure_manifest";
const CURRENT_SOURCE_CONTENT_CID_DOMAIN =
  Buffer.from("cheng.current_source_closure.content.cid", "utf8");
const CURRENT_SOURCE_MAX_PATH_COUNT = 1_000_000;
const CURRENT_SOURCE_MAX_PATH_BYTES = 64 * 1024 * 1024;
const CURRENT_SOURCE_MAX_FILE_BYTES = 8 * 1024 * 1024 * 1024;
const SNAPSHOT_DIRECTORY_MODE = 0o500;
const SNAPSHOT_REGULAR_MODE = 0o400;
const SNAPSHOT_EXECUTABLE_MODE = 0o500;

interface CurrentSourceManifestMember {
  readonly relativePath: string;
  readonly relativeBytes: Buffer;
  readonly state: "tracked" | "untracked" | "tracked_deleted";
  readonly sha256: string;
  readonly mode: bigint;
  readonly size: number;
}

interface CurrentSourceManifestIdentity {
  readonly file: StableFileIdentity;
  readonly members: readonly CurrentSourceManifestMember[];
}

interface StableDirectoryIdentity {
  readonly path: string;
  readonly device: string;
  readonly inode: string;
  readonly mode: number;
  readonly linkCount: string;
  readonly uid: string;
  readonly gid: string;
  readonly modifiedNs: string;
  readonly changedNs: string;
}

function exactCanonicalUint(raw: string, label: string): bigint {
  if (!CANONICAL_UINT.test(raw)) {
    throw new Error(`${label}_uint_invalid`);
  }
  return BigInt(raw);
}

function exactUtf8Path(raw: Buffer, label: string): string {
  const decoded = raw.toString("utf8");
  if (!Buffer.from(decoded, "utf8").equals(raw)) {
    throw new Error(`${label}_utf8_invalid`);
  }
  return decoded;
}

function requireCanonicalRelativePath(
  path: string,
  label: string,
): void {
  const components = path.split("/");
  if (path === "" || path.startsWith("/") ||
      components.some((component) =>
        component === "" || component === "." || component === ".."
      )) {
    throw new Error(`${label}_relative_path_invalid`);
  }
}

function scratchFrame64(bytes: Buffer): Buffer {
  const size = Buffer.allocUnsafe(8);
  size.writeBigUInt64BE(BigInt(bytes.length));
  return Buffer.concat([size, bytes]);
}

function scratchCount64(value: number): Buffer {
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes;
}

function currentSourceContentCid(
  head: Buffer,
  scopes: readonly Buffer[],
  members: readonly CurrentSourceManifestMember[],
): string {
  const digest = createHash("sha256");
  digest.update(scratchFrame64(CURRENT_SOURCE_CONTENT_CID_DOMAIN));
  digest.update(scratchFrame64(head));
  digest.update(scratchCount64(scopes.length));
  for (const scope of scopes) {
    digest.update(scratchFrame64(scope));
  }
  digest.update(scratchCount64(members.length));
  for (const member of members) {
    digest.update(scratchFrame64(member.relativeBytes));
    digest.update(scratchFrame64(Buffer.from(member.state, "utf8")));
    if (member.state === "tracked_deleted") {
      continue;
    }
    digest.update(Buffer.from(member.sha256, "hex"));
    digest.update(Buffer.from([(member.mode & 0o111n) === 0n ? 0 : 1]));
    const size = Buffer.allocUnsafe(8);
    size.writeBigUInt64BE(BigInt(member.size));
    digest.update(size);
  }
  return digest.digest("hex");
}

function parseCurrentSourceManifest(
  file: StableFileIdentity,
): CurrentSourceManifestIdentity {
  const label = "cold_scratch_source_manifest";
  if (file.byteLength > CURRENT_SOURCE_MAX_PATH_BYTES * 4) {
    throw new Error(`${label}_size_invalid`);
  }
  const text = file.bytes.toString("utf8");
  if (!text.endsWith("\n") || text.includes("\r") || text.includes("\0") ||
      !Buffer.from(text, "utf8").equals(file.bytes)) {
    throw new Error(`${label}_encoding_invalid`);
  }
  const lines = text.slice(0, -1).split("\n");
  let cursor = 0;
  const take = (prefix: string): string => {
    const line = lines[cursor++];
    if (line === undefined || !line.startsWith(prefix)) {
      throw new Error(`${label}_field_missing:${prefix}`);
    }
    return line.slice(prefix.length);
  };
  if (take("schema=") !== CURRENT_SOURCE_MANIFEST_SCHEMA) {
    throw new Error(`${label}_schema_invalid`);
  }
  const headRaw = take("head=");
  if (!/^[0-9a-f]{40}$/.test(headRaw)) {
    throw new Error(`${label}_head_invalid`);
  }
  const scopeCount = Number(exactCanonicalUint(
    take("scope_count="),
    `${label}_scope_count`,
  ));
  if (scopeCount <= 0 || scopeCount > CURRENT_SOURCE_MAX_PATH_COUNT) {
    throw new Error(`${label}_scope_count_invalid`);
  }
  const scopes: Buffer[] = [];
  const scopePaths: string[] = [];
  for (let index = 0; index < scopeCount; index += 1) {
    const raw = take("scope=");
    if (!LOWER_HEX.test(raw)) {
      throw new Error(`${label}_scope_hex_invalid`);
    }
    const bytes = Buffer.from(raw, "hex");
    const path = exactUtf8Path(bytes, `${label}_scope`);
    requireCanonicalRelativePath(path, `${label}_scope`);
    scopes.push(bytes);
    scopePaths.push(path);
  }
  for (let index = 1; index < scopes.length; index += 1) {
    if (Buffer.compare(scopes[index - 1]!, scopes[index]!) >= 0) {
      throw new Error(`${label}_scope_order_invalid`);
    }
  }
  const pathCount = Number(exactCanonicalUint(
    take("path_count="),
    `${label}_path_count`,
  ));
  if (pathCount > CURRENT_SOURCE_MAX_PATH_COUNT) {
    throw new Error(`${label}_path_count_invalid`);
  }
  const claimedContentCid = take("content_cid=");
  if (!SHA256.test(claimedContentCid)) {
    throw new Error(`${label}_content_cid_invalid`);
  }
  const members: CurrentSourceManifestMember[] = [];
  let pathBytes = 0;
  for (let index = 0; index < pathCount; index += 1) {
    const line = lines[cursor++];
    if (line === undefined) {
      throw new Error(`${label}_path_row_missing`);
    }
    const columns = line.split("\t");
    if (!LOWER_HEX.test(columns[0] ?? "")) {
      throw new Error(`${label}_path_hex_invalid`);
    }
    const relativeBytes = Buffer.from(columns[0]!, "hex");
    pathBytes += relativeBytes.length;
    if (pathBytes > CURRENT_SOURCE_MAX_PATH_BYTES) {
      throw new Error(`${label}_path_bytes_invalid`);
    }
    const relativePath = exactUtf8Path(
      relativeBytes,
      `${label}_member_path`,
    );
    requireCanonicalRelativePath(relativePath, `${label}_member_path`);
    if (!scopePaths.some((scope) =>
      relativePath === scope || relativePath.startsWith(`${scope}/`)
    )) {
      throw new Error(`${label}_member_outside_scope`);
    }
    if (columns.length === 2 && columns[1] === "tracked_deleted") {
      members.push({
        relativePath,
        relativeBytes,
        state: "tracked_deleted",
        sha256: "",
        mode: 0n,
        size: 0,
      });
      continue;
    }
    if (columns.length !== 9 ||
        (columns[1] !== "tracked" && columns[1] !== "untracked") ||
        !SHA256.test(columns[2] ?? "")) {
      throw new Error(`${label}_path_row_invalid`);
    }
    for (const [columnIndex, field] of [
      [3, "device"],
      [4, "inode"],
      [5, "mode"],
      [6, "size"],
      [7, "mtime_ns"],
      [8, "ctime_ns"],
    ] as const) {
      exactCanonicalUint(
        columns[columnIndex]!,
        `${label}_${field}`,
      );
    }
    const mode = BigInt(columns[5]!);
    const sizeBig = BigInt(columns[6]!);
    if ((mode & 0o170000n) !== 0o100000n ||
        sizeBig > BigInt(CURRENT_SOURCE_MAX_FILE_BYTES) ||
        sizeBig > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`${label}_member_identity_invalid`);
    }
    members.push({
      relativePath,
      relativeBytes,
      state: columns[1],
      sha256: columns[2]!,
      mode,
      size: Number(sizeBig),
    });
  }
  if (cursor !== lines.length) {
    throw new Error(`${label}_trailing_rows`);
  }
  for (let index = 1; index < members.length; index += 1) {
    if (Buffer.compare(
      members[index - 1]!.relativeBytes,
      members[index]!.relativeBytes,
    ) >= 0) {
      throw new Error(`${label}_member_order_invalid`);
    }
  }
  const contentCid = currentSourceContentCid(
    Buffer.from(headRaw, "utf8"),
    scopes,
    members,
  );
  if (contentCid !== claimedContentCid) {
    throw new Error(`${label}_content_cid_mismatch`);
  }
  return {file, members};
}

function stableSnapshotDirectory(
  pathRaw: string,
  expectedOwner?: readonly [string, string],
): StableDirectoryIdentity {
  const path = resolve(pathRaw);
  if (realpathSync(path) !== path) {
    throw new Error("cold_scratch_snapshot_directory_not_canonical");
  }
  const stat = lstatSync(path, {bigint: true});
  if (!stat.isDirectory() || stat.isSymbolicLink() ||
      Number(stat.mode & 0o7777n) !== SNAPSHOT_DIRECTORY_MODE ||
      (expectedOwner !== undefined &&
        (stat.uid.toString() !== expectedOwner[0] ||
          stat.gid.toString() !== expectedOwner[1]))) {
    throw new Error("cold_scratch_snapshot_directory_invalid");
  }
  return {
    path,
    device: stat.dev.toString(),
    inode: stat.ino.toString(),
    mode: Number(stat.mode & 0o7777n),
    linkCount: stat.nlink.toString(),
    uid: stat.uid.toString(),
    gid: stat.gid.toString(),
    modifiedNs: stat.mtimeNs.toString(),
    changedNs: stat.ctimeNs.toString(),
  };
}

function sameDirectoryIdentity(
  left: StableDirectoryIdentity,
  right: StableDirectoryIdentity,
): boolean {
  return left.path === right.path &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.mode === right.mode &&
    left.linkCount === right.linkCount &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.modifiedNs === right.modifiedNs &&
    left.changedNs === right.changedNs;
}

function validateColdScratchSourceSnapshot(
  rootRaw: string,
  manifest: CurrentSourceManifestIdentity,
): {
  readonly files: readonly StableFileSeal[];
  readonly directories: readonly StableDirectoryIdentity[];
} {
  const root = resolve(rootRaw);
  const rootIdentity = stableSnapshotDirectory(root);
  const owner = [rootIdentity.uid, rootIdentity.gid] as const;
  const expected = new Map(
    manifest.members
      .filter((member) => member.state !== "tracked_deleted")
      .map((member) => [member.relativePath, member] as const),
  );
  const files: StableFileSeal[] = [];
  const directories: StableDirectoryIdentity[] = [];
  const actual: string[] = [];
  const visit = (directoryPath: string): void => {
    const directory = stableSnapshotDirectory(directoryPath, owner);
    directories.push(directory);
    const names = readdirSync(directoryPath).sort((left, right) =>
      Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
    for (const name of names) {
      const path = join(directoryPath, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        throw new Error("cold_scratch_snapshot_symlink");
      }
      if (stat.isDirectory()) {
        visit(path);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error("cold_scratch_snapshot_nonregular");
      }
      const relativePath = relative(root, path);
      requireCanonicalRelativePath(
        relativePath,
        "cold_scratch_snapshot_member",
      );
      const member = expected.get(relativePath);
      if (member === undefined) {
        throw new Error(
          `cold_scratch_snapshot_unmanifested:${relativePath}`,
        );
      }
      const file = stableRegularFileSeal(
        path,
        `cold_scratch_snapshot_member:${relativePath}`,
        true,
      );
      const expectedMode = (member.mode & 0o111n) === 0n
        ? SNAPSHOT_REGULAR_MODE
        : SNAPSHOT_EXECUTABLE_MODE;
      if (file.uid !== owner[0] || file.gid !== owner[1] ||
          file.mode !== expectedMode ||
          file.byteLength !== member.size ||
          file.sha256 !== member.sha256) {
        throw new Error(
          `cold_scratch_snapshot_member_drift:${relativePath}`,
        );
      }
      files.push(file);
      actual.push(relativePath);
    }
  };
  visit(root);
  const expectedPaths = [...expected.keys()].sort((left, right) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
  actual.sort((left, right) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
  if (actual.join("\0") !== expectedPaths.join("\0")) {
    throw new Error("cold_scratch_snapshot_path_set_mismatch");
  }
  return {files, directories};
}

interface ColdScratchExecutionIdentity {
  readonly receipt: StableFileIdentity;
  readonly files: readonly StableFileIdentity[];
  readonly multiLinkFiles: readonly StableFileIdentity[];
  readonly snapshotFiles: readonly StableFileSeal[];
  readonly snapshotDirectories: readonly StableDirectoryIdentity[];
}

function validateColdScratchExecutionReceipt(
  receiptPath: string,
  expectedSha256: string,
  workspaceRoot: string,
  expectedSourceManifest: StableFileIdentity,
): ColdScratchExecutionIdentity {
  const receiptRoot = dirname(receiptPath);
  if (receiptPath !== join(receiptRoot, "receipt.kv") ||
      basename(receiptRoot) !== "cold-scratch-execution" ||
      receiptRoot !== join(
        dirname(expectedSourceManifest.path),
        "cold-scratch-execution",
      )) {
    throw new Error("cold_scratch_execution_receipt_layout_invalid");
  }
  const receipt = stableRegularFile(
    receiptPath,
    "cold_scratch_execution_receipt",
    true,
  );
  requireSealedScratchArtifact(receipt, "cold_scratch_execution_receipt");
  requireFileHash(
    receipt,
    expectedSha256,
    "cold_scratch_execution_receipt",
  );
  const rows = parseHashedKv(
    receipt,
    "cold_scratch_execution_receipt",
    new Set(COLD_SCRATCH_RECEIPT_KEY_ORDER),
  );
  requireExactKeyOrder(
    rows,
    COLD_SCRATCH_RECEIPT_KEY_ORDER,
    "cold_scratch_execution_receipt",
  );
  if (rows.get("schema") !==
        "cheng.backend2.current_source_cold_scratch_execution_receipt" ||
      rows.get("status") !== "PASS") {
    throw new Error("cold_scratch_execution_receipt_header_invalid");
  }

  const sourceSnapshotRoot = decodeFsHexPath(
    rows,
    "source_snapshot_root_fshex",
    "cold_scratch_execution_receipt",
  );
  const sourceManifestPath = decodeFsHexPath(
    rows,
    "source_manifest_path_fshex",
    "cold_scratch_execution_receipt",
  );
  if (sourceSnapshotRoot !== join(dirname(receiptRoot), "source-snapshot") ||
      sourceManifestPath !== expectedSourceManifest.path ||
      requiredSha(
        rows,
        "source_manifest_sha256",
        "cold_scratch_execution_receipt",
      ) !== expectedSourceManifest.sha256) {
    throw new Error("cold_scratch_source_manifest_binding_invalid");
  }
  const sourceManifest = parseCurrentSourceManifest(expectedSourceManifest);
  const sourceSnapshot = validateColdScratchSourceSnapshot(
    sourceSnapshotRoot,
    sourceManifest,
  );
  const expectedPaths = new Map<string, string>([
    ["guard_report", join(receiptRoot, "guard-report.kv")],
    ["stdout", join(receiptRoot, "stdout.txt")],
    ["stderr", join(receiptRoot, "stderr.txt")],
    ["resource_trace", join(receiptRoot, "resource-trace.tsv")],
    ["argv_manifest", join(receiptRoot, "argv-manifest.kv")],
    ["env_manifest", join(receiptRoot, "env-manifest.kv")],
    ["execution_manifest", join(receiptRoot, "execution-manifest.kv")],
    [
      "execution_evidence",
      join(workspaceRoot, "tools/backend2_current_source_official_evidence"),
    ],
    ["process_guard", join(workspaceRoot, "tools/beat_c_process_group_guard.sh")],
    [
      "monitor_runtime",
      join(workspaceRoot, "tools/beat_c_process_group_guard_runtime.py"),
    ],
    [
      "scratch_gate",
      join(sourceSnapshotRoot, "tools/cold_codegen_scratch_lifetime_gate.sh"),
    ],
    [
      "scratch_harness",
      join(sourceSnapshotRoot, "tools/cold_codegen_scratch_lifetime_gate.c"),
    ],
    ["cold_source", join(sourceSnapshotRoot, "bootstrap/cheng_cold.c")],
  ]);
  const states = new Map<string, StableFileIdentity>();
  for (const [label, expectedPath] of expectedPaths) {
    const path = decodeFsHexPath(
      rows,
      `${label}_path_fshex`,
      "cold_scratch_execution_receipt",
    );
    if (path !== expectedPath) {
      throw new Error(`cold_scratch_execution_${label}_path_invalid`);
    }
    const state = stableRegularFile(
      path,
      `cold_scratch_execution_${label}`,
      !COLD_SCRATCH_BOUND_FILE_ROLES.includes(
        label as typeof COLD_SCRATCH_BOUND_FILE_ROLES[number],
      ),
    );
    requireFileHash(
      state,
      requiredSha(
        rows,
        `${label}_sha256`,
        "cold_scratch_execution_receipt",
      ),
      `cold_scratch_execution_${label}`,
    );
    states.set(label, state);
  }
  for (const role of COLD_SCRATCH_BOUND_FILE_ROLES) {
    requirePhysicalFileRows(
      rows,
      `${role}_`,
      states.get(role)!,
      `cold_scratch_execution_${role}`,
    );
  }
  const monitorPythonPath = decodeFsHexPath(
    rows,
    "monitor_python_path_fshex",
    "cold_scratch_execution_receipt",
  );
  const monitorPython = stableRegularFile(
    monitorPythonPath,
    "cold_scratch_execution_monitor_python",
  );
  requireFileHash(
    monitorPython,
    requiredSha(
      rows,
      "monitor_python_sha256",
      "cold_scratch_execution_receipt",
    ),
    "cold_scratch_execution_monitor_python",
  );
  const commandPath = decodeFsHexPath(
    rows,
    "command_path_fshex",
    "cold_scratch_execution_receipt",
  );
  const scratchGate = states.get("scratch_gate")!;
  if (commandPath !==
        join(workspaceRoot, "tools/cold_codegen_scratch_lifetime_gate.sh")) {
    throw new Error("cold_scratch_execution_command_path_invalid");
  }
  const command = stableRegularFile(
    commandPath,
    "cold_scratch_execution_command",
    true,
  );
  requireFileHash(
    command,
    requiredSha(
      rows,
      "command_sha256",
      "cold_scratch_execution_receipt",
    ),
    "cold_scratch_execution_command",
  );
  if (command.sha256 !== scratchGate.sha256 ||
      (command.mode & 0o111) === 0 ||
      (states.get("process_guard")!.mode & 0o111) === 0 ||
      (monitorPython.mode & 0o111) === 0 ||
      (states.get("execution_evidence")!.mode & 0o111) === 0 ||
      states.get("execution_evidence")!.linkCount !== "1") {
    throw new Error("cold_scratch_execution_executable_identity_invalid");
  }

  for (const label of [
    "guard_report",
    "stdout",
    "stderr",
    "resource_trace",
    "argv_manifest",
    "env_manifest",
    "execution_manifest",
  ]) {
    requireSealedScratchArtifact(
      states.get(label)!,
      `cold_scratch_execution_${label}`,
    );
  }
  if (!states.get("stdout")!.bytes.equals(COLD_SCRATCH_STDOUT)) {
    throw new Error("cold_scratch_execution_stdout_invalid");
  }
  if (!states.get("stderr")!.bytes.equals(COLD_SCRATCH_STDERR)) {
    throw new Error("cold_scratch_execution_stderr_invalid");
  }
  if (states.get("resource_trace")!.byteLength === 0) {
    throw new Error("cold_scratch_execution_resource_trace_empty");
  }

  const expectedEnv = new Map([
    ["HOME", "/var/empty"],
    ["LANG", "C"],
    ["LC_ALL", "C"],
    ["PATH", `${dirname(monitorPython.path)}:/usr/bin:/bin`],
    ["TMPDIR", "/private/var/tmp"],
  ]);
  const expectedArgvSha256 = scratchArgvSha256([
    command.path,
    "--root",
    sourceSnapshotRoot,
  ]);
  const expectedEnvSha256 = scratchEnvSha256(expectedEnv);
  if (rows.get("command_argv_sha256") !== expectedArgvSha256 ||
      rows.get("target_env_requested_sha256") !== expectedEnvSha256 ||
      rows.get("memory_limit_bytes") !== COLD_SCRATCH_MEMORY_LIMIT_BYTES ||
      rows.get("formal_command_identity_status") !== "required_verified") {
    throw new Error("cold_scratch_execution_authority_invalid");
  }
  validateScratchArgvManifest(
    states.get("argv_manifest")!,
    [command.path, "--root", sourceSnapshotRoot],
  );
  validateScratchEnvManifest(
    states.get("env_manifest")!,
    expectedEnv,
  );
  validateScratchExecutionManifest(
    states.get("execution_manifest")!,
    new Map([
      ["command", command],
      ["monitor_runtime", states.get("monitor_runtime")!],
      ["monitor_python", monitorPython],
    ]),
    new Map([
      ["report", states.get("guard_report")!],
      ["stdout", states.get("stdout")!],
      ["stderr", states.get("stderr")!],
      ["resource_trace", states.get("resource_trace")!],
    ]),
  );

  const guardReport = states.get("guard_report")!;
  const guardRows = parseUniqueKv(
    guardReport,
    "cold_scratch_guard_report",
  );
  const enforcedPeak = exactCanonicalUint(
    requiredRow(
      guardRows,
      "process_tree_enforced_peak_bytes",
      "cold_scratch_guard_report",
    ),
    "cold_scratch_guard_report_peak",
  );
  if (enforcedPeak > BigInt(COLD_SCRATCH_MEMORY_LIMIT_BYTES) ||
      guardRows.get("process_tree_escape_pid") !== "0") {
    throw new Error("cold_scratch_guard_report_memory_invalid");
  }
  const expectedGuardRows = new Map<string, string>([
    ["schema", "beat_c_process_memory_guard"],
    ["status", "completed"],
    ["rc", "0"],
    ["abort_reason", ""],
    ["expected_exit_code", "0"],
    ["actual_exit_code", "0"],
    ["exit_code_contract_status", "verified"],
    ["memory_guard_mode", "process_tree"],
    ["memory_limit_bytes", COLD_SCRATCH_MEMORY_LIMIT_BYTES],
    ["memory_measurement_status", "available"],
    ["combined_output_limit_status", "within_limit"],
    ["combined_output_failure_class", ""],
    ["tracked_output_count", "0"],
    ["formal_command_identity_status", "required_verified"],
    ["command_identity_status", "available"],
    ["command_path", command.path],
    ["command_sha256", command.sha256],
    ["command_execution_mode", "private_single_link_snapshot"],
    ["command_execution_snapshot_sha256", command.sha256],
    ["command_argv_count", "3"],
    ["command_argv_sha256", expectedArgvSha256],
    ["target_env_mode", "exact"],
    ["target_env_requested_count", String(expectedEnv.size)],
    ["target_env_requested_sha256", expectedEnvSha256],
    ["monitor_python_path", monitorPython.path],
    ["monitor_python_sha256", monitorPython.sha256],
    ["monitor_runtime_script_path", states.get("monitor_runtime")!.path],
    ["monitor_runtime_script_sha256", states.get("monitor_runtime")!.sha256],
    [
      "monitor_runtime_script_invocation_status",
      "verified_o_nofollow_loader_fd9",
    ],
    ["monitor_runtime_script_expected_sha_match", "1"],
    ["output_path_history_status", "verified_clean"],
    ["report_path", guardReport.path],
  ]);
  for (const label of ["stdout", "stderr", "resource_trace"] as const) {
    const state = states.get(label)!;
    expectedGuardRows.set(`${label}_status`, "available");
    expectedGuardRows.set(`${label}_path`, state.path);
    expectedGuardRows.set(`${label}_sha256`, state.sha256);
    expectedGuardRows.set(`${label}_size`, String(state.byteLength));
  }
  for (const [key, expected] of expectedGuardRows) {
    if (guardRows.get(key) !== expected) {
      throw new Error(`cold_scratch_guard_report_binding_invalid:${key}`);
    }
  }
  for (const label of ["report", "stdout", "stderr", "resource_trace"]) {
    const state = label === "report"
      ? guardReport
      : states.get(label)!;
    for (const [suffix, expected] of [
      ["device", state.device],
      ["inode", state.inode],
    ] as const) {
      if (guardRows.get(`${label}_${suffix}`) !== expected) {
        throw new Error(
          `cold_scratch_guard_report_artifact_identity_invalid:` +
          `${label}_${suffix}`,
        );
      }
    }
  }

  return {
    receipt,
    files: [
      receipt,
      ...states.values(),
      command,
    ],
    multiLinkFiles: [monitorPython],
    snapshotFiles: sourceSnapshot.files,
    snapshotDirectories: sourceSnapshot.directories,
  };
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
  requireExactKeyOrder(
    officialBuildRows,
    OFFICIAL_BUILD_RECEIPT_KEY_ORDER,
    "official_current_build_receipt",
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

  const workspaceRoot = dirname(dirname(dirname(expectedOfficialDriver)));
  if (expectedOfficialDriver !==
      join(workspaceRoot, "artifacts/backend_driver/cheng")) {
    throw new Error("official_current_workspace_layout_invalid");
  }
  const coldScratchExecutionReceiptPath = decodeFsHexPath(
    officialBuildRows,
    "cold_scratch_execution_receipt_path_fshex",
    "official_current_build_receipt",
  );
  const coldScratchExecution = validateColdScratchExecutionReceipt(
    coldScratchExecutionReceiptPath,
    requiredSha(
      officialBuildRows,
      "cold_scratch_execution_receipt_sha256",
      "official_current_build_receipt",
    ),
    workspaceRoot,
    manifestBefore,
  );

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
    ...coldScratchExecution.files.map((file, index) =>
      [file, `official_current_cold_scratch_${index}`] as const
    ),
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
  for (const before of coldScratchExecution.multiLinkFiles) {
    if (!sameFileIdentity(
      before,
      stableRegularFile(
        before.path,
        "official_current_cold_scratch_multilink",
      ),
    )) {
      throw new Error("official_current_cold_scratch_multilink_drift");
    }
  }
  for (const before of coldScratchExecution.snapshotFiles) {
    if (!sameFileSeal(
      before,
      stableRegularFileSeal(
        before.path,
        "official_current_cold_scratch_snapshot_file",
        true,
      ),
    )) {
      throw new Error("official_current_cold_scratch_snapshot_file_drift");
    }
  }
  for (const before of coldScratchExecution.snapshotDirectories) {
    if (!sameDirectoryIdentity(
      before,
      stableSnapshotDirectory(
        before.path,
        [before.uid, before.gid],
      ),
    )) {
      throw new Error("official_current_cold_scratch_snapshot_directory_drift");
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
