#!/usr/bin/env bun
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {
  CHENG_CURRENT_OFFICIAL_SEVEN_STAGE_MANIFEST_SCHEMA,
  runCurrentOfficialSevenStageAdmission,
  serializeCurrentOfficialSevenStageRunnerReport,
  validateCurrentOfficialSevenStageManifest,
  validateCurrentOfficialSevenStageRunnerReport,
  type CurrentOfficialSevenStageManifest,
} from "../src/cheng_current_official_seven_stage_runner.ts";
import {
  CHENG_EXECUTION_STAGE_VALIDATION_SCHEMA,
  type CompilerExecutionStageReceiptValidation,
} from "../src/cheng_execution_stage_receipt_validator.ts";
import {canonicalJson} from "../src/cheng_semantic_matrix_m9023.ts";
import {parseUniqueCurrentJson} from "../src/current_schema_json.ts";

function hash(label: string): string {
  return createHash("sha256").update(label).digest("hex");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const stageKinds = [
  "typed_expr",
  "csg",
  "lowering",
  "primary",
  "primary_regalloc",
  "backend2",
  "backend2_regalloc",
] as const;
const executionRaw32 = hash("current-execution");
const sourceBundleRaw32 = hash("source-bundle");
const sourceSnapshotManifestRaw32 = hash("source-snapshot-manifest");
const toolchainManifestRaw32 = hash("toolchain-manifest");
const stageBindings = stageKinds.map((stageKind, index) => ({
  stageOrdinal: index + 1,
  stageKind,
  executionRaw32,
  sourceBundleRaw32,
  compilerSourceClosureRaw32: sourceSnapshotManifestRaw32,
  toolchainManifestRaw32,
  ingressRaw32: hash(`${stageKind}:ingress`),
  actionRaw32: hash(`${stageKind}:action`),
  fragmentRaw32: hash(`${stageKind}:fragment`),
  objectRaw32: hash(`${stageKind}:object`),
  receiptRaw32: hash(`${stageKind}:receipt`),
}));
const parserIngressRaw32 = hash("parser-ingress");
const parserMapRaw32 = hash("parser-map");
const officialDriverRaw32 = hash("official-driver");
const sevenStageRootRaw32 = hash("seven-stage-root");
const execution: CompilerExecutionStageReceiptValidation = {
  schema: CHENG_EXECUTION_STAGE_VALIDATION_SCHEMA,
  status: "VERIFIED",
  officialRunnerStatus: "CURRENT_CONSUMER_REQUIRED",
  receiptFileBytesRaw32: hash("receipt-file"),
  executionRaw32,
  sevenStageRootRaw32,
  sourceBundleRaw32,
  compilerSourceClosureRaw32: sourceSnapshotManifestRaw32,
  toolchainManifestRaw32,
  driverBytesRaw32: officialDriverRaw32,
  parserReceiptRaw32: parserIngressRaw32,
  parserSemanticRaw32: parserMapRaw32,
  stageReceiptRaw32s: stageBindings.map((row) => row.receiptRaw32),
  stageArtifactByteLengths: stageBindings.map((_, index) => index + 1),
  stageBindings,
};
const expected = {
  parserIngressRaw32,
  parserMapRaw32,
  sourceSnapshotManifestRaw32,
  officialDriverRaw32,
  execution,
};

function seal(
  value: Omit<CurrentOfficialSevenStageManifest, "manifestRaw32"> & {
    manifestRaw32?: string;
  },
): CurrentOfficialSevenStageManifest {
  const payload = {...value} as Record<string, unknown>;
  delete payload.manifestRaw32;
  return {
    ...value,
    manifestRaw32: createHash("sha256")
      .update(canonicalJson(payload))
      .digest("hex"),
  } as CurrentOfficialSevenStageManifest;
}

const manifest = seal({
  schema: CHENG_CURRENT_OFFICIAL_SEVEN_STAGE_MANIFEST_SCHEMA,
  implemented: true,
  status: "COMPLETE",
  parserIngressRaw32,
  parserMapRaw32,
  sourceBundleRaw32,
  compilerSourceClosureRaw32: sourceSnapshotManifestRaw32,
  toolchainManifestRaw32,
  officialDriverRaw32,
  executionRaw32,
  sevenStageRootRaw32,
  stages: stageBindings,
});
assert.equal(
  validateCurrentOfficialSevenStageManifest(manifest, expected)
    .stages.length,
  7,
);

function reject(
  name: string,
  mutation: (value: any) => void,
  pattern: RegExp,
): void {
  const value = clone(manifest) as any;
  mutation(value);
  const resealed = seal(value);
  assert.throws(
    () => validateCurrentOfficialSevenStageManifest(resealed, expected),
    pattern,
    name,
  );
}

reject(
  "not-implemented",
  (value) => {
    value.implemented = false;
    value.status = "INCOMPLETE";
  },
  /runner_not_implemented/,
);
reject(
  "missing-column",
  (value) => delete value.stages[4].actionRaw32,
  /keys_invalid/,
);
reject(
  "missing-source-column",
  (value) => delete value.stages[4].sourceBundleRaw32,
  /keys_invalid/,
);
reject(
  "missing-stage",
  (value) => value.stages.splice(3, 1),
  /manifest_header_invalid/,
);
reject(
  "ingress-swap",
  (value) => {
    [value.stages[0].ingressRaw32, value.stages[1].ingressRaw32] =
      [value.stages[1].ingressRaw32, value.stages[0].ingressRaw32];
  },
  /ingressRaw32_drift/,
);
reject(
  "action-swap",
  (value) => {
    [value.stages[4].actionRaw32, value.stages[6].actionRaw32] =
      [value.stages[6].actionRaw32, value.stages[4].actionRaw32];
  },
  /actionRaw32_drift/,
);
reject(
  "fragment-swap",
  (value) => {
    [value.stages[4].fragmentRaw32, value.stages[6].fragmentRaw32] =
      [value.stages[6].fragmentRaw32, value.stages[4].fragmentRaw32];
  },
  /fragmentRaw32_drift/,
);
reject(
  "object-swap",
  (value) => {
    [value.stages[3].objectRaw32, value.stages[5].objectRaw32] =
      [value.stages[5].objectRaw32, value.stages[3].objectRaw32];
  },
  /objectRaw32_drift/,
);
reject(
  "driver-swap",
  (value) => value.officialDriverRaw32 = hash("other-driver"),
  /official_driver_binding_drift/,
);
reject(
  "source-swap",
  (value) => value.sourceBundleRaw32 = hash("other-source"),
  /source_bundle_binding_drift/,
);
reject(
  "stage-source-swap",
  (value) => value.stages[6].sourceBundleRaw32 = hash("other-stage-source"),
  /sourceBundleRaw32_drift/,
);
reject(
  "stage-compiler-swap",
  (value) => {
    value.stages[6].compilerSourceClosureRaw32 =
      hash("other-stage-compiler");
  },
  /compilerSourceClosureRaw32_drift/,
);
reject(
  "stage-toolchain-swap",
  (value) => {
    value.stages[6].toolchainManifestRaw32 = hash("other-stage-toolchain");
  },
  /toolchainManifestRaw32_drift/,
);
reject(
  "toolchain-swap",
  (value) => value.toolchainManifestRaw32 = hash("other-toolchain"),
  /toolchain_binding_drift/,
);
reject(
  "execution-swap",
  (value) => value.stages[6].executionRaw32 = hash("other-execution"),
  /executionRaw32_drift/,
);
reject(
  "parser-ingress-swap",
  (value) => value.parserIngressRaw32 = hash("other-parser-ingress"),
  /parser_ingress_binding_drift/,
);

assert.throws(
  () => parseUniqueCurrentJson(
    JSON.stringify({...manifest, compatibilityReader: false}),
    "current_official_runner_manifest",
  ),
  /forbidden_compatibility_key/,
);

const current = await runCurrentOfficialSevenStageAdmission({
  officialCurrentBuildBindingPath: "/tmp/current-official-binding.kv",
  harnessManifestPath: "/tmp/parser-production-receipt-harness.json",
  executionPolicyPath: "/tmp/execution-stage-policy.json",
  runnerManifestPath: "/tmp/current-official-seven-stage-manifest.json",
});
assert.equal(current.status, "HARD_RED");
assert.equal(current.consumerImplemented, true);
assert.equal(current.verifiedStageCount, 0);
assert.equal(current.officialCurrentBuildBindingRaw32, "");
assert.equal(current.executionRaw32, "");
assert.equal(current.parserIngressRaw32, "");
validateCurrentOfficialSevenStageRunnerReport(current);
assert.equal(
  (parseUniqueCurrentJson(
    serializeCurrentOfficialSevenStageRunnerReport(current),
    "current_official_runner_report",
  ) as {status: string}).status,
  "HARD_RED",
);
assert.throws(
  () => validateCurrentOfficialSevenStageRunnerReport({
    ...current,
    verifiedStageCount: 1,
  }),
  /hard_red_must_not_witness/,
);

console.log(
  "item28 current official seven-stage runner: PASS " +
  "binding/columns/source/compiler/tool/ingress/action/fragment/object mutations",
);
