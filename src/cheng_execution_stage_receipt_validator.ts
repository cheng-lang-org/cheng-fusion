import {createHash} from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  type BigIntStats,
} from "node:fs";
import {isAbsolute, join, resolve} from "node:path";

export const CHENG_EXECUTION_STAGE_BUNDLE_SCHEMA =
  "cheng.compiler.execution_stage_bundle" as const;
export const CHENG_EXECUTION_STAGE_POLICY_SCHEMA =
  "cheng_fusion.execution_stage_receipt_policy" as const;
export const CHENG_EXECUTION_STAGE_VALIDATION_SCHEMA =
  "cheng_fusion.execution_stage_receipt_validation" as const;
export const CHENG_EXECUTION_STAGE_RUNNER_KIND =
  "cheng-real-source-bound-seven-stage-pipeline" as const;

export const CHENG_EXECUTION_STAGE_OFFICIAL_RUNNER_STATUS = Object.freeze({
  schema: "cheng_fusion.execution_stage_receipt_runner_status" as const,
  implemented: true as const,
  status: "READY" as const,
  code: "OFFICIAL_EXECUTION_STAGE_CURRENT_CONSUMER_READY" as const,
});

const IDENTITY_DOMAIN = "cheng.compiler.execution_identity";
const STAGE_DOMAIN = "cheng.compiler.execution_stage_receipt";
const SEVEN_STAGE_DOMAIN = "cheng.compiler.seven_stage_execution_root";
const EMPTY_SHA256 = createHash("sha256").digest("hex");
const HASH_PATTERN = /^[0-9a-f]{64}$/;
// Seven stages expose three bounded paths each; identity exposes seven. The
// remaining scalar/hash/key JSON is well below this protocol-derived ceiling.
const MAX_CANONICAL_RECEIPT_BYTES = 256 * 1024;

const STAGE_PLAN = Object.freeze([
  Object.freeze({ordinal: 1, kind: "typed_expr", lane: "shared", predecessor: "parser", predecessorIndex: -1, sidecarSchema: "cheng.compiler.stage_semantic_sidecar.typed_expr", artifactKind: "typed_expr_fact_table"}),
  Object.freeze({ordinal: 2, kind: "csg", lane: "shared", predecessor: "typed_expr", predecessorIndex: 0, sidecarSchema: "cheng.compiler.stage_semantic_sidecar.csg", artifactKind: "compiler_csg_facts"}),
  Object.freeze({ordinal: 3, kind: "lowering", lane: "shared", predecessor: "csg", predecessorIndex: 1, sidecarSchema: "cheng.compiler.stage_semantic_sidecar.lowering", artifactKind: "lowering_body_ir"}),
  Object.freeze({ordinal: 4, kind: "primary", lane: "primary", predecessor: "lowering", predecessorIndex: 2, sidecarSchema: "cheng.compiler.stage_semantic_sidecar.primary", artifactKind: "primary_emission_ledger"}),
  Object.freeze({ordinal: 5, kind: "primary_regalloc", lane: "primary", predecessor: "primary", predecessorIndex: 3, sidecarSchema: "cheng.compiler.stage_semantic_sidecar.primary_regalloc", artifactKind: "primary_regalloc_plan_action_fragment_symbol_bytes"}),
  Object.freeze({ordinal: 6, kind: "backend2", lane: "backend2", predecessor: "lowering", predecessorIndex: 2, sidecarSchema: "cheng.compiler.stage_semantic_sidecar.backend2", artifactKind: "backend2_emission_ledger"}),
  Object.freeze({ordinal: 7, kind: "backend2_regalloc", lane: "backend2", predecessor: "backend2", predecessorIndex: 5, sidecarSchema: "cheng.compiler.stage_semantic_sidecar.backend2_regalloc", artifactKind: "backend2_regalloc_plan_action_fragment_symbol_bytes"}),
] as const);

export type CompilerExecutionStageKind = typeof STAGE_PLAN[number]["kind"];

export interface CompilerExecutionStageFilePin {
  readonly path: string;
  readonly bytesRaw32: string;
}

export interface CompilerExecutionStagePolicyStage {
  readonly stageKind: CompilerExecutionStageKind;
  readonly producerSource: CompilerExecutionStageFilePin;
  readonly sidecarPath: string;
  readonly sidecarBytesRaw32: string;
  readonly artifactPath: string;
  readonly artifactBytesRaw32: string;
}

export interface CompilerExecutionStageReceiptPolicy {
  readonly schema: typeof CHENG_EXECUTION_STAGE_POLICY_SCHEMA;
  readonly evidenceRoot: string;
  readonly receipt: CompilerExecutionStageFilePin;
  readonly caseId: string;
  readonly targetTriple: string;
  readonly identityInputs: Readonly<{
    sourceBundle: CompilerExecutionStageFilePin;
    materializerBytes: CompilerExecutionStageFilePin;
    grammarObligation: CompilerExecutionStageFilePin;
    compilerSourceClosure: CompilerExecutionStageFilePin;
    driverBytes: CompilerExecutionStageFilePin;
    toolchainManifest: CompilerExecutionStageFilePin;
    commandManifest: CompilerExecutionStageFilePin;
  }>;
  readonly parserReceiptRaw32: string;
  readonly parserSemanticRaw32: string;
  readonly stages: readonly CompilerExecutionStagePolicyStage[];
}

interface CompilerExecutionIdentityJson {
  readonly caseId: string;
  readonly sourceBundleRaw32: string;
  readonly materializerBytesRaw32: string;
  readonly grammarObligationRootRaw32: string;
  readonly compilerSourceClosureRaw32: string;
  readonly driverBytesRaw32: string;
  readonly toolchainManifestRaw32: string;
  readonly commandManifestRaw32: string;
  readonly targetTriple: string;
  readonly executionRaw32: string;
}

interface CompilerExecutionStageJson {
  readonly stageOrdinal: number;
  readonly stageKind: string;
  readonly laneKind: string;
  readonly producerSourcePath: string;
  readonly producerSourceRaw32: string;
  readonly executionRaw32: string;
  readonly predecessorStageKind: string;
  readonly predecessorReceiptRaw32: string;
  readonly inputSemanticRaw32: string;
  readonly outputSemanticRaw32: string;
  readonly sidecarSchema: string;
  readonly sidecarPath: string;
  readonly sidecarByteLength: number;
  readonly sidecarBytesRaw32: string;
  readonly artifactKind: string;
  readonly artifactPath: string;
  readonly artifactByteLength: number;
  readonly artifactBytesRaw32: string;
  readonly receiptRaw32: string;
}

interface CompilerExecutionStageBundleJson {
  readonly schema: typeof CHENG_EXECUTION_STAGE_BUNDLE_SCHEMA;
  readonly runnerKind: typeof CHENG_EXECUTION_STAGE_RUNNER_KIND;
  readonly identity: CompilerExecutionIdentityJson;
  readonly observedIdentityPaths: Readonly<{
    sourceBundlePath: string;
    materializerBytesPath: string;
    grammarObligationPath: string;
    compilerSourceClosurePath: string;
    driverBytesPath: string;
    toolchainManifestPath: string;
    commandManifestPath: string;
  }>;
  readonly parserReceiptRaw32: string;
  readonly parserSemanticRaw32: string;
  readonly stages: readonly CompilerExecutionStageJson[];
  readonly sevenStageRootRaw32: string;
  readonly receiptSha256: string;
}

export interface CompilerExecutionStageReceiptValidation {
  readonly schema: typeof CHENG_EXECUTION_STAGE_VALIDATION_SCHEMA;
  readonly status: "VERIFIED";
  readonly officialRunnerStatus: "CURRENT_CONSUMER_REQUIRED";
  readonly receiptFileBytesRaw32: string;
  readonly executionRaw32: string;
  readonly sevenStageRootRaw32: string;
  readonly sourceBundleRaw32: string;
  readonly compilerSourceClosureRaw32: string;
  readonly toolchainManifestRaw32: string;
  readonly driverBytesRaw32: string;
  readonly parserReceiptRaw32: string;
  readonly parserSemanticRaw32: string;
  readonly stageReceiptRaw32s: readonly string[];
  readonly stageArtifactByteLengths: readonly number[];
  readonly stageBindings: readonly {
    readonly stageOrdinal: number;
    readonly stageKind: CompilerExecutionStageKind;
    readonly executionRaw32: string;
    readonly sourceBundleRaw32: string;
    readonly compilerSourceClosureRaw32: string;
    readonly toolchainManifestRaw32: string;
    readonly ingressRaw32: string;
    readonly actionRaw32: string;
    readonly fragmentRaw32: string;
    readonly objectRaw32: string;
    readonly receiptRaw32: string;
  }[];
}

type JsonObject = {[key: string]: unknown};

function fail(message: string): never {
  throw new Error(`execution stage receipt: ${message}`);
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail("canonical JSON contains a non-integer or unsafe number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (typeof value !== "object" || value === undefined) fail("canonical JSON contains an unsupported value");
  const object = value as JsonObject;
  const keys = Object.keys(object).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

function objectValue(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be one object`);
  return value as JsonObject;
}

function exactKeys(value: JsonObject, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} keys mismatch: ${actual.join(",")}`);
  }
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string") fail(`${label} must be a string`);
  return value;
}

function integerValue(value: unknown, label: string, positive = false): number {
  if (!Number.isSafeInteger(value) || (positive && Number(value) <= 0)) fail(`${label} must be a ${positive ? "positive " : ""}safe integer`);
  return Number(value);
}

function visibleText(value: string, label: string): string {
  if (value.length <= 0 || value.length > 255 || !/^[\x21-\x7e]+$/.test(value)) fail(`${label} must be 1..255 visible ASCII bytes`);
  return value;
}

function observedRaw32(value: unknown, label: string): string {
  const hash = stringValue(value, label);
  if (!HASH_PATTERN.test(hash) || hash === "0".repeat(64) || hash === EMPTY_SHA256) fail(`${label} is absent or is not lowercase raw32 hex`);
  return hash;
}

function canonicalRelativePath(value: unknown, label: string): string {
  const path = stringValue(value, label);
  if (path.length <= 0 || path.length > 4096 || !/^[\x21-\x7e]+$/.test(path) || path.includes("\\") || path.includes(":")) {
    fail(`${label} is not a canonical relative path`);
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) fail(`${label} traverses or has an empty segment`);
  return path;
}

function sameStat(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size &&
    left.mode === right.mode && left.nlink === right.nlink &&
    left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function canonicalEvidenceRoot(value: unknown): string {
  const root = stringValue(value, "policy evidenceRoot");
  if (!isAbsolute(root) || resolve(root) !== root) fail("policy evidenceRoot must be a canonical absolute path");
  const stat = lstatSync(root, {bigint: true});
  if (stat.isSymbolicLink() || !stat.isDirectory() || realpathSync.native(root) !== root) fail("policy evidenceRoot must be a canonical non-symlink directory");
  return root;
}

interface StableFileIdentity {
  readonly relativePath: string;
  readonly bytesRaw32: string;
  readonly byteLength: number;
  readonly stat: BigIntStats;
}

function stableFileIdentity(root: string, relativePathInput: unknown, label: string): StableFileIdentity {
  const relativePath = canonicalRelativePath(relativePathInput, `${label} path`);
  const path = join(root, ...relativePath.split("/"));
  if (resolve(path) !== path || realpathSync.native(path) !== path) fail(`${label} path is not the exact canonical evidence path`);
  const before = lstatSync(path, {bigint: true});
  if (before.isSymbolicLink() || !before.isFile() || before.size <= 0n || before.nlink !== 1n) fail(`${label} must be a non-empty, unaliased regular non-symlink file`);
  if (before.size > BigInt(Number.MAX_SAFE_INTEGER)) fail(`${label} exceeds exact JSON byte-length range`);
  if (!Number.isInteger(constants.O_NOFOLLOW)) fail("O_NOFOLLOW is unavailable");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd, {bigint: true});
    if (!opened.isFile() || !sameStat(before, opened)) fail(`${label} changed before open`);
    const digest = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let total = 0n;
    while (total < opened.size) {
      const remaining = opened.size - total;
      const count = readSync(fd, buffer, 0, Number(remaining > BigInt(buffer.length) ? BigInt(buffer.length) : remaining), null);
      if (count <= 0) fail(`${label} truncated while hashing`);
      digest.update(buffer.subarray(0, count));
      total += BigInt(count);
    }
    const afterFd = fstatSync(fd, {bigint: true});
    const afterPath = lstatSync(path, {bigint: true});
    if (afterPath.isSymbolicLink() || !afterPath.isFile() || !sameStat(opened, afterFd) || !sameStat(afterFd, afterPath)) fail(`${label} changed while hashing`);
    return {
      relativePath,
      bytesRaw32: digest.digest("hex"),
      byteLength: Number(opened.size),
      stat: afterFd,
    };
  } finally {
    closeSync(fd);
  }
}

function parseFilePin(value: unknown, label: string): CompilerExecutionStageFilePin {
  const object = objectValue(value, label);
  exactKeys(object, ["path", "bytesRaw32"], label);
  return Object.freeze({
    path: canonicalRelativePath(object.path, `${label}.path`),
    bytesRaw32: observedRaw32(object.bytesRaw32, `${label}.bytesRaw32`),
  });
}

interface ValidPolicy {
  readonly policy: CompilerExecutionStageReceiptPolicy;
  readonly root: string;
}

function parsePolicy(value: unknown): ValidPolicy {
  const object = objectValue(value, "policy");
  exactKeys(object, ["schema", "evidenceRoot", "receipt", "caseId", "targetTriple", "identityInputs", "parserReceiptRaw32", "parserSemanticRaw32", "stages"], "policy");
  if (object.schema !== CHENG_EXECUTION_STAGE_POLICY_SCHEMA) fail("policy schema mismatch");
  const root = canonicalEvidenceRoot(object.evidenceRoot);
  const identityObject = objectValue(object.identityInputs, "policy.identityInputs");
  exactKeys(identityObject, ["sourceBundle", "materializerBytes", "grammarObligation", "compilerSourceClosure", "driverBytes", "toolchainManifest", "commandManifest"], "policy.identityInputs");
  if (!Array.isArray(object.stages) || object.stages.length !== STAGE_PLAN.length) fail("policy must pin exactly seven stages");
  const stages = object.stages.map((entry, index): CompilerExecutionStagePolicyStage => {
    const stage = objectValue(entry, `policy.stages[${index}]`);
    exactKeys(stage, [
      "stageKind", "producerSource",
      "sidecarPath", "sidecarBytesRaw32",
      "artifactPath", "artifactBytesRaw32",
    ], `policy.stages[${index}]`);
    const plan = STAGE_PLAN[index];
    if (plan === undefined || stage.stageKind !== plan.kind) fail(`policy stage ${index + 1} kind mismatch`);
    const sidecarPath = canonicalRelativePath(stage.sidecarPath, `policy.stages[${index}].sidecarPath`);
    const artifactPath = canonicalRelativePath(stage.artifactPath, `policy.stages[${index}].artifactPath`);
    if (sidecarPath === artifactPath) fail(`policy stage ${index + 1} aliases sidecar and artifact`);
    return Object.freeze({
      stageKind: plan.kind,
      producerSource: parseFilePin(stage.producerSource, `policy.stages[${index}].producerSource`),
      sidecarPath,
      sidecarBytesRaw32: observedRaw32(
        stage.sidecarBytesRaw32,
        `policy.stages[${index}].sidecarBytesRaw32`,
      ),
      artifactPath,
      artifactBytesRaw32: observedRaw32(
        stage.artifactBytesRaw32,
        `policy.stages[${index}].artifactBytesRaw32`,
      ),
    });
  });
  const policy: CompilerExecutionStageReceiptPolicy = Object.freeze({
    schema: CHENG_EXECUTION_STAGE_POLICY_SCHEMA,
    evidenceRoot: root,
    receipt: parseFilePin(object.receipt, "policy.receipt"),
    caseId: visibleText(stringValue(object.caseId, "policy.caseId"), "policy.caseId"),
    targetTriple: visibleText(stringValue(object.targetTriple, "policy.targetTriple"), "policy.targetTriple"),
    identityInputs: Object.freeze({
      sourceBundle: parseFilePin(identityObject.sourceBundle, "policy.identityInputs.sourceBundle"),
      materializerBytes: parseFilePin(identityObject.materializerBytes, "policy.identityInputs.materializerBytes"),
      grammarObligation: parseFilePin(identityObject.grammarObligation, "policy.identityInputs.grammarObligation"),
      compilerSourceClosure: parseFilePin(identityObject.compilerSourceClosure, "policy.identityInputs.compilerSourceClosure"),
      driverBytes: parseFilePin(identityObject.driverBytes, "policy.identityInputs.driverBytes"),
      toolchainManifest: parseFilePin(identityObject.toolchainManifest, "policy.identityInputs.toolchainManifest"),
      commandManifest: parseFilePin(identityObject.commandManifest, "policy.identityInputs.commandManifest"),
    }),
    parserReceiptRaw32: observedRaw32(object.parserReceiptRaw32, "policy.parserReceiptRaw32"),
    parserSemanticRaw32: observedRaw32(object.parserSemanticRaw32, "policy.parserSemanticRaw32"),
    stages: Object.freeze(stages),
  });
  const identityPaths = [
    policy.identityInputs.sourceBundle.path,
    policy.identityInputs.materializerBytes.path,
    policy.identityInputs.grammarObligation.path,
    policy.identityInputs.compilerSourceClosure.path,
    policy.identityInputs.driverBytes.path,
    policy.identityInputs.toolchainManifest.path,
    policy.identityInputs.commandManifest.path,
  ];
  if (new Set(identityPaths).size !== identityPaths.length) fail("policy identity evidence paths must be pairwise distinct");
  const exclusivePaths = [
    policy.receipt.path,
    ...identityPaths,
    ...policy.stages.flatMap((stage) => [stage.sidecarPath, stage.artifactPath]),
  ];
  if (new Set(exclusivePaths).size !== exclusivePaths.length) fail("policy receipt, identity, sidecar, and artifact paths must be pairwise distinct");
  const producerPaths = new Set(policy.stages.map((stage) => stage.producerSource.path));
  if (exclusivePaths.some((path) => producerPaths.has(path))) fail("policy producer source aliases receipt, identity, sidecar, or artifact evidence");
  return {policy, root};
}

function u32(value: number): Buffer {
  const out = Buffer.allocUnsafe(4);
  out.writeUInt32BE(value >>> 0);
  return out;
}

function framedText(value: string): Buffer[] {
  const bytes = Buffer.from(value, "utf8");
  return [u32(bytes.length), bytes];
}

function framedI32(value: number): Buffer[] {
  return [u32(4), u32(value)];
}

function framedI64(value: number): Buffer[] {
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return [u32(8), bytes];
}

function framedRaw32(value: string): Buffer[] {
  return [u32(32), Buffer.from(value, "hex")];
}

function digestParts(parts: readonly Buffer[]): string {
  const digest = createHash("sha256");
  for (const part of parts) digest.update(part);
  return digest.digest("hex");
}

function computeExecutionRaw32(identity: Omit<CompilerExecutionIdentityJson, "executionRaw32">): string {
  return digestParts([
    ...framedText(IDENTITY_DOMAIN), ...framedText(identity.caseId),
    ...framedRaw32(identity.sourceBundleRaw32), ...framedRaw32(identity.materializerBytesRaw32),
    ...framedRaw32(identity.grammarObligationRootRaw32), ...framedRaw32(identity.compilerSourceClosureRaw32),
    ...framedRaw32(identity.driverBytesRaw32), ...framedRaw32(identity.toolchainManifestRaw32),
    ...framedRaw32(identity.commandManifestRaw32), ...framedText(identity.targetTriple),
  ]);
}

function computeStageRaw32(stage: CompilerExecutionStageJson): string {
  return digestParts([
    ...framedText(STAGE_DOMAIN), ...framedI32(stage.stageOrdinal),
    ...framedText(stage.stageKind), ...framedText(stage.laneKind),
    ...framedRaw32(stage.producerSourceRaw32), ...framedRaw32(stage.executionRaw32),
    ...framedText(stage.predecessorStageKind), ...framedRaw32(stage.predecessorReceiptRaw32),
    ...framedRaw32(stage.inputSemanticRaw32), ...framedRaw32(stage.outputSemanticRaw32),
    ...framedText(stage.sidecarSchema), ...framedText(stage.sidecarPath),
    ...framedI64(stage.sidecarByteLength), ...framedRaw32(stage.sidecarBytesRaw32),
    ...framedText(stage.artifactKind), ...framedText(stage.artifactPath),
    ...framedI64(stage.artifactByteLength), ...framedRaw32(stage.artifactBytesRaw32),
  ]);
}

function computeSevenStageRootRaw32(bundle: CompilerExecutionStageBundleJson): string {
  const parts: Buffer[] = [
    ...framedText(SEVEN_STAGE_DOMAIN), ...framedRaw32(bundle.identity.executionRaw32),
    ...framedRaw32(bundle.parserReceiptRaw32), ...framedRaw32(bundle.parserSemanticRaw32),
    ...framedI32(bundle.stages.length),
  ];
  for (const stage of bundle.stages) parts.push(...framedRaw32(stage.receiptRaw32), ...framedRaw32(stage.outputSemanticRaw32));
  return digestParts(parts);
}

function parseIdentity(value: unknown): CompilerExecutionIdentityJson {
  const object = objectValue(value, "receipt.identity");
  exactKeys(object, ["caseId", "sourceBundleRaw32", "materializerBytesRaw32", "grammarObligationRootRaw32", "compilerSourceClosureRaw32", "driverBytesRaw32", "toolchainManifestRaw32", "commandManifestRaw32", "targetTriple", "executionRaw32"], "receipt.identity");
  return {
    caseId: visibleText(stringValue(object.caseId, "receipt.identity.caseId"), "receipt.identity.caseId"),
    sourceBundleRaw32: observedRaw32(object.sourceBundleRaw32, "receipt.identity.sourceBundleRaw32"),
    materializerBytesRaw32: observedRaw32(object.materializerBytesRaw32, "receipt.identity.materializerBytesRaw32"),
    grammarObligationRootRaw32: observedRaw32(object.grammarObligationRootRaw32, "receipt.identity.grammarObligationRootRaw32"),
    compilerSourceClosureRaw32: observedRaw32(object.compilerSourceClosureRaw32, "receipt.identity.compilerSourceClosureRaw32"),
    driverBytesRaw32: observedRaw32(object.driverBytesRaw32, "receipt.identity.driverBytesRaw32"),
    toolchainManifestRaw32: observedRaw32(object.toolchainManifestRaw32, "receipt.identity.toolchainManifestRaw32"),
    commandManifestRaw32: observedRaw32(object.commandManifestRaw32, "receipt.identity.commandManifestRaw32"),
    targetTriple: visibleText(stringValue(object.targetTriple, "receipt.identity.targetTriple"), "receipt.identity.targetTriple"),
    executionRaw32: observedRaw32(object.executionRaw32, "receipt.identity.executionRaw32"),
  };
}

function parseStage(value: unknown, index: number): CompilerExecutionStageJson {
  const label = `receipt.stages[${index}]`;
  const object = objectValue(value, label);
  exactKeys(object, ["stageOrdinal", "stageKind", "laneKind", "producerSourcePath", "producerSourceRaw32", "executionRaw32", "predecessorStageKind", "predecessorReceiptRaw32", "inputSemanticRaw32", "outputSemanticRaw32", "sidecarSchema", "sidecarPath", "sidecarByteLength", "sidecarBytesRaw32", "artifactKind", "artifactPath", "artifactByteLength", "artifactBytesRaw32", "receiptRaw32"], label);
  return {
    stageOrdinal: integerValue(object.stageOrdinal, `${label}.stageOrdinal`, true),
    stageKind: stringValue(object.stageKind, `${label}.stageKind`),
    laneKind: stringValue(object.laneKind, `${label}.laneKind`),
    producerSourcePath: canonicalRelativePath(object.producerSourcePath, `${label}.producerSourcePath`),
    producerSourceRaw32: observedRaw32(object.producerSourceRaw32, `${label}.producerSourceRaw32`),
    executionRaw32: observedRaw32(object.executionRaw32, `${label}.executionRaw32`),
    predecessorStageKind: stringValue(object.predecessorStageKind, `${label}.predecessorStageKind`),
    predecessorReceiptRaw32: observedRaw32(object.predecessorReceiptRaw32, `${label}.predecessorReceiptRaw32`),
    inputSemanticRaw32: observedRaw32(object.inputSemanticRaw32, `${label}.inputSemanticRaw32`),
    outputSemanticRaw32: observedRaw32(object.outputSemanticRaw32, `${label}.outputSemanticRaw32`),
    sidecarSchema: stringValue(object.sidecarSchema, `${label}.sidecarSchema`),
    sidecarPath: canonicalRelativePath(object.sidecarPath, `${label}.sidecarPath`),
    sidecarByteLength: integerValue(object.sidecarByteLength, `${label}.sidecarByteLength`, true),
    sidecarBytesRaw32: observedRaw32(object.sidecarBytesRaw32, `${label}.sidecarBytesRaw32`),
    artifactKind: stringValue(object.artifactKind, `${label}.artifactKind`),
    artifactPath: canonicalRelativePath(object.artifactPath, `${label}.artifactPath`),
    artifactByteLength: integerValue(object.artifactByteLength, `${label}.artifactByteLength`, true),
    artifactBytesRaw32: observedRaw32(object.artifactBytesRaw32, `${label}.artifactBytesRaw32`),
    receiptRaw32: observedRaw32(object.receiptRaw32, `${label}.receiptRaw32`),
  };
}

function parseBundle(raw: Buffer): CompilerExecutionStageBundleJson {
  let text: string;
  try {
    text = new TextDecoder("utf-8", {fatal: true}).decode(raw);
  } catch (error) {
    fail(`receipt is not UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!text.endsWith("\n") || text.slice(0, -1).includes("\n")) fail("receipt must be exactly one canonical JSON line");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(0, -1));
  } catch (error) {
    fail(`receipt JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  const object = objectValue(parsed, "receipt");
  exactKeys(object, ["schema", "runnerKind", "identity", "observedIdentityPaths", "parserReceiptRaw32", "parserSemanticRaw32", "stages", "sevenStageRootRaw32", "receiptSha256"], "receipt");
  if (`${canonicalJson(object)}\n` !== text) fail("receipt is not canonical JSON");
  if (object.schema !== CHENG_EXECUTION_STAGE_BUNDLE_SCHEMA) fail("receipt schema mismatch");
  if (object.runnerKind !== CHENG_EXECUTION_STAGE_RUNNER_KIND) fail("receipt runner kind mismatch");
  const receiptSha256 = observedRaw32(object.receiptSha256, "receipt.receiptSha256");
  const payload: JsonObject = {...object};
  delete payload.receiptSha256;
  if (sha256(canonicalJson(payload)) !== receiptSha256) fail("receipt payload self hash mismatch");
  const paths = objectValue(object.observedIdentityPaths, "receipt.observedIdentityPaths");
  exactKeys(paths, ["sourceBundlePath", "materializerBytesPath", "grammarObligationPath", "compilerSourceClosurePath", "driverBytesPath", "toolchainManifestPath", "commandManifestPath"], "receipt.observedIdentityPaths");
  if (!Array.isArray(object.stages)) fail("receipt.stages must be an array");
  return {
    schema: CHENG_EXECUTION_STAGE_BUNDLE_SCHEMA,
    runnerKind: CHENG_EXECUTION_STAGE_RUNNER_KIND,
    identity: parseIdentity(object.identity),
    observedIdentityPaths: {
      sourceBundlePath: canonicalRelativePath(paths.sourceBundlePath, "receipt.observedIdentityPaths.sourceBundlePath"),
      materializerBytesPath: canonicalRelativePath(paths.materializerBytesPath, "receipt.observedIdentityPaths.materializerBytesPath"),
      grammarObligationPath: canonicalRelativePath(paths.grammarObligationPath, "receipt.observedIdentityPaths.grammarObligationPath"),
      compilerSourceClosurePath: canonicalRelativePath(paths.compilerSourceClosurePath, "receipt.observedIdentityPaths.compilerSourceClosurePath"),
      driverBytesPath: canonicalRelativePath(paths.driverBytesPath, "receipt.observedIdentityPaths.driverBytesPath"),
      toolchainManifestPath: canonicalRelativePath(paths.toolchainManifestPath, "receipt.observedIdentityPaths.toolchainManifestPath"),
      commandManifestPath: canonicalRelativePath(paths.commandManifestPath, "receipt.observedIdentityPaths.commandManifestPath"),
    },
    parserReceiptRaw32: observedRaw32(object.parserReceiptRaw32, "receipt.parserReceiptRaw32"),
    parserSemanticRaw32: observedRaw32(object.parserSemanticRaw32, "receipt.parserSemanticRaw32"),
    stages: object.stages.map((entry, index) => parseStage(entry, index)),
    sevenStageRootRaw32: observedRaw32(object.sevenStageRootRaw32, "receipt.sevenStageRootRaw32"),
    receiptSha256,
  };
}

function requirePinnedFile(root: string, pin: CompilerExecutionStageFilePin, label: string): StableFileIdentity {
  const actual = stableFileIdentity(root, pin.path, label);
  if (actual.bytesRaw32 !== pin.bytesRaw32) fail(`${label} bytes differ from the external policy pin`);
  return actual;
}

export function validateCompilerExecutionStageReceipt(
  policyInput: CompilerExecutionStageReceiptPolicy | unknown,
): CompilerExecutionStageReceiptValidation {
  const {policy, root} = parsePolicy(policyInput);
  const receiptFile = requirePinnedFile(root, policy.receipt, "receipt file");
  if (receiptFile.byteLength > MAX_CANONICAL_RECEIPT_BYTES) fail("receipt file exceeds the canonical wire ceiling");
  const receiptPath = join(root, ...receiptFile.relativePath.split("/"));
  const fd = openSync(receiptPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let raw: Buffer;
  try {
    const stat = fstatSync(fd, {bigint: true});
    if (!sameStat(stat, receiptFile.stat)) fail("receipt file identity changed between hash and parse");
    if (stat.size > BigInt(Number.MAX_SAFE_INTEGER)) fail("receipt file is too large");
    raw = Buffer.allocUnsafe(Number(stat.size));
    let offset = 0;
    while (offset < raw.length) {
      const count = readSync(fd, raw, offset, raw.length - offset, offset);
      if (count <= 0) fail("receipt file truncated during parse");
      offset += count;
    }
    const afterFd = fstatSync(fd, {bigint: true});
    const afterPath = lstatSync(receiptPath, {bigint: true});
    if (afterPath.isSymbolicLink() || !afterPath.isFile() || afterPath.nlink !== 1n ||
        !sameStat(stat, afterFd) || !sameStat(afterFd, afterPath)) {
      fail("receipt file identity changed during parse");
    }
  } finally {
    closeSync(fd);
  }
  if (sha256(raw) !== receiptFile.bytesRaw32) fail("receipt file changed between hash and parse");
  const bundle = parseBundle(raw);
  if (bundle.identity.caseId !== policy.caseId || bundle.identity.targetTriple !== policy.targetTriple) fail("identity case or target differs from external policy");

  const identityPathPins = [
    ["sourceBundlePath", "sourceBundleRaw32", policy.identityInputs.sourceBundle],
    ["materializerBytesPath", "materializerBytesRaw32", policy.identityInputs.materializerBytes],
    ["grammarObligationPath", "grammarObligationRootRaw32", policy.identityInputs.grammarObligation],
    ["compilerSourceClosurePath", "compilerSourceClosureRaw32", policy.identityInputs.compilerSourceClosure],
    ["driverBytesPath", "driverBytesRaw32", policy.identityInputs.driverBytes],
    ["toolchainManifestPath", "toolchainManifestRaw32", policy.identityInputs.toolchainManifest],
    ["commandManifestPath", "commandManifestRaw32", policy.identityInputs.commandManifest],
  ] as const;
  for (const [pathKey, hashKey, pin] of identityPathPins) {
    if (bundle.observedIdentityPaths[pathKey] !== pin.path) fail(`identity ${pathKey} differs from external policy`);
    const observed = requirePinnedFile(root, pin, `identity ${pathKey}`);
    if (bundle.identity[hashKey] !== observed.bytesRaw32) fail(`identity ${hashKey} does not hash the observed file`);
  }
  const {executionRaw32: _ignoredExecutionRaw32, ...identityPayload} = bundle.identity;
  if (computeExecutionRaw32(identityPayload) !== bundle.identity.executionRaw32) fail("execution identity self hash mismatch");
  if (bundle.parserReceiptRaw32 !== policy.parserReceiptRaw32 || bundle.parserSemanticRaw32 !== policy.parserSemanticRaw32) fail("parser prerequisite roots differ from external policy");
  if (bundle.stages.length !== STAGE_PLAN.length) fail("missing stage: exactly seven stage receipts are required");

  const receiptRoots: string[] = [];
  const semanticRoots: string[] = [];
  const artifactLengths: number[] = [];
  const stageBindings: Array<
    CompilerExecutionStageReceiptValidation["stageBindings"][number]
  > = [];
  const observedArtifactPaths = new Set<string>();
  for (let index = 0; index < STAGE_PLAN.length; index += 1) {
    const plan = STAGE_PLAN[index];
    const stage = bundle.stages[index];
    const stagePolicy = policy.stages[index];
    if (plan === undefined || stage === undefined || stagePolicy === undefined) fail(`missing stage ${index + 1}`);
    const label = `stage ${plan.ordinal} ${plan.kind}`;
    if (stage.stageOrdinal !== plan.ordinal || stage.stageKind !== plan.kind) fail(`${label} is missing or reordered`);
    if (stage.laneKind !== plan.lane || stage.predecessorStageKind !== plan.predecessor) fail(`${label} has wrong lane or branch predecessor kind`);
    if (stagePolicy.stageKind !== plan.kind) fail(`${label} differs from producer policy`);
    if (stage.producerSourcePath !== stagePolicy.producerSource.path) fail(`${label} producer source path differs from policy`);
    const producer = requirePinnedFile(root, stagePolicy.producerSource, `${label} producer source`);
    if (stage.producerSourceRaw32 !== producer.bytesRaw32) fail(`${label} producer source bytes mismatch`);
    if (stage.executionRaw32 !== bundle.identity.executionRaw32) fail(`${label} execution identity drift`);
    const expectedPredecessor = plan.predecessorIndex < 0 ? bundle.parserReceiptRaw32 : receiptRoots[plan.predecessorIndex];
    const expectedInput = plan.predecessorIndex < 0 ? bundle.parserSemanticRaw32 : semanticRoots[plan.predecessorIndex];
    if (expectedPredecessor === undefined || stage.predecessorReceiptRaw32 !== expectedPredecessor) fail(`${label} has wrong branch predecessor receipt`);
    if (expectedInput === undefined || stage.inputSemanticRaw32 !== expectedInput) fail(`${label} has wrong semantic transition`);
    if (stage.sidecarSchema !== plan.sidecarSchema || stage.artifactKind !== plan.artifactKind) fail(`${label} semantic schema or artifact kind mismatch`);
    if (stage.sidecarPath !== stagePolicy.sidecarPath || stage.artifactPath !== stagePolicy.artifactPath) fail(`${label} sidecar or artifact path differs from policy`);
    if (stage.sidecarPath === stage.artifactPath) fail(`${label} aliases sidecar and artifact`);
    for (const path of [stage.sidecarPath, stage.artifactPath]) {
      if (observedArtifactPaths.has(path)) fail(`${label} reuses another stage evidence path`);
      observedArtifactPaths.add(path);
    }
    const sidecar = stableFileIdentity(root, stage.sidecarPath, `${label} sidecar`);
    const artifact = stableFileIdentity(root, stage.artifactPath, `${label} artifact`);
    if (sidecar.bytesRaw32 !== stagePolicy.sidecarBytesRaw32) fail(`${label} sidecar bytes differ from the external policy pin`);
    if (artifact.bytesRaw32 !== stagePolicy.artifactBytesRaw32) fail(`${label} artifact bytes differ from the external policy pin`);
    if (stage.sidecarByteLength !== sidecar.byteLength || stage.sidecarBytesRaw32 !== sidecar.bytesRaw32) fail(`${label} sidecar bytes mismatch`);
    if (stage.outputSemanticRaw32 !== sidecar.bytesRaw32) fail(`${label} output semantic root is not the sidecar bytes hash`);
    if (stage.artifactByteLength !== artifact.byteLength || stage.artifactBytesRaw32 !== artifact.bytesRaw32) fail(`${label} artifact bytes mismatch`);
    if (computeStageRaw32(stage) !== stage.receiptRaw32) fail(`${label} receipt self hash mismatch`);
    receiptRoots.push(stage.receiptRaw32);
    semanticRoots.push(stage.outputSemanticRaw32);
    artifactLengths.push(stage.artifactByteLength);
    stageBindings.push(Object.freeze({
      stageOrdinal: stage.stageOrdinal,
      stageKind: plan.kind,
      executionRaw32: stage.executionRaw32,
      sourceBundleRaw32: bundle.identity.sourceBundleRaw32,
      compilerSourceClosureRaw32:
        bundle.identity.compilerSourceClosureRaw32,
      toolchainManifestRaw32:
        bundle.identity.toolchainManifestRaw32,
      ingressRaw32: stage.inputSemanticRaw32,
      actionRaw32: stage.sidecarBytesRaw32,
      fragmentRaw32: stage.receiptRaw32,
      objectRaw32: stage.artifactBytesRaw32,
      receiptRaw32: stage.receiptRaw32,
    }));
  }
  if (computeSevenStageRootRaw32(bundle) !== bundle.sevenStageRootRaw32) fail("seven-stage root self hash mismatch");
  return Object.freeze({
    schema: CHENG_EXECUTION_STAGE_VALIDATION_SCHEMA,
    status: "VERIFIED" as const,
    officialRunnerStatus: "CURRENT_CONSUMER_REQUIRED" as const,
    receiptFileBytesRaw32: receiptFile.bytesRaw32,
    executionRaw32: bundle.identity.executionRaw32,
    sevenStageRootRaw32: bundle.sevenStageRootRaw32,
    sourceBundleRaw32: bundle.identity.sourceBundleRaw32,
    compilerSourceClosureRaw32:
      bundle.identity.compilerSourceClosureRaw32,
    toolchainManifestRaw32:
      bundle.identity.toolchainManifestRaw32,
    driverBytesRaw32: bundle.identity.driverBytesRaw32,
    parserReceiptRaw32: bundle.parserReceiptRaw32,
    parserSemanticRaw32: bundle.parserSemanticRaw32,
    stageReceiptRaw32s: Object.freeze(receiptRoots),
    stageArtifactByteLengths: Object.freeze(artifactLengths),
    stageBindings: Object.freeze(stageBindings),
  });
}
