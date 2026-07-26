import assert from "node:assert/strict";

const preflightModulePath =
  `../src/${"cheng_regalloc_preflight_m9022"}.ts`;
const {
  FINAL_RELEASE_BINDING_KEYS,
  validateExecutionStageReleaseBindings,
  validateReleaseEvidenceFieldPresence,
} =
  await import(preflightModulePath);

const sha256 = "a".repeat(64);
const input: Record<string, string> = {
  releaseWorkRoot: "/private/tmp/cheng-regalloc-release",
  officialManifest: "/evidence/official.manifest",
  officialManifestSha256: sha256,
  baselineManifest: "/evidence/baseline.manifest",
  baselineManifestSha256: sha256,
  officialBuildReceipt: "/evidence/official-build.receipt",
  officialBuildReceiptSha256: sha256,
  backend2VersionManifest: "/evidence/backend2-epoch.manifest",
  backend2VersionManifestSha256: sha256,
  jobsLock: "/evidence/jobs.lock",
  jobsLockSha256: sha256,
  execDiffLock: "/evidence/exec-diff.lock",
  execDiffLockSha256: sha256,
  targetEmitLock: "/evidence/target-emit.lock",
  targetEmitLockSha256: sha256,
  gen3Lock: "/evidence/gen3.lock",
  gen3LockSha256: sha256,
  gen2Driver: "/evidence/GEN2",
  gen3Driver: "/evidence/GEN3",
  officialDriver: "/evidence/cheng",
};

assert.throws(
  () => validateReleaseEvidenceFieldPresence(input),
  /executionStagePolicy and executionStagePolicySha256 are required in release mode/,
);

input.executionStagePolicy = "/evidence/execution-stage.policy.json";
input.executionStagePolicySha256 = sha256;
assert.equal(validateReleaseEvidenceFieldPresence(input), true);
for (const key of [
  "execution_stage_policy_sha256",
  "execution_stage_receipt_sha256",
  "execution_identity_sha256",
  "execution_stage_root_sha256",
]) assert.equal(FINAL_RELEASE_BINDING_KEYS.includes(key), true, key);

const manifestSha256 = "b".repeat(64);
const driverSha256 = "c".repeat(64);
const producerSha256 = "d".repeat(64);
const policy = {
  targetTriple: "arm64-apple-darwin",
  identityInputs: {
    driverBytes: {bytesRaw32: driverSha256},
    compilerSourceClosure: {bytesRaw32: manifestSha256},
  },
  stages: Array.from({length: 7}, (_, index) => ({
    stageKind: `stage-${index + 1}`,
    producerSource: {
      path: "src/core/tooling/compiler_execution_stage_receipt.cheng",
      bytesRaw32: producerSha256,
    },
  })),
};
const validation = {
  receiptFileBytesRaw32: "e".repeat(64),
  executionRaw32: "f".repeat(64),
  sevenStageRootRaw32: "1".repeat(64),
  stageReceiptRaw32s: Array.from({length: 7}, (_, index) => `${index + 2}`.repeat(64)),
  stageArtifactByteLengths: Array.from({length: 7}, (_, index) => index + 1),
};
const sourceManifest = {
  sha256: manifestSha256,
  files: [{
    relativePath: "src/core/tooling/compiler_execution_stage_receipt.cheng",
    sha256: producerSha256,
  }],
};
const bound = validateExecutionStageReleaseBindings(
  policy,
  validation,
  driverSha256,
  sourceManifest,
);
assert.equal(bound.executionRaw32, validation.executionRaw32);
assert.equal(bound.sevenStageRootRaw32, validation.sevenStageRootRaw32);

assert.throws(
  () => validateExecutionStageReleaseBindings(
    {...policy, identityInputs: {...policy.identityInputs, driverBytes: {bytesRaw32: "9".repeat(64)}}},
    validation,
    driverSha256,
    sourceManifest,
  ),
  /official current-source driver bytes/,
);
assert.throws(
  () => validateExecutionStageReleaseBindings(
    policy,
    validation,
    driverSha256,
    {...sourceManifest, sha256: "8".repeat(64)},
  ),
  /current source manifest bytes/,
);
assert.throws(
  () => validateExecutionStageReleaseBindings(
    {...policy, stages: policy.stages.map((stage, index) => index === 4
      ? {...stage, producerSource: {...stage.producerSource, bytesRaw32: "7".repeat(64)}}
      : stage)},
    validation,
    driverSha256,
    sourceManifest,
  ),
  /producer source is not an exact current source-manifest member/,
);

console.log("item28 execution stage release requirement: PASS");
