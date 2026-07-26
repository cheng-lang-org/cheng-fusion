import {createHash} from "node:crypto";
import {lstatSync, readFileSync} from "node:fs";
import {basename, resolve} from "node:path";
import {
  admitCurrentParserReceipts,
  serializeCurrentParserReceiptIngressReport,
  type CurrentParserReceiptIngressInput,
} from "./cheng_current_parser_receipt_ingress.ts";
import {
  CHENG_EXECUTION_STAGE_OFFICIAL_RUNNER_STATUS,
  validateCompilerExecutionStageReceipt,
  type CompilerExecutionStageKind,
  type CompilerExecutionStageReceiptValidation,
} from "./cheng_execution_stage_receipt_validator.ts";
import {canonicalJson} from "./cheng_semantic_matrix_m9023.ts";
import {
  assertExactCurrentObjectKeys,
  parseUniqueCurrentJson,
} from "./current_schema_json.ts";

export const CHENG_CURRENT_OFFICIAL_SEVEN_STAGE_MANIFEST_SCHEMA =
  "cheng_current_official_seven_stage_manifest";
export const CHENG_CURRENT_OFFICIAL_SEVEN_STAGE_RUNNER_SCHEMA =
  "cheng_current_official_seven_stage_runner";

const HASH = /^[0-9a-f]{64}$/;
const STAGES = Object.freeze([
  "typed_expr",
  "csg",
  "lowering",
  "primary",
  "primary_regalloc",
  "backend2",
  "backend2_regalloc",
] as const);

export interface CurrentOfficialSevenStageBinding {
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
}

export interface CurrentOfficialSevenStageManifest {
  readonly schema:
    typeof CHENG_CURRENT_OFFICIAL_SEVEN_STAGE_MANIFEST_SCHEMA;
  readonly implemented: boolean;
  readonly status: "COMPLETE" | "INCOMPLETE";
  readonly parserIngressRaw32: string;
  readonly parserMapRaw32: string;
  readonly sourceBundleRaw32: string;
  readonly compilerSourceClosureRaw32: string;
  readonly toolchainManifestRaw32: string;
  readonly officialDriverRaw32: string;
  readonly executionRaw32: string;
  readonly sevenStageRootRaw32: string;
  readonly stages: readonly CurrentOfficialSevenStageBinding[];
  readonly manifestRaw32: string;
}

export interface CurrentOfficialSevenStageRunnerInput
  extends CurrentParserReceiptIngressInput {
  readonly executionPolicyPath: string;
  readonly runnerManifestPath: string;
}

export interface CurrentOfficialSevenStageRunnerReport {
  readonly schema:
    typeof CHENG_CURRENT_OFFICIAL_SEVEN_STAGE_RUNNER_SCHEMA;
  readonly status: "ADMITTED" | "HARD_RED";
  readonly reason: string;
  readonly consumerImplemented: true;
  readonly upstreamImplemented: boolean;
  readonly officialCurrentBuildBindingRaw32: string;
  readonly parserIngressRaw32: string;
  readonly parserMapRaw32: string;
  readonly sourceSnapshotManifestRaw32: string;
  readonly sourceBundleRaw32: string;
  readonly officialDriverRaw32: string;
  readonly executionRaw32: string;
  readonly sevenStageRootRaw32: string;
  readonly policyRaw32: string;
  readonly runnerManifestRaw32: string;
  readonly verifiedStageCount: number;
}

interface StableFile {
  readonly path: string;
  readonly bytes: Buffer;
  readonly raw32: string;
  readonly device: bigint;
  readonly inode: bigint;
  readonly size: bigint;
  readonly mode: bigint;
  readonly links: bigint;
  readonly modifiedNs: bigint;
  readonly changedNs: bigint;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableFile(pathRaw: string, label: string): StableFile {
  const path = resolve(pathRaw);
  const before = lstatSync(path, {bigint: true});
  if (before.isSymbolicLink() || !before.isFile() ||
      before.nlink !== 1n || before.size <= 0n ||
      before.size > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label}_identity_invalid`);
  }
  const bytes = readFileSync(path);
  const after = lstatSync(path, {bigint: true});
  for (const key of [
    "dev",
    "ino",
    "size",
    "mode",
    "nlink",
    "mtimeNs",
    "ctimeNs",
  ] as const) {
    if (before[key] !== after[key]) {
      throw new Error(`${label}_drift`);
    }
  }
  if (bytes.length !== Number(before.size)) {
    throw new Error(`${label}_size_invalid`);
  }
  return {
    path,
    bytes,
    raw32: sha256(bytes),
    device: before.dev,
    inode: before.ino,
    size: before.size,
    mode: before.mode,
    links: before.nlink,
    modifiedNs: before.mtimeNs,
    changedNs: before.ctimeNs,
  };
}

function sameStableFile(left: StableFile, right: StableFile): boolean {
  return left.path === right.path &&
    left.raw32 === right.raw32 &&
    left.device === right.device &&
    left.inode === right.inode &&
    left.size === right.size &&
    left.mode === right.mode &&
    left.links === right.links &&
    left.modifiedNs === right.modifiedNs &&
    left.changedNs === right.changedNs &&
    left.bytes.equals(right.bytes);
}

function observedHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !HASH.test(value) ||
      value === "0".repeat(64) ||
      value === sha256(Buffer.alloc(0))) {
    throw new Error(`${label}_raw32_invalid`);
  }
  return value;
}

function canonicalCurrentJsonFile(
  pathRaw: string,
  label: string,
): {file: StableFile; value: unknown} {
  const file = stableFile(pathRaw, label);
  const text = file.bytes.toString("utf8");
  if (!text.endsWith("\n") || text.slice(0, -1).includes("\n") ||
      Buffer.from(text, "utf8").length !== file.bytes.length) {
    throw new Error(`${label}_canonical_line_invalid`);
  }
  const value = parseUniqueCurrentJson(text.slice(0, -1), label);
  if (`${canonicalJson(value)}\n` !== text) {
    throw new Error(`${label}_canonical_json_invalid`);
  }
  return {file, value};
}

function exactBinding(
  value: unknown,
  index: number,
): CurrentOfficialSevenStageBinding {
  assertExactCurrentObjectKeys(value, [
    "stageOrdinal",
    "stageKind",
    "executionRaw32",
    "sourceBundleRaw32",
    "compilerSourceClosureRaw32",
    "toolchainManifestRaw32",
    "ingressRaw32",
    "actionRaw32",
    "fragmentRaw32",
    "objectRaw32",
    "receiptRaw32",
  ], `current_official_stage_${index}`);
  const binding = value as Record<string, unknown>;
  if (binding.stageOrdinal !== index + 1 ||
      binding.stageKind !== STAGES[index]) {
    throw new Error(`current_official_stage_${index}_column_or_order_invalid`);
  }
  return {
    stageOrdinal: index + 1,
    stageKind: STAGES[index]!,
    executionRaw32: observedHash(
      binding.executionRaw32,
      `current_official_stage_${index}_execution`,
    ),
    sourceBundleRaw32: observedHash(
      binding.sourceBundleRaw32,
      `current_official_stage_${index}_source_bundle`,
    ),
    compilerSourceClosureRaw32: observedHash(
      binding.compilerSourceClosureRaw32,
      `current_official_stage_${index}_compiler_source_closure`,
    ),
    toolchainManifestRaw32: observedHash(
      binding.toolchainManifestRaw32,
      `current_official_stage_${index}_toolchain_manifest`,
    ),
    ingressRaw32: observedHash(
      binding.ingressRaw32,
      `current_official_stage_${index}_ingress`,
    ),
    actionRaw32: observedHash(
      binding.actionRaw32,
      `current_official_stage_${index}_action`,
    ),
    fragmentRaw32: observedHash(
      binding.fragmentRaw32,
      `current_official_stage_${index}_fragment`,
    ),
    objectRaw32: observedHash(
      binding.objectRaw32,
      `current_official_stage_${index}_object`,
    ),
    receiptRaw32: observedHash(
      binding.receiptRaw32,
      `current_official_stage_${index}_receipt`,
    ),
  };
}

function parseRunnerManifest(
  value: unknown,
): CurrentOfficialSevenStageManifest {
  assertExactCurrentObjectKeys(value, [
    "schema",
    "implemented",
    "status",
    "parserIngressRaw32",
    "parserMapRaw32",
    "sourceBundleRaw32",
    "compilerSourceClosureRaw32",
    "toolchainManifestRaw32",
    "officialDriverRaw32",
    "executionRaw32",
    "sevenStageRootRaw32",
    "stages",
    "manifestRaw32",
  ], "current_official_seven_stage_manifest");
  const manifest = value as Record<string, unknown>;
  if (manifest.schema !==
        CHENG_CURRENT_OFFICIAL_SEVEN_STAGE_MANIFEST_SCHEMA ||
      typeof manifest.implemented !== "boolean" ||
      !["COMPLETE", "INCOMPLETE"].includes(String(manifest.status)) ||
      !Array.isArray(manifest.stages) ||
      manifest.stages.length !== STAGES.length) {
    throw new Error("current_official_manifest_header_invalid");
  }
  const manifestRaw32 = observedHash(
    manifest.manifestRaw32,
    "current_official_manifest",
  );
  const payload = {...manifest};
  delete payload.manifestRaw32;
  if (sha256(canonicalJson(payload)) !== manifestRaw32) {
    throw new Error("current_official_manifest_self_hash_invalid");
  }
  return {
    schema: CHENG_CURRENT_OFFICIAL_SEVEN_STAGE_MANIFEST_SCHEMA,
    implemented: manifest.implemented,
    status: manifest.status as "COMPLETE" | "INCOMPLETE",
    parserIngressRaw32: observedHash(
      manifest.parserIngressRaw32,
      "current_official_parser_ingress",
    ),
    parserMapRaw32: observedHash(
      manifest.parserMapRaw32,
      "current_official_parser_map",
    ),
    sourceBundleRaw32: observedHash(
      manifest.sourceBundleRaw32,
      "current_official_source_bundle",
    ),
    compilerSourceClosureRaw32: observedHash(
      manifest.compilerSourceClosureRaw32,
      "current_official_compiler_source_closure",
    ),
    toolchainManifestRaw32: observedHash(
      manifest.toolchainManifestRaw32,
      "current_official_toolchain_manifest",
    ),
    officialDriverRaw32: observedHash(
      manifest.officialDriverRaw32,
      "current_official_driver",
    ),
    executionRaw32: observedHash(
      manifest.executionRaw32,
      "current_official_execution",
    ),
    sevenStageRootRaw32: observedHash(
      manifest.sevenStageRootRaw32,
      "current_official_seven_stage_root",
    ),
    stages: manifest.stages.map(exactBinding),
    manifestRaw32,
  };
}

export interface CurrentOfficialSevenStageExpected {
  readonly parserIngressRaw32: string;
  readonly parserMapRaw32: string;
  readonly sourceSnapshotManifestRaw32: string;
  readonly officialDriverRaw32: string;
  readonly execution: CompilerExecutionStageReceiptValidation;
}

export function validateCurrentOfficialSevenStageManifest(
  value: unknown,
  expected: CurrentOfficialSevenStageExpected,
): CurrentOfficialSevenStageManifest {
  const manifest = parseRunnerManifest(value);
  if (!manifest.implemented || manifest.status !== "COMPLETE") {
    throw new Error("current_official_runner_not_implemented");
  }
  for (const [label, actual, wanted] of [
    [
      "parser_ingress",
      manifest.parserIngressRaw32,
      expected.parserIngressRaw32,
    ],
    ["parser_map", manifest.parserMapRaw32, expected.parserMapRaw32],
    [
      "source_bundle",
      manifest.sourceBundleRaw32,
      expected.execution.sourceBundleRaw32,
    ],
    [
      "compiler_source",
      manifest.compilerSourceClosureRaw32,
      expected.sourceSnapshotManifestRaw32,
    ],
    [
      "toolchain",
      manifest.toolchainManifestRaw32,
      expected.execution.toolchainManifestRaw32,
    ],
    [
      "official_driver",
      manifest.officialDriverRaw32,
      expected.officialDriverRaw32,
    ],
    [
      "execution",
      manifest.executionRaw32,
      expected.execution.executionRaw32,
    ],
    [
      "seven_stage_root",
      manifest.sevenStageRootRaw32,
      expected.execution.sevenStageRootRaw32,
    ],
  ] as const) {
    if (actual !== wanted) {
      throw new Error(`current_official_${label}_binding_drift`);
    }
  }
  if (expected.execution.compilerSourceClosureRaw32 !==
        expected.sourceSnapshotManifestRaw32 ||
      expected.execution.driverBytesRaw32 !==
        expected.officialDriverRaw32 ||
      expected.execution.parserReceiptRaw32 !==
        expected.parserIngressRaw32 ||
      expected.execution.parserSemanticRaw32 !== expected.parserMapRaw32) {
    throw new Error("current_official_execution_prerequisite_drift");
  }
  if (expected.execution.stageBindings.length !== STAGES.length ||
      manifest.stages.length !== expected.execution.stageBindings.length) {
    throw new Error("current_official_stage_column_count_invalid");
  }
  for (let index = 0; index < STAGES.length; index += 1) {
    const actual = manifest.stages[index]!;
    const wanted = expected.execution.stageBindings[index]!;
    if (canonicalJson(actual) !== canonicalJson(wanted)) {
      throw new Error(
        `current_official_stage_${index}_${firstBindingDrift(actual, wanted)}`,
      );
    }
  }
  return manifest;
}

function firstBindingDrift(
  actual: CurrentOfficialSevenStageBinding,
  wanted: CurrentOfficialSevenStageBinding,
): string {
  for (const key of [
    "stageOrdinal",
    "stageKind",
    "executionRaw32",
    "sourceBundleRaw32",
    "compilerSourceClosureRaw32",
    "toolchainManifestRaw32",
    "ingressRaw32",
    "actionRaw32",
    "fragmentRaw32",
    "objectRaw32",
    "receiptRaw32",
  ] as const) {
    if (actual[key] !== wanted[key]) return `${key}_drift`;
  }
  return "binding_drift";
}

function hardRed(
  reason: string,
  upstreamImplemented = false,
): CurrentOfficialSevenStageRunnerReport {
  return {
    schema: CHENG_CURRENT_OFFICIAL_SEVEN_STAGE_RUNNER_SCHEMA,
    status: "HARD_RED",
    reason,
    consumerImplemented: true,
    upstreamImplemented,
    officialCurrentBuildBindingRaw32: "",
    parserIngressRaw32: "",
    parserMapRaw32: "",
    sourceSnapshotManifestRaw32: "",
    sourceBundleRaw32: "",
    officialDriverRaw32: "",
    executionRaw32: "",
    sevenStageRootRaw32: "",
    policyRaw32: "",
    runnerManifestRaw32: "",
    verifiedStageCount: 0,
  };
}

function validateInputPaths(input: CurrentOfficialSevenStageRunnerInput): void {
  assertExactCurrentObjectKeys(input, [
    "officialCurrentBuildBindingPath",
    "harnessManifestPath",
    "executionPolicyPath",
    "runnerManifestPath",
  ], "current_official_seven_stage_runner_input");
  if (input.officialCurrentBuildBindingPath !==
        resolve(input.officialCurrentBuildBindingPath) ||
      input.harnessManifestPath !== resolve(input.harnessManifestPath) ||
      basename(input.harnessManifestPath) !==
        "parser-production-receipt-harness.json" ||
      input.executionPolicyPath !== resolve(input.executionPolicyPath) ||
      input.runnerManifestPath !== resolve(input.runnerManifestPath)) {
    throw new Error("current_official_runner_input_path_invalid");
  }
}

export async function runCurrentOfficialSevenStageAdmission(
  input: CurrentOfficialSevenStageRunnerInput,
): Promise<CurrentOfficialSevenStageRunnerReport> {
  let upstreamImplemented = false;
  try {
    if (!CHENG_EXECUTION_STAGE_OFFICIAL_RUNNER_STATUS.implemented) {
      throw new Error("current_official_consumer_not_implemented");
    }
    validateInputPaths(input);
    const parserIngress = await admitCurrentParserReceipts({
      officialCurrentBuildBindingPath:
        input.officialCurrentBuildBindingPath,
      harnessManifestPath: input.harnessManifestPath,
    });
    if (parserIngress.report.status !== "ADMITTED" ||
        parserIngress.admittedMapJson === undefined) {
      throw new Error(
        `current_parser_ingress_not_admitted:${parserIngress.report.reason}`,
      );
    }
    const parserIngressRaw32 = sha256(
      serializeCurrentParserReceiptIngressReport(parserIngress.report),
    );
    if (sha256(parserIngress.admittedMapJson) !==
        parserIngress.report.admittedMapSha256) {
      throw new Error("current_parser_map_bytes_drift");
    }
    const policyFile = canonicalCurrentJsonFile(
      input.executionPolicyPath,
      "current_execution_policy",
    );
    const execution = validateCompilerExecutionStageReceipt(
      policyFile.value,
    );
    const runnerFile = canonicalCurrentJsonFile(
      input.runnerManifestPath,
      "current_official_runner_manifest",
    );
    if (runnerFile.value !== null &&
        typeof runnerFile.value === "object" &&
        !Array.isArray(runnerFile.value)) {
      upstreamImplemented =
        (runnerFile.value as Record<string, unknown>).implemented === true;
    }
    const manifest = validateCurrentOfficialSevenStageManifest(
      runnerFile.value,
      {
        parserIngressRaw32,
        parserMapRaw32: parserIngress.report.admittedMapSha256,
        sourceSnapshotManifestRaw32:
          parserIngress.report.sourceSnapshotManifestSha256,
        officialDriverRaw32: parserIngress.report.officialDriverSha256,
        execution,
      },
    );
    const finalPolicy = stableFile(
      input.executionPolicyPath,
      "current_execution_policy",
    );
    const finalRunner = stableFile(
      input.runnerManifestPath,
      "current_official_runner_manifest",
    );
    if (!sameStableFile(policyFile.file, finalPolicy) ||
        !sameStableFile(runnerFile.file, finalRunner)) {
      throw new Error("current_official_runner_input_drift");
    }
    const report: CurrentOfficialSevenStageRunnerReport = {
      schema: CHENG_CURRENT_OFFICIAL_SEVEN_STAGE_RUNNER_SCHEMA,
      status: "ADMITTED",
      reason: "",
      consumerImplemented: true,
      upstreamImplemented: true,
      officialCurrentBuildBindingRaw32:
        parserIngress.report.officialCurrentBuildBindingSha256,
      parserIngressRaw32,
      parserMapRaw32: parserIngress.report.admittedMapSha256,
      sourceSnapshotManifestRaw32:
        parserIngress.report.sourceSnapshotManifestSha256,
      sourceBundleRaw32: execution.sourceBundleRaw32,
      officialDriverRaw32: parserIngress.report.officialDriverSha256,
      executionRaw32: execution.executionRaw32,
      sevenStageRootRaw32: execution.sevenStageRootRaw32,
      policyRaw32: policyFile.file.raw32,
      runnerManifestRaw32: runnerFile.file.raw32,
      verifiedStageCount: manifest.stages.length,
    };
    validateCurrentOfficialSevenStageRunnerReport(report);
    return report;
  } catch (error) {
    const report = hardRed(
      error instanceof Error ? error.message : String(error),
      upstreamImplemented,
    );
    validateCurrentOfficialSevenStageRunnerReport(report);
    return report;
  }
}

export function validateCurrentOfficialSevenStageRunnerReport(
  value: unknown,
): asserts value is CurrentOfficialSevenStageRunnerReport {
  assertExactCurrentObjectKeys(value, [
    "schema",
    "status",
    "reason",
    "consumerImplemented",
    "upstreamImplemented",
    "officialCurrentBuildBindingRaw32",
    "parserIngressRaw32",
    "parserMapRaw32",
    "sourceSnapshotManifestRaw32",
    "sourceBundleRaw32",
    "officialDriverRaw32",
    "executionRaw32",
    "sevenStageRootRaw32",
    "policyRaw32",
    "runnerManifestRaw32",
    "verifiedStageCount",
  ], "current_official_seven_stage_runner_report");
  const report = value;
  if (report.schema !== CHENG_CURRENT_OFFICIAL_SEVEN_STAGE_RUNNER_SCHEMA ||
      !["ADMITTED", "HARD_RED"].includes(report.status) ||
      typeof report.reason !== "string" ||
      report.consumerImplemented !== true ||
      typeof report.upstreamImplemented !== "boolean" ||
      !Number.isSafeInteger(report.verifiedStageCount) ||
      report.verifiedStageCount < 0) {
    throw new Error("current_official_runner_report_header_invalid");
  }
  const hashes = [
    report.officialCurrentBuildBindingRaw32,
    report.parserIngressRaw32,
    report.parserMapRaw32,
    report.sourceSnapshotManifestRaw32,
    report.sourceBundleRaw32,
    report.officialDriverRaw32,
    report.executionRaw32,
    report.sevenStageRootRaw32,
    report.policyRaw32,
    report.runnerManifestRaw32,
  ];
  if (report.status === "HARD_RED") {
    if (report.reason === "" || hashes.some((hash) => hash !== "") ||
        report.verifiedStageCount !== 0) {
      throw new Error("current_official_runner_hard_red_must_not_witness");
    }
  } else if (report.reason !== "" || !report.upstreamImplemented ||
      hashes.some((hash) => !HASH.test(hash)) ||
      report.verifiedStageCount !== STAGES.length) {
    throw new Error("current_official_runner_admission_incomplete");
  }
}

export function serializeCurrentOfficialSevenStageRunnerReport(
  report: CurrentOfficialSevenStageRunnerReport,
): string {
  validateCurrentOfficialSevenStageRunnerReport(report);
  return JSON.stringify(report, null, 2) + "\n";
}
