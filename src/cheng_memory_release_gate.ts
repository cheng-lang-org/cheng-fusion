import {createHash} from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  type BigIntStats,
} from "node:fs";
import {dirname, isAbsolute, join, relative, resolve, sep} from "node:path";
import {
  verifyLinuxCgroupEvidenceDirectory,
} from "./cheng_cid_identity_chain_evidence.ts";

export const CHENG_MEMORY_RELEASE_GATE_SCHEMA =
  "cheng.memory_release_gate" as const;
export const CHENG_MEMORY_RELEASE_RECEIPT_SCHEMA =
  "cheng.memory_release_receipt" as const;
export const CHENG_MEMORY_RELEASE_DRIVER_RECEIPT_SCHEMA =
  "cheng.memory_release_driver_receipt" as const;
export const CHENG_MEMORY_RELEASE_GATE_STATUS =
  "MEMORY_RELEASE_GREEN" as const;

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const UINT_PATTERN = /^(0|[1-9][0-9]*)$/;
const EMPTY_SHA256 = createHash("sha256").digest("hex");
const MAX_JSON_BYTES = 16 * 1024 * 1024;
// LifetimeLedger owns exactly six storage sequences (categoryNames, ownerNames,
// ownerClosed, objects, borrows, categoryMetrics). Every one of them must go
// through the release path — that is the structural fact and it is invariant.
// How many of them actually held a buffer to free is a separate, physical fact:
// a component that legitimately never borrows frees five, not six. The two are
// asserted separately; neither may stand in for the other.
const LEDGER_STORAGE_SEQUENCE_COUNT = 6n;

export const CHENG_MEMORY_RELEASE_TARGETS = Object.freeze([
  "aarch64-unknown-linux-gnu",
  "x86_64-unknown-linux-gnu",
] as const);
export const CHENG_MEMORY_RELEASE_BACKENDS = Object.freeze([
  "primary",
  "backend2",
] as const);
export const CHENG_MEMORY_RELEASE_OUTCOMES = Object.freeze([
  "success",
  "failure_matrix",
] as const);
export const CHENG_MEMORY_RELEASE_FAILURE_PATHS = Object.freeze([
  "source_admission_failure",
  "parser_failure",
  "csg_failure",
  "lowering_failure",
  "backend_failure",
  "emit_failure",
] as const);

type MemoryReleaseTarget = typeof CHENG_MEMORY_RELEASE_TARGETS[number];
type MemoryReleaseBackend = typeof CHENG_MEMORY_RELEASE_BACKENDS[number];
type MemoryReleaseOutcome = typeof CHENG_MEMORY_RELEASE_OUTCOMES[number];

const RECEIPT_COMPONENTS = Object.freeze([
  "production_entry",
  "compiler_csg",
  "lowering",
  "body_ir",
] as const);

interface JsonObject {
  readonly [key: string]: unknown;
}

interface ArtifactPin {
  readonly path: string;
  readonly byteLength: number;
  readonly bytesRaw32: string;
}

interface DriverPin {
  readonly targetTriple: MemoryReleaseTarget;
  readonly artifact: ArtifactPin;
}

interface GateCase {
  readonly caseId: string;
  readonly targetTriple: MemoryReleaseTarget;
  readonly backend: MemoryReleaseBackend;
  readonly outcome: MemoryReleaseOutcome;
  readonly cgroupEvidenceDirectory: string;
  readonly cgroupReceiptRaw32: string;
  readonly releaseReceiptRaw32: string;
}

interface MemoryReleaseManifest {
  readonly schema: typeof CHENG_MEMORY_RELEASE_GATE_SCHEMA;
  readonly evidenceKind: "production";
  readonly sourceClosure: ArtifactPin;
  readonly workloadRunner: ArtifactPin;
  readonly drivers: readonly DriverPin[];
  readonly cases: readonly GateCase[];
  readonly manifestSha256: string;
}

interface LedgerRow {
  readonly pathKind: string;
  readonly component: string;
  readonly receiptKind: string;
  readonly producerOperation: string;
  readonly stateMachineReceiptCid: string;
  readonly entered: boolean;
  readonly allocated: bigint;
  readonly released: bigint;
  readonly live: bigint;
  readonly allocatedBytes: bigint;
  readonly releasedBytes: bigint;
  readonly liveBytes: bigint;
  readonly physicalBufferCount: bigint;
  readonly physicalFreeCount: bigint;
  readonly storageReleased: boolean;
  readonly ledgerStorageReleased: boolean;
  readonly ledgerStorageReleasedSequenceCount: bigint;
  readonly ledgerStorageReleasedBufferCount: bigint;
  readonly ledgerStorageReleasedBytes: bigint;
}

interface OrcRow {
  readonly pathKind: string;
  readonly iterations: bigint;
  readonly allocCount: bigint;
  readonly freeCount: bigint;
  readonly liveCount: bigint;
  readonly retainCount: bigint;
  readonly releaseCount: bigint;
}

export interface MemoryReleaseReceiptValidation {
  readonly caseId: string;
  readonly targetTriple: MemoryReleaseTarget;
  readonly backend: MemoryReleaseBackend;
  readonly outcome: MemoryReleaseOutcome;
  readonly receiptSha256: string;
  readonly pathCount: number;
  readonly ledgerRowCount: number;
  readonly orcRowCount: number;
}

export interface MemoryReleaseGateValidation {
  readonly schema: typeof CHENG_MEMORY_RELEASE_GATE_SCHEMA;
  readonly status: typeof CHENG_MEMORY_RELEASE_GATE_STATUS;
  readonly manifestSha256: string;
  readonly caseIds: readonly string[];
  readonly targets: readonly MemoryReleaseTarget[];
}

function fail(message: string): never {
  throw new Error(`memory release gate: ${message}`);
}

export function memoryReleaseCanonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("canonical JSON contains a non-safe integer");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => memoryReleaseCanonicalJson(entry)).join(",")}]`;
  }
  if (typeof value !== "object" || value === undefined) {
    fail("canonical JSON contains an unsupported value");
  }
  const object = value as JsonObject;
  return `{${Object.keys(object).sort().map((key) =>
    `${JSON.stringify(key)}:${memoryReleaseCanonicalJson(object[key])}`
  ).join(",")}}`;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function objectValue(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be one object`);
  }
  return value as JsonObject;
}

function exactKeys(value: JsonObject, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length ||
      actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} keys mismatch: ${actual.join(",")}`);
  }
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string") fail(`${label} must be a string`);
  return value;
}

function visibleAscii(value: unknown, label: string): string {
  const text = stringValue(value, label);
  if (text.length === 0 || text.length > 255 || !/^[\x21-\x7e]+$/.test(text)) {
    fail(`${label} must be visible ASCII`);
  }
  return text;
}

function raw32(value: unknown, label: string): string {
  const text = stringValue(value, label);
  if (!HASH_PATTERN.test(text) || text === "0".repeat(64) || text === EMPTY_SHA256) {
    fail(`${label} must be an observed lowercase SHA-256`);
  }
  return text;
}

function optionalRaw32(value: unknown, label: string): string {
  const text = stringValue(value, label);
  if (text === "") return text;
  return raw32(text, label);
}

function uint(value: unknown, label: string): bigint {
  const text = stringValue(value, label);
  if (!UINT_PATTERN.test(text)) fail(`${label} must be a canonical uint string`);
  return BigInt(text);
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    fail(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function boolValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") fail(`${label} must be boolean`);
  return value;
}

function canonicalRelativePath(value: unknown, label: string): string {
  const path = stringValue(value, label);
  if (path.length === 0 || path.length > 4096 || path.startsWith("/") ||
      path.includes("\\") || path.includes(":") || /[\x00-\x20\x7f]/.test(path)) {
    fail(`${label} is not a canonical relative path`);
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    fail(`${label} traverses or contains an empty segment`);
  }
  return path;
}

function parseCanonicalJson(raw: Buffer, label: string): JsonObject {
  if (raw.length === 0 || raw.length > MAX_JSON_BYTES) {
    fail(`${label} byte length invalid`);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", {fatal: true}).decode(raw);
  } catch {
    fail(`${label} is not UTF-8`);
  }
  if (!text.endsWith("\n") || text.endsWith("\n\n") ||
      text.includes("\r") || text.includes("\0")) {
    fail(`${label} newline wire is not canonical`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail(`${label} is not JSON`);
  }
  const object = objectValue(value, label);
  if (`${memoryReleaseCanonicalJson(object)}\n` !== text) {
    fail(`${label} JSON is not canonical`);
  }
  return object;
}

function sameStat(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino &&
    left.size === right.size && left.mode === right.mode &&
    left.nlink === right.nlink && left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs;
}

interface StableBytes {
  readonly raw: Buffer;
  readonly stat: BigIntStats;
}

function stableReadAbsolute(path: string, label: string, allowEmpty = false): StableBytes {
  if (!isAbsolute(path) || resolve(path) !== path || realpathSync.native(path) !== path) {
    fail(`${label} must be a canonical absolute path`);
  }
  const before = lstatSync(path, {bigint: true});
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1n ||
      (!allowEmpty && before.size <= 0n) || before.size > BigInt(MAX_JSON_BYTES * 64)) {
    fail(`${label} must be an unaliased regular file`);
  }
  if (!Number.isInteger(constants.O_NOFOLLOW)) fail("O_NOFOLLOW is unavailable");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd, {bigint: true});
    if (!sameStat(before, opened)) fail(`${label} changed before open`);
    const raw = readFileSync(fd);
    const afterFd = fstatSync(fd, {bigint: true});
    const afterPath = lstatSync(path, {bigint: true});
    if (afterPath.isSymbolicLink() || !afterPath.isFile() ||
        !sameStat(opened, afterFd) || !sameStat(afterFd, afterPath) ||
        BigInt(raw.length) !== opened.size) {
      fail(`${label} changed while reading`);
    }
    return {raw, stat: afterFd};
  } finally {
    closeSync(fd);
  }
}

function canonicalRootForManifest(manifestPath: string): string {
  const root = dirname(manifestPath);
  if (realpathSync.native(root) !== root) fail("manifest parent is not canonical");
  const stat = lstatSync(root, {bigint: true});
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("manifest parent is not a real directory");
  return root;
}

function resolveEvidencePath(root: string, relativePath: string, label: string): string {
  const path = join(root, ...relativePath.split("/"));
  const rel = relative(root, path);
  if (rel === ".." || rel.startsWith(`..${sep}`) || rel.startsWith(sep) ||
      resolve(path) !== path) {
    fail(`${label} escapes evidence root`);
  }
  let cursor = root;
  for (const segment of relativePath.split("/")) {
    cursor = join(cursor, segment);
    const stat = lstatSync(cursor, {bigint: true});
    if (stat.isSymbolicLink()) fail(`${label} contains a symlink`);
  }
  if (realpathSync.native(path) !== path) fail(`${label} is not canonical`);
  return path;
}

function parseArtifactPin(value: unknown, label: string): ArtifactPin {
  const object = objectValue(value, label);
  exactKeys(object, ["path", "byteLength", "bytesRaw32"], label);
  return Object.freeze({
    path: canonicalRelativePath(object.path, `${label}.path`),
    byteLength: positiveSafeInteger(object.byteLength, `${label}.byteLength`),
    bytesRaw32: raw32(object.bytesRaw32, `${label}.bytesRaw32`),
  });
}

function readPinnedArtifact(root: string, pin: ArtifactPin, label: string): StableBytes {
  const value = stableReadAbsolute(resolveEvidencePath(root, pin.path, label), label);
  if (value.raw.length !== pin.byteLength || sha256(value.raw) !== pin.bytesRaw32) {
    fail(`${label} byte identity mismatch`);
  }
  return value;
}

function targetValue(value: unknown, label: string): MemoryReleaseTarget {
  if (!CHENG_MEMORY_RELEASE_TARGETS.includes(value as MemoryReleaseTarget)) {
    fail(`${label} is not a production Linux target`);
  }
  return value as MemoryReleaseTarget;
}

function backendValue(value: unknown, label: string): MemoryReleaseBackend {
  if (!CHENG_MEMORY_RELEASE_BACKENDS.includes(value as MemoryReleaseBackend)) {
    fail(`${label} is not primary/backend2`);
  }
  return value as MemoryReleaseBackend;
}

function outcomeValue(value: unknown, label: string): MemoryReleaseOutcome {
  if (!CHENG_MEMORY_RELEASE_OUTCOMES.includes(value as MemoryReleaseOutcome)) {
    fail(`${label} is not success/failure_matrix`);
  }
  return value as MemoryReleaseOutcome;
}

function caseId(target: MemoryReleaseTarget, backend: MemoryReleaseBackend, outcome: MemoryReleaseOutcome): string {
  return `${target}:${backend}:${outcome}`;
}

function requiredCasePlan(): readonly {
  readonly caseId: string;
  readonly targetTriple: MemoryReleaseTarget;
  readonly backend: MemoryReleaseBackend;
  readonly outcome: MemoryReleaseOutcome;
}[] {
  const rows = [];
  for (const targetTriple of CHENG_MEMORY_RELEASE_TARGETS) {
    for (const backend of CHENG_MEMORY_RELEASE_BACKENDS) {
      for (const outcome of CHENG_MEMORY_RELEASE_OUTCOMES) {
        rows.push(Object.freeze({
          caseId: caseId(targetTriple, backend, outcome),
          targetTriple,
          backend,
          outcome,
        }));
      }
    }
  }
  return Object.freeze(rows);
}

export const CHENG_MEMORY_RELEASE_REQUIRED_CASES = requiredCasePlan();

function parseManifest(raw: Buffer): MemoryReleaseManifest {
  const object = parseCanonicalJson(raw, "memory release manifest");
  exactKeys(object, [
    "schema",
    "evidenceKind",
    "sourceClosure",
    "workloadRunner",
    "drivers",
    "cases",
    "manifestSha256",
  ], "memory release manifest");
  if (object.schema !== CHENG_MEMORY_RELEASE_GATE_SCHEMA ||
      object.evidenceKind !== "production") {
    fail("manifest is not the unique current production schema");
  }
  if (!Array.isArray(object.drivers) ||
      object.drivers.length !== CHENG_MEMORY_RELEASE_TARGETS.length) {
    fail("manifest must pin both Linux official drivers");
  }
  const drivers = object.drivers.map((entry, index): DriverPin => {
    const row = objectValue(entry, `manifest.drivers[${index}]`);
    exactKeys(row, ["targetTriple", "artifact"], `manifest.drivers[${index}]`);
    const targetTriple = targetValue(row.targetTriple, `manifest.drivers[${index}].targetTriple`);
    if (targetTriple !== CHENG_MEMORY_RELEASE_TARGETS[index]) {
      fail("manifest driver target order mismatch");
    }
    return Object.freeze({
      targetTriple,
      artifact: parseArtifactPin(row.artifact, `manifest.drivers[${index}].artifact`),
    });
  });
  const plan = CHENG_MEMORY_RELEASE_REQUIRED_CASES;
  if (!Array.isArray(object.cases) || object.cases.length !== plan.length) {
    fail("manifest case matrix is incomplete");
  }
  const cases = object.cases.map((entry, index): GateCase => {
    const row = objectValue(entry, `manifest.cases[${index}]`);
    exactKeys(row, [
      "caseId",
      "targetTriple",
      "backend",
      "outcome",
      "cgroupEvidenceDirectory",
      "cgroupReceiptRaw32",
      "releaseReceiptRaw32",
    ], `manifest.cases[${index}]`);
    const targetTriple = targetValue(row.targetTriple, `manifest.cases[${index}].targetTriple`);
    const backend = backendValue(row.backend, `manifest.cases[${index}].backend`);
    const outcome = outcomeValue(row.outcome, `manifest.cases[${index}].outcome`);
    const actualCaseId = visibleAscii(row.caseId, `manifest.cases[${index}].caseId`);
    const expected = plan[index];
    if (expected === undefined || actualCaseId !== expected.caseId ||
        targetTriple !== expected.targetTriple || backend !== expected.backend ||
        outcome !== expected.outcome) {
      fail(`manifest case ${index} does not match the frozen production matrix`);
    }
    return Object.freeze({
      caseId: actualCaseId,
      targetTriple,
      backend,
      outcome,
      cgroupEvidenceDirectory: canonicalRelativePath(
        row.cgroupEvidenceDirectory,
        `manifest.cases[${index}].cgroupEvidenceDirectory`,
      ),
      cgroupReceiptRaw32: raw32(
        row.cgroupReceiptRaw32,
        `manifest.cases[${index}].cgroupReceiptRaw32`,
      ),
      releaseReceiptRaw32: raw32(
        row.releaseReceiptRaw32,
        `manifest.cases[${index}].releaseReceiptRaw32`,
      ),
    });
  });
  const projection = {
    schema: object.schema,
    evidenceKind: object.evidenceKind,
    sourceClosure: object.sourceClosure,
    workloadRunner: object.workloadRunner,
    drivers: object.drivers,
    cases: object.cases,
  };
  const claimed = raw32(object.manifestSha256, "manifest.manifestSha256");
  if (sha256(memoryReleaseCanonicalJson(projection)) !== claimed) {
    fail("manifest SHA-256 mismatch");
  }
  const sourceClosure = parseArtifactPin(object.sourceClosure, "manifest.sourceClosure");
  const workloadRunner = parseArtifactPin(object.workloadRunner, "manifest.workloadRunner");
  const filePaths = [
    sourceClosure.path,
    workloadRunner.path,
    ...drivers.map((entry) => entry.artifact.path),
  ];
  if (new Set(filePaths).size !== filePaths.length) {
    fail("manifest source/runner/driver artifact path alias");
  }
  const directoryPaths = cases.map((entry) => entry.cgroupEvidenceDirectory);
  if (new Set(directoryPaths).size !== directoryPaths.length ||
      directoryPaths.some((path) => filePaths.some((file) =>
        file === path || file.startsWith(`${path}/`) || path.startsWith(`${file}/`)
      ))) {
    fail("manifest cgroup evidence directory alias");
  }
  return Object.freeze({
    schema: CHENG_MEMORY_RELEASE_GATE_SCHEMA,
    evidenceKind: "production",
    sourceClosure,
    workloadRunner,
    drivers: Object.freeze(drivers),
    cases: Object.freeze(cases),
    manifestSha256: claimed,
  });
}

function parseLedgerRow(
  value: unknown,
  label: string,
  expectedPath: string,
  expectedComponent: string,
  expectedEntered: boolean,
): LedgerRow {
  const row = objectValue(value, label);
  exactKeys(row, [
    "pathKind",
    "component",
    "receiptKind",
    "producerOperation",
    "stateMachineReceiptCid",
    "allocated",
    "released",
    "live",
    "allocatedBytes",
    "releasedBytes",
    "liveBytes",
    "physicalBufferCount",
    "physicalFreeCount",
    "storageReleased",
    "ledgerStorageReleased",
    "ledgerStorageReleasedSequenceCount",
    "ledgerStorageReleasedBufferCount",
    "ledgerStorageReleasedBytes",
  ], label);
  const stateMachineReceiptCid = optionalRaw32(
    row.stateMachineReceiptCid,
    `${label}.stateMachineReceiptCid`,
  );
  const out: LedgerRow = {
    pathKind: visibleAscii(row.pathKind, `${label}.pathKind`),
    component: visibleAscii(row.component, `${label}.component`),
    receiptKind: stringValue(row.receiptKind, `${label}.receiptKind`),
    producerOperation: stringValue(
      row.producerOperation,
      `${label}.producerOperation`,
    ),
    stateMachineReceiptCid,
    entered: stateMachineReceiptCid !== "",
    allocated: uint(row.allocated, `${label}.allocated`),
    released: uint(row.released, `${label}.released`),
    live: uint(row.live, `${label}.live`),
    allocatedBytes: uint(row.allocatedBytes, `${label}.allocatedBytes`),
    releasedBytes: uint(row.releasedBytes, `${label}.releasedBytes`),
    liveBytes: uint(row.liveBytes, `${label}.liveBytes`),
    physicalBufferCount: uint(row.physicalBufferCount, `${label}.physicalBufferCount`),
    physicalFreeCount: uint(row.physicalFreeCount, `${label}.physicalFreeCount`),
    storageReleased: boolValue(row.storageReleased, `${label}.storageReleased`),
    ledgerStorageReleased: boolValue(
      row.ledgerStorageReleased,
      `${label}.ledgerStorageReleased`,
    ),
    ledgerStorageReleasedSequenceCount: uint(
      row.ledgerStorageReleasedSequenceCount,
      `${label}.ledgerStorageReleasedSequenceCount`,
    ),
    ledgerStorageReleasedBufferCount: uint(
      row.ledgerStorageReleasedBufferCount,
      `${label}.ledgerStorageReleasedBufferCount`,
    ),
    ledgerStorageReleasedBytes: uint(
      row.ledgerStorageReleasedBytes,
      `${label}.ledgerStorageReleasedBytes`,
    ),
  };
  if (out.pathKind !== expectedPath || out.component !== expectedComponent ||
      out.entered !== expectedEntered) {
    fail(`${label} path/component/entered mismatch`);
  }
  const expectedProof = componentStateMachineProof(expectedComponent);
  if (out.entered) {
    if (out.receiptKind !== expectedProof.receiptKind ||
        out.producerOperation !== expectedProof.producerOperation) {
      fail(`${label} component state-machine producer mismatch`);
    }
    const stateProjection = {
      allocated: row.allocated,
      allocatedBytes: row.allocatedBytes,
      component: row.component,
      ledgerStorageReleased: row.ledgerStorageReleased,
      ledgerStorageReleasedBufferCount: row.ledgerStorageReleasedBufferCount,
      ledgerStorageReleasedBytes: row.ledgerStorageReleasedBytes,
      ledgerStorageReleasedSequenceCount: row.ledgerStorageReleasedSequenceCount,
      live: row.live,
      liveBytes: row.liveBytes,
      pathKind: row.pathKind,
      physicalBufferCount: row.physicalBufferCount,
      physicalFreeCount: row.physicalFreeCount,
      producerOperation: row.producerOperation,
      receiptKind: row.receiptKind,
      released: row.released,
      releasedBytes: row.releasedBytes,
      storageReleased: row.storageReleased,
    };
    if (sha256(memoryReleaseCanonicalJson(stateProjection)) !==
        out.stateMachineReceiptCid) {
      fail(`${label} component state-machine receipt CID mismatch`);
    }
  } else if (out.receiptKind !== "" || out.producerOperation !== "") {
    fail(`${label} non-entered component claims a state-machine producer`);
  }
  const counters = [
    out.allocated,
    out.released,
    out.live,
    out.allocatedBytes,
    out.releasedBytes,
    out.liveBytes,
    out.physicalBufferCount,
    out.physicalFreeCount,
    out.ledgerStorageReleasedSequenceCount,
    out.ledgerStorageReleasedBufferCount,
    out.ledgerStorageReleasedBytes,
  ];
  if (!out.entered) {
    if (counters.some((counter) => counter !== 0n) ||
        out.storageReleased || out.ledgerStorageReleased) {
      fail(`${label} non-entered component claims memory activity`);
    }
  } else if (out.allocated <= 0n || out.allocated !== out.released ||
      out.live !== 0n || out.allocatedBytes <= 0n ||
      out.allocatedBytes !== out.releasedBytes || out.liveBytes !== 0n ||
      out.physicalBufferCount <= 0n ||
      out.physicalBufferCount !== out.physicalFreeCount ||
      !out.storageReleased) {
    fail(`${label} ledger is not physically closed`);
  }
  if (out.entered) {
    if (expectedComponent === "primary") {
      if (out.ledgerStorageReleased ||
          out.ledgerStorageReleasedSequenceCount !== 0n ||
          out.ledgerStorageReleasedBufferCount !== 0n ||
          out.ledgerStorageReleasedBytes !== 0n) {
        fail(`${label} primary release receipt falsely claims a ledger`);
      }
    } else if (expectedComponent === "body_ir") {
      if (!out.ledgerStorageReleased ||
          out.ledgerStorageReleasedSequenceCount <
            LEDGER_STORAGE_SEQUENCE_COUNT ||
          out.ledgerStorageReleasedSequenceCount %
            LEDGER_STORAGE_SEQUENCE_COUNT !== 0n ||
          out.ledgerStorageReleasedBufferCount <= 0n ||
          out.ledgerStorageReleasedBufferCount >
            out.ledgerStorageReleasedSequenceCount ||
          out.ledgerStorageReleasedBytes <= 0n) {
        fail(`${label} BodyIR lifecycle receipt set is not closed`);
      }
    } else if (!out.ledgerStorageReleased ||
        out.ledgerStorageReleasedSequenceCount !==
          LEDGER_STORAGE_SEQUENCE_COUNT ||
        out.ledgerStorageReleasedBufferCount <= 0n ||
        out.ledgerStorageReleasedBufferCount >
          LEDGER_STORAGE_SEQUENCE_COUNT ||
        out.ledgerStorageReleasedBytes <= 0n) {
      fail(`${label} component lifetime ledger is not closed`);
    }
  }
  return Object.freeze(out);
}

function componentStateMachineProof(component: string): Readonly<{
  receiptKind: string;
  producerOperation: string;
}> {
  if (component === "production_entry") {
    return Object.freeze({
      receiptKind: "system_link_exec_payload_finalize_receipt",
      producerOperation: "SystemLinkExecPlanCompleteExecution",
    });
  }
  if (component === "compiler_csg") {
    return Object.freeze({
      receiptKind: "compiler_csg_production_lifetime_receipt",
      producerOperation: "CompilerCsgProductionLifetimeReceiptInto",
    });
  }
  if (component === "lowering") {
    return Object.freeze({
      receiptKind: "compiler_payload_lifecycle_receipt",
      producerOperation: "CompilerPayloadLifecycleEnd",
    });
  }
  if (component === "body_ir") {
    return Object.freeze({
      receiptKind: "body_ir_function_lifecycle_receipt_set",
      producerOperation: "BodyIrFunctionLifecycleRelease",
    });
  }
  if (component === "primary") {
    return Object.freeze({
      receiptKind: "primary_object_plan_release_receipt",
      producerOperation: "PrimaryObjectPlanReleaseWithReceipt",
    });
  }
  if (component === "backend2") {
    return Object.freeze({
      receiptKind: "backend2_assembler_temp_release_receipt",
      producerOperation: "Backend2AssemblerTempLifecycleFinalizeStrictInto",
    });
  }
  fail(`unknown component state-machine proof ${component}`);
}

function parseOrcRow(
  value: unknown,
  label: string,
  expectedPath: string,
  success: boolean,
): OrcRow {
  const row = objectValue(value, label);
  exactKeys(row, [
    "pathKind",
    "iterations",
    "allocCount",
    "freeCount",
    "liveCount",
    "retainCount",
    "releaseCount",
  ], label);
  const out: OrcRow = {
    pathKind: visibleAscii(row.pathKind, `${label}.pathKind`),
    iterations: uint(row.iterations, `${label}.iterations`),
    allocCount: uint(row.allocCount, `${label}.allocCount`),
    freeCount: uint(row.freeCount, `${label}.freeCount`),
    liveCount: uint(row.liveCount, `${label}.liveCount`),
    retainCount: uint(row.retainCount, `${label}.retainCount`),
    releaseCount: uint(row.releaseCount, `${label}.releaseCount`),
  };
  if (out.pathKind !== expectedPath || out.allocCount <= 0n ||
      out.allocCount !== out.freeCount || out.liveCount !== 0n ||
      out.retainCount !== out.releaseCount) {
    fail(`${label} ORC alloc/free/live or retain/release is unbalanced`);
  }
  if (success) {
    if (out.iterations !== 5000n || out.retainCount !== 5000n) {
      fail(`${label} does not prove the 5000-iteration ORC path`);
    }
  } else if (out.iterations !== 1n) {
    fail(`${label} failure path iteration count mismatch`);
  }
  return Object.freeze(out);
}

function pathEntered(component: string, pathKind: string): boolean {
  if (component === "production_entry") return true;
  if (component === "compiler_csg") {
    return !["source_admission_failure", "parser_failure"].includes(pathKind);
  }
  if (component === "lowering") {
    return !["source_admission_failure", "parser_failure", "csg_failure"].includes(pathKind);
  }
  if (component === "body_ir") {
    return ["backend_failure", "emit_failure", "success"].includes(pathKind);
  }
  return ["backend_failure", "emit_failure", "success"].includes(pathKind);
}

export function verifyMemoryReleaseDriverReceipt(
  raw: Buffer,
  expected: {
    readonly caseId: string;
    readonly targetTriple: MemoryReleaseTarget;
    readonly backend: MemoryReleaseBackend;
    readonly outcome: MemoryReleaseOutcome;
    readonly driverBytesRaw32: string;
    readonly compilerSourceClosureRaw32: string;
    readonly workloadRunnerRaw32: string;
  },
): MemoryReleaseReceiptValidation {
  const object = parseCanonicalJson(raw, `release receipt ${expected.caseId}`);
  exactKeys(object, [
    "schema",
    "caseId",
    "targetTriple",
    "backend",
    "outcome",
    "driverRole",
    "driverBytesRaw32",
    "compilerSourceClosureRaw32",
    "workloadRunnerRaw32",
    "ledgerRows",
    "orcRows",
    "receiptSha256",
  ], `release receipt ${expected.caseId}`);
  if (object.schema !== CHENG_MEMORY_RELEASE_DRIVER_RECEIPT_SCHEMA ||
      object.caseId !== expected.caseId ||
      object.targetTriple !== expected.targetTriple ||
      object.backend !== expected.backend ||
      object.outcome !== expected.outcome ||
      object.driverRole !== "production" ||
      object.driverBytesRaw32 !== expected.driverBytesRaw32 ||
      object.compilerSourceClosureRaw32 !== expected.compilerSourceClosureRaw32 ||
      object.workloadRunnerRaw32 !== expected.workloadRunnerRaw32) {
    fail(`${expected.caseId} release identity/role mismatch`);
  }
  const projection = {
    schema: object.schema,
    caseId: object.caseId,
    targetTriple: object.targetTriple,
    backend: object.backend,
    outcome: object.outcome,
    driverRole: object.driverRole,
    driverBytesRaw32: object.driverBytesRaw32,
    compilerSourceClosureRaw32: object.compilerSourceClosureRaw32,
    workloadRunnerRaw32: object.workloadRunnerRaw32,
    ledgerRows: object.ledgerRows,
    orcRows: object.orcRows,
  };
  const receiptSha256 = raw32(object.receiptSha256, "release receipt receiptSha256");
  if (sha256(memoryReleaseCanonicalJson(projection)) !== receiptSha256) {
    fail(`${expected.caseId} release receipt SHA-256 mismatch`);
  }
  const paths = expected.outcome === "success"
    ? ["success"]
    : [...CHENG_MEMORY_RELEASE_FAILURE_PATHS];
  const components = [...RECEIPT_COMPONENTS, expected.backend];
  if (!Array.isArray(object.ledgerRows) ||
      object.ledgerRows.length !== paths.length * components.length) {
    fail(`${expected.caseId} ledger row matrix incomplete`);
  }
  let ledgerIndex = 0;
  for (const pathKind of paths) {
    for (const component of components) {
      parseLedgerRow(
        object.ledgerRows[ledgerIndex],
        `release receipt ${expected.caseId}.ledgerRows[${ledgerIndex}]`,
        pathKind,
        component,
        pathEntered(component, pathKind),
      );
      ledgerIndex += 1;
    }
  }
  if (!Array.isArray(object.orcRows) || object.orcRows.length !== paths.length) {
    fail(`${expected.caseId} ORC row matrix incomplete`);
  }
  for (let index = 0; index < paths.length; index += 1) {
    parseOrcRow(
      object.orcRows[index],
      `release receipt ${expected.caseId}.orcRows[${index}]`,
      paths[index]!,
      expected.outcome === "success",
    );
  }
  return Object.freeze({
    caseId: expected.caseId,
    targetTriple: expected.targetTriple,
    backend: expected.backend,
    outcome: expected.outcome,
    receiptSha256,
    pathCount: paths.length,
    ledgerRowCount: object.ledgerRows.length,
    orcRowCount: object.orcRows.length,
  });
}

function driverChildArgv(expected: {
  readonly caseId: string;
  readonly targetTriple: MemoryReleaseTarget;
  readonly backend: MemoryReleaseBackend;
  readonly outcome: MemoryReleaseOutcome;
  readonly driverBytesRaw32: string;
  readonly compilerSourceClosureRaw32: string;
  readonly workloadRunnerRaw32: string;
}): readonly string[] {
  return Object.freeze([
    "memory-release-case",
    expected.caseId,
    expected.targetTriple,
    expected.backend,
    expected.outcome,
    "/cheng-memory-release/source-closure",
    expected.driverBytesRaw32,
    expected.compilerSourceClosureRaw32,
    expected.workloadRunnerRaw32,
  ]);
}

export function verifyMemoryReleaseReceipt(
  raw: Buffer,
  expected: {
    readonly caseId: string;
    readonly targetTriple: MemoryReleaseTarget;
    readonly backend: MemoryReleaseBackend;
    readonly outcome: MemoryReleaseOutcome;
    readonly driverBytesRaw32: string;
    readonly compilerSourceClosureRaw32: string;
    readonly workloadRunnerRaw32: string;
  },
): MemoryReleaseReceiptValidation {
  const label = `runner release receipt ${expected.caseId}`;
  const object = parseCanonicalJson(raw, label);
  exactKeys(object, [
    "schema",
    "driverChildArgv",
    "driverChildCommandPath",
    "driverChildExitCode",
    "driverReceipt",
    "driverReceiptRaw32",
    "receiptSha256",
  ], label);
  if (object.schema !== CHENG_MEMORY_RELEASE_RECEIPT_SCHEMA ||
      object.driverChildCommandPath !== "/cheng-memory-release/driver" ||
      uint(object.driverChildExitCode, `${label}.driverChildExitCode`) !== 0n) {
    fail(`${expected.caseId} official driver child identity/exit mismatch`);
  }
  const expectedArgv = driverChildArgv(expected);
  if (!Array.isArray(object.driverChildArgv) ||
      object.driverChildArgv.length !== expectedArgv.length ||
      object.driverChildArgv.some((value, index) =>
        value !== expectedArgv[index]
      )) {
    fail(`${expected.caseId} official driver child argv mismatch`);
  }
  const driverReceipt = objectValue(
    object.driverReceipt,
    `${label}.driverReceipt`,
  );
  const driverRaw = Buffer.from(
    `${memoryReleaseCanonicalJson(driverReceipt)}\n`,
    "utf8",
  );
  const driverReceiptRaw32 = raw32(
    object.driverReceiptRaw32,
    `${label}.driverReceiptRaw32`,
  );
  if (sha256(driverRaw) !== driverReceiptRaw32) {
    fail(`${expected.caseId} official driver child stdout identity mismatch`);
  }
  const projection = {
    driverChildArgv: object.driverChildArgv,
    driverChildCommandPath: object.driverChildCommandPath,
    driverChildExitCode: object.driverChildExitCode,
    driverReceipt: object.driverReceipt,
    driverReceiptRaw32: object.driverReceiptRaw32,
    schema: object.schema,
  };
  const receiptSha256 = raw32(
    object.receiptSha256,
    `${label}.receiptSha256`,
  );
  if (sha256(memoryReleaseCanonicalJson(projection)) !== receiptSha256) {
    fail(`${expected.caseId} runner release receipt SHA-256 mismatch`);
  }
  return verifyMemoryReleaseDriverReceipt(driverRaw, expected);
}

function assertExecutable(value: StableBytes, label: string): void {
  if ((value.stat.mode & 0o111n) === 0n) fail(`${label} is not executable`);
}

function assertLinuxDriver(
  value: StableBytes,
  target: MemoryReleaseTarget,
  label: string,
): void {
  assertExecutable(value, label);
  const raw = value.raw;
  if (raw.length < 64 || !raw.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
      raw[4] !== 2 || raw[5] !== 1) {
    fail(`${label} is not little-endian ELF64`);
  }
  const machine = raw.readUInt16LE(18);
  const expectedMachine = target === "aarch64-unknown-linux-gnu" ? 183 : 62;
  if (machine !== expectedMachine) fail(`${label} ELF machine mismatch`);
}

function framedStringsSha256(values: readonly string[]): string {
  const hash = createHash("sha256");
  for (const value of values) {
    const raw = Buffer.from(value, "utf8");
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(raw.length));
    hash.update(length);
    hash.update(raw);
  }
  return hash.digest("hex");
}

function workloadArgv(
  row: GateCase,
  driverRaw32: string,
  sourceRaw32: string,
  runnerRaw32: string,
): readonly string[] {
  return Object.freeze([
    "/cheng-memory-release/workload",
    row.caseId,
    row.targetTriple,
    row.backend,
    row.outcome,
    "/cheng-memory-release/driver",
    driverRaw32,
    sourceRaw32,
    runnerRaw32,
  ]);
}

export function verifyMemoryReleaseGate(manifestPath: string): MemoryReleaseGateValidation {
  if (!isAbsolute(manifestPath) || resolve(manifestPath) !== manifestPath) {
    fail("manifestPath must be a canonical absolute path");
  }
  const manifestIdentity = stableReadAbsolute(manifestPath, "memory release manifest");
  const manifestBytes = manifestIdentity.raw;
  const root = canonicalRootForManifest(manifestPath);
  const manifest = parseManifest(manifestBytes);
  const source = readPinnedArtifact(root, manifest.sourceClosure, "source closure");
  const runner = readPinnedArtifact(root, manifest.workloadRunner, "memory workload runner");
  assertExecutable(runner, "memory workload runner");
  const driverByTarget = new Map<MemoryReleaseTarget, StableBytes>();
  for (const driver of manifest.drivers) {
    const value = readPinnedArtifact(
      root,
      driver.artifact,
      `official driver ${driver.targetTriple}`,
    );
    assertLinuxDriver(value, driver.targetTriple, `official driver ${driver.targetTriple}`);
    driverByTarget.set(driver.targetTriple, value);
  }
  for (const row of manifest.cases) {
    const driver = driverByTarget.get(row.targetTriple);
    if (driver === undefined) fail(`${row.caseId} official driver is absent`);
    const cgroupDir = resolveEvidencePath(
      root,
      row.cgroupEvidenceDirectory,
      `${row.caseId} cgroup directory`,
    );
    const cgroup = verifyLinuxCgroupEvidenceDirectory(cgroupDir, "workload", row.caseId);
    if (cgroup.receiptSha256 !== row.cgroupReceiptRaw32 ||
        cgroup.stdoutSha256 !== row.releaseReceiptRaw32) {
      fail(`${row.caseId} cgroup/release receipt manifest binding mismatch`);
    }
    const expectedArchitecture = row.targetTriple === "aarch64-unknown-linux-gnu"
      ? "aarch64"
      : "x86_64";
    if (cgroup.receipt.get("vm_architecture") !== expectedArchitecture) {
      fail(`${row.caseId} did not run on the real target architecture`);
    }
    const argv = workloadArgv(
      row,
      sha256(driver.raw),
      sha256(source.raw),
      sha256(runner.raw),
    );
    if (cgroup.receipt.get("target_argv_count") !== String(argv.length) ||
        cgroup.receipt.get("target_argv_sha256") !== framedStringsSha256(argv)) {
      fail(`${row.caseId} cgroup target argv is not the frozen production workload`);
    }
    verifyMemoryReleaseReceipt(cgroup.stdout, {
      caseId: row.caseId,
      targetTriple: row.targetTriple,
      backend: row.backend,
      outcome: row.outcome,
      driverBytesRaw32: sha256(driver.raw),
      compilerSourceClosureRaw32: sha256(source.raw),
      workloadRunnerRaw32: sha256(runner.raw),
    });
  }
  const sourceAfter = readPinnedArtifact(root, manifest.sourceClosure, "source closure final");
  const runnerAfter = readPinnedArtifact(root, manifest.workloadRunner, "memory workload runner final");
  if (!sourceAfter.raw.equals(source.raw) || !sameStat(sourceAfter.stat, source.stat) ||
      !runnerAfter.raw.equals(runner.raw) || !sameStat(runnerAfter.stat, runner.stat)) {
    fail("source closure or memory workload runner changed during gate");
  }
  for (const driverPin of manifest.drivers) {
    const before = driverByTarget.get(driverPin.targetTriple);
    const after = readPinnedArtifact(
      root,
      driverPin.artifact,
      `official driver ${driverPin.targetTriple} final`,
    );
    if (before === undefined || !after.raw.equals(before.raw) ||
        !sameStat(after.stat, before.stat)) {
      fail(`official driver ${driverPin.targetTriple} changed during gate`);
    }
  }
  for (const row of manifest.cases) {
    const cgroupDir = resolveEvidencePath(
      root,
      row.cgroupEvidenceDirectory,
      `${row.caseId} cgroup directory final`,
    );
    const finalCgroup = verifyLinuxCgroupEvidenceDirectory(
      cgroupDir,
      "workload",
      `${row.caseId} final`,
    );
    if (finalCgroup.receiptSha256 !== row.cgroupReceiptRaw32 ||
        finalCgroup.stdoutSha256 !== row.releaseReceiptRaw32) {
      fail(`${row.caseId} cgroup evidence changed during gate`);
    }
  }
  const manifestAfter = stableReadAbsolute(manifestPath, "memory release manifest final");
  if (!manifestAfter.raw.equals(manifestBytes) ||
      !sameStat(manifestAfter.stat, manifestIdentity.stat)) {
    fail("manifest changed during gate");
  }
  return Object.freeze({
    schema: CHENG_MEMORY_RELEASE_GATE_SCHEMA,
    status: CHENG_MEMORY_RELEASE_GATE_STATUS,
    manifestSha256: manifest.manifestSha256,
    caseIds: Object.freeze(manifest.cases.map((row) => row.caseId)),
    targets: CHENG_MEMORY_RELEASE_TARGETS,
  });
}

export function parseMemoryReleaseGateManifest(raw: Buffer): Readonly<{
  manifestSha256: string;
  caseIds: readonly string[];
}> {
  const manifest = parseManifest(raw);
  return Object.freeze({
    manifestSha256: manifest.manifestSha256,
    caseIds: Object.freeze(manifest.cases.map((row) => row.caseId)),
  });
}
