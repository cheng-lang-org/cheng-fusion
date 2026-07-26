#!/usr/bin/env bun
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  lstatSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  CHENG_CURRENT_RELEASE_AUDIT_SCHEMA,
  CHENG_CURRENT_RELEASE_MANIFEST_SCHEMA,
  assembleCurrentReleaseManifest,
  auditCurrentReleaseGreen,
  inspectCurrentReleasePublisherEnvelope,
  pinCurrentExecutionPolicyClosure,
  pinCurrentParserHarnessClosure,
  serializeCurrentReleaseGreenAuditReport,
  validateCurrentReleaseCompositeIdentity,
  validateCurrentReleaseFreshMcpBinding,
  validateCurrentReleaseFreshMcpTypeArenaBinding,
  validateCurrentReleaseGreenAuditReport,
  validateCurrentReleaseManifestBindings,
  validateCurrentReleaseMemoryIdentityBinding,
  validateCurrentReleaseOfficialReplay,
  validateCurrentReleaseSemanticSnapshotReceipts,
} from "../src/cheng_current_release_green_audit.ts";
import {
  probeFreshChengFusionMcpRuntime,
  validateFreshChengFusionMcpRuntimeReceipt,
} from "../src/cheng_fusion_fresh_mcp_probe.ts";
import {
  CHENG_CURRENT_OFFICIAL_SEVEN_STAGE_RUNNER_SCHEMA,
  type CurrentOfficialSevenStageRunnerReport,
} from "../src/cheng_current_official_seven_stage_runner.ts";
import {
  CHENG_CURRENT_OFFICIAL_DRIVER,
  CHENG_CURRENT_ROOT,
} from "../src/cheng_current_parser_receipt_ingress.ts";
import {
  CHENG_CURRENT_DRIVER_GENERATION_ENVIRONMENT_SCHEMA,
  CHENG_CURRENT_DRIVER_GENERATION_RECEIPT_SCHEMA,
  CHENG_CURRENT_SEMANTIC_INPUT_SPECS,
  currentGenerationExecutionRaw32,
  parseCurrentGenerationEnvironment,
  validateCurrentDriverGenerationReceipt,
  type CurrentGenerationExecution,
} from "../src/cheng_current_release_evidence_validator.ts";
import { SEMANTIC_SNAPSHOT_AUDIT_INPUT_SPECS } from "../src/cheng_semantic_snapshot_audit.ts";
import { canonicalJson } from "../src/cheng_semantic_matrix_m9023.ts";
import { parseUniqueCurrentJson } from "../src/current_schema_json.ts";

function hash(label: string): string {
  return createHash("sha256").update(label).digest("hex");
}

function sealKv(lines: readonly string[], payloadKey: string): string {
  const payload = `${lines.join("\n")}\n`;
  return `${payload}${payloadKey}=${createHash("sha256")
    .update(payload)
    .digest("hex")}\n`;
}

function writePublisherEnvelopeFixture(root: string): string {
  const artifacts = [
    ["binding.kv", "binding\n"],
    ["completion-index.kv", "completion\n"],
    ["contract.kv", "contract\n"],
  ] as const;
  for (const [name, raw] of artifacts) {
    writeFileSync(join(root, name), raw, { flag: "wx", mode: 0o400 });
  }
  const manifestLines = [
    "schema=cheng.backend2.current_source_release_artifact_manifest",
    "status=PASS",
    "driver_role=production",
    `producer_root_fshex=${Buffer.from(root).toString("hex")}`,
    "directory_count=0",
    `artifact_count=${artifacts.length}`,
  ];
  for (const [index, [name]] of artifacts.entries()) {
    const path = join(root, name);
    const stat = lstatSync(path, { bigint: true });
    const raw = readFileSync(path);
    manifestLines.push(
      `artifact.${index}.path_fshex=${Buffer.from(name).toString("hex")}`,
      `artifact.${index}.sha256=${createHash("sha256").update(raw).digest("hex")}`,
      `artifact.${index}.device=${stat.dev}`,
      `artifact.${index}.inode=${stat.ino}`,
      `artifact.${index}.size=${stat.size}`,
      `artifact.${index}.mode=${stat.mode.toString(8)}`,
      `artifact.${index}.mtime_ns=${stat.mtimeNs}`,
      `artifact.${index}.ctime_ns=${stat.ctimeNs}`,
    );
  }
  const manifestPath = join(root, "artifact-manifest.kv");
  writeFileSync(
    manifestPath,
    sealKv(manifestLines, "manifest_payload_sha256"),
    { flag: "wx", mode: 0o400 },
  );
  const manifestStat = lstatSync(manifestPath, { bigint: true });
  const manifestRaw = readFileSync(manifestPath);
  const artifactRaw32 = (name: string) =>
    createHash("sha256").update(readFileSync(join(root, name))).digest("hex");
  const receiptLines = [
    "schema=cheng.backend2.current_source_release_publisher_receipt",
    "status=PASS",
    "release_status=GREEN",
    "red_count=0",
    "driver_role=production",
    "release_marker=RELEASE_GREEN",
    `producer_root_fshex=${Buffer.from(root).toString("hex")}`,
    `artifact_manifest_path_fshex=${Buffer.from(manifestPath).toString("hex")}`,
    `artifact_manifest_sha256=${createHash("sha256").update(manifestRaw).digest("hex")}`,
    `artifact_manifest_device=${manifestStat.dev}`,
    `artifact_manifest_inode=${manifestStat.ino}`,
    `artifact_manifest_size=${manifestStat.size}`,
    `artifact_manifest_mode=${manifestStat.mode.toString(8)}`,
    `artifact_manifest_mtime_ns=${manifestStat.mtimeNs}`,
    `artifact_manifest_ctime_ns=${manifestStat.ctimeNs}`,
    `artifact_count=${artifacts.length}`,
    "directory_count=0",
    `contract_sha256=${artifactRaw32("contract.kv")}`,
    `binding_sha256=${artifactRaw32("binding.kv")}`,
    `completion_index_sha256=${artifactRaw32("completion-index.kv")}`,
    ...[
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
    ].map((key) => `${key}=${hash(`publisher-fixture:${key}`)}`),
  ];
  const receiptPath = join(root, "publisher-receipt.kv");
  writeFileSync(
    receiptPath,
    sealKv(receiptLines, "receipt_payload_sha256"),
    { flag: "wx", mode: 0o400 },
  );
  return receiptPath;
}

const CURRENT_BINDING_PATH = "/tmp/current-official-binding.kv";
const CURRENT_PRIVATE_SOURCE_MANIFEST =
  "/tmp/compiler-candidate-evidence/cheng-source-snapshot.manifest.txt";

function pin(path: string, label = path) {
  return { path, byteLength: 64, bytesRaw32: hash(label) };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function seal<T extends Record<string, any>>(
  value: T,
  key: "manifestRaw32" | "receiptRaw32",
): T {
  const payload = { ...value };
  delete payload[key];
  return {
    ...value,
    [key]: createHash("sha256").update(canonicalJson(payload)).digest("hex"),
  };
}

function putPolicyFile(root: string, path: string, label: string) {
  const absolute = join(root, ...path.split("/"));
  mkdirSync(dirname(absolute), { recursive: true });
  const raw = Buffer.from(`${label}\n`, "utf8");
  writeFileSync(absolute, raw);
  return { path, bytesRaw32: createHash("sha256").update(raw).digest("hex") };
}

function existingHarnessPin(path: string) {
  const raw = readFileSync(path);
  return {
    path,
    sha256: createHash("sha256").update(raw).digest("hex"),
    byteLength: raw.length,
  };
}

assert.deepEqual(
  CHENG_CURRENT_SEMANTIC_INPUT_SPECS,
  SEMANTIC_SNAPSHOT_AUDIT_INPUT_SPECS.map((row) => [row.path, row.role]),
);

const publisherFixtureRoot = realpathSync.native(
  mkdtempSync(join(tmpdir(), "cheng-current-release-publisher-envelope-")),
);
try {
  const receiptPath = writePublisherEnvelopeFixture(publisherFixtureRoot);
  const envelope = inspectCurrentReleasePublisherEnvelope(receiptPath);
  assert.equal(envelope.producerRoot, publisherFixtureRoot);
  assert.equal(envelope.artifacts.length, 3);
  assert.deepEqual(
    envelope.artifacts.map((artifact) => artifact.path),
    [
      join(publisherFixtureRoot, "binding.kv"),
      join(publisherFixtureRoot, "completion-index.kv"),
      join(publisherFixtureRoot, "contract.kv"),
    ],
  );
  await assert.rejects(
    assembleCurrentReleaseManifest({
      officialCurrentBuildBindingPath: CURRENT_BINDING_PATH,
      harnessManifestPath: "/tmp/parser-production-receipt-harness.json",
      executionPolicyPath: "/tmp/execution-stage-policy.json",
      runnerManifestPath: "/tmp/current-official-seven-stage-manifest.json",
      publisherReceiptPath: receiptPath,
    }),
    /current_release_publisher_validator_red/,
  );
  writeFileSync(join(publisherFixtureRoot, "unmanifested.bin"), "drift\n", {
    flag: "wx",
    mode: 0o400,
  });
  assert.throws(
    () => inspectCurrentReleasePublisherEnvelope(receiptPath),
    /publisher_tree_manifest_drift/,
  );
} finally {
  rmSync(publisherFixtureRoot, { recursive: true, force: true });
}

const publisherMutationRoot = realpathSync.native(
  mkdtempSync(join(tmpdir(), "cheng-current-release-publisher-mutation-")),
);
try {
  const receiptPath = writePublisherEnvelopeFixture(publisherMutationRoot);
  const bindingPath = join(publisherMutationRoot, "binding.kv");
  chmodSync(bindingPath, 0o600);
  writeFileSync(bindingPath, "tampered\n");
  assert.throws(
    () => inspectCurrentReleasePublisherEnvelope(receiptPath),
    /publisher_artifact_0_identity_drift/,
  );
} finally {
  rmSync(publisherMutationRoot, { recursive: true, force: true });
}

const identity = {
  parserIngressRaw32: hash("parser-ingress"),
  sourceBundleRaw32: hash("source-bundle"),
  officialDriverRaw32: hash("official-driver"),
  executionRaw32: hash("execution"),
  sevenStageRootRaw32: hash("seven-stage-root"),
};
const sevenStage: CurrentOfficialSevenStageRunnerReport = {
  schema: CHENG_CURRENT_OFFICIAL_SEVEN_STAGE_RUNNER_SCHEMA,
  status: "ADMITTED",
  reason: "",
  consumerImplemented: true,
  upstreamImplemented: true,
  officialCurrentBuildBindingRaw32: hash("official-current-build-binding"),
  parserIngressRaw32: identity.parserIngressRaw32,
  parserMapRaw32: hash("parser-map"),
  sourceSnapshotManifestRaw32: hash("source-snapshot-manifest"),
  sourceBundleRaw32: identity.sourceBundleRaw32,
  officialDriverRaw32: identity.officialDriverRaw32,
  executionRaw32: identity.executionRaw32,
  sevenStageRootRaw32: identity.sevenStageRootRaw32,
  policyRaw32: hash("policy"),
  runnerManifestRaw32: hash("runner-manifest"),
  verifiedStageCount: 7,
};
const targets = [
  ["aarch64-apple-darwin", "arm64"],
  ["aarch64-unknown-linux-gnu", "aarch64"],
  ["x86_64-unknown-linux-gnu", "x86_64"],
].map(([targetTriple, architecture]) => {
  const stem = targetTriple!.replaceAll("-", "_");
  return {
    targetTriple,
    architecture,
    driverRaw32: hash(`${targetTriple}:driver`),
    backends: ["primary", "backend2"].map((backend) => ({
      backend,
      object: pin(`/release/${stem}.${backend}.o`),
      executable: pin(`/release/${stem}.${backend}.exe`),
      action: pin(`/release/${stem}.${backend}.action.json`),
      fragment: pin(`/release/${stem}.${backend}.fragment.json`),
      runStatus: pin(`/release/${stem}.${backend}.run-status.bin`),
      runStdout: pin(`/release/${stem}.${backend}.run-stdout.bin`),
      runStderr: pin(`/release/${stem}.${backend}.run-stderr.bin`),
      orcEvents: pin(`/release/${stem}.${backend}.orc-events.json`),
    })),
  };
});
const toolRows = [
  [
    "parser_ingress",
    "/Users/lbcheng/cheng-fusion/src/cheng_current_parser_receipt_ingress.ts",
  ],
  [
    "seven_stage_runner",
    "/Users/lbcheng/cheng-fusion/src/cheng_current_official_seven_stage_runner.ts",
  ],
  [
    "execution_validator",
    "/Users/lbcheng/cheng-fusion/src/cheng_execution_stage_receipt_validator.ts",
  ],
  [
    "semantic_snapshot_audit",
    "/Users/lbcheng/cheng-fusion/src/cheng_semantic_snapshot_audit.ts",
  ],
  [
    "memory_release_gate",
    "/Users/lbcheng/cheng-fusion/src/cheng_memory_release_gate.ts",
  ],
  [
    "release_evidence_validator",
    "/Users/lbcheng/cheng-fusion/src/cheng_current_release_evidence_validator.ts",
  ],
  [
    "target_performance_validator",
    "/Users/lbcheng/cheng-fusion/src/cheng_current_release_target_performance_validator.ts",
  ],
  [
    "mcp_runtime_identity",
    "/Users/lbcheng/cheng-fusion/src/cheng_fusion_mcp_runtime_identity.ts",
  ],
  [
    "fresh_mcp_probe",
    "/Users/lbcheng/cheng-fusion/src/cheng_fusion_fresh_mcp_probe.ts",
  ],
  [
    "fresh_mcp_runtime_cli",
    "/Users/lbcheng/cheng-fusion/tools/current_fresh_mcp_runtime_identity.ts",
  ],
  [
    "fresh_mcp_type_arena_execution",
    "/Users/lbcheng/cheng-fusion/src/cheng_fusion_fresh_mcp_type_arena_execution.ts",
  ],
  [
    "fresh_mcp_type_arena_cli",
    "/Users/lbcheng/cheng-fusion/tools/current_fresh_mcp_type_arena_execution.ts",
  ],
  [
    "release_publisher_validator",
    "/Users/lbcheng/cheng-lang/tools/backend2_current_source_release_evidence",
  ],
  [
    "release_auditor",
    "/Users/lbcheng/cheng-fusion/src/cheng_current_release_green_audit.ts",
  ],
  [
    "release_cli",
    "/Users/lbcheng/cheng-fusion/tools/current_release_green_audit.ts",
  ],
].map(([role, path]) => ({ role, artifact: pin(path!, role) }));
const manifest = seal(
  {
    schema: CHENG_CURRENT_RELEASE_MANIFEST_SCHEMA,
    status: "COMPLETE",
    driverRole: "production",
    ...identity,
    sourceSnapshotManifest: pin(
      CURRENT_PRIVATE_SOURCE_MANIFEST,
      "source-snapshot-manifest",
    ),
    parserHarnessManifest: pin(
      "/tmp/parser-production-receipt-harness.json",
      "parser-harness",
    ),
    executionPolicy: pin("/tmp/execution-stage-policy.json", "policy"),
    sevenStageManifest: pin(
      "/tmp/current-official-seven-stage-manifest.json",
      "runner-manifest",
    ),
    semanticSnapshotAudit: pin("/release/semantic-snapshot-audit.json"),
    semanticSnapshotBitmapReceipt: pin(
      "/release/semantic-snapshot-bitmap-receipt.json",
    ),
    semanticPublishedStdout: pin("/release/published-candidate.stdout.txt"),
    semanticSourceClosure: pin("/release/published-source-closure.bin"),
    semanticPublishedObject: pin("/release/published-candidate.o"),
    semanticBinding: pin("/release/published-binding.bin"),
    semanticQueryProjection: pin("/release/published-query-projection.bin"),
    semanticOpenDocumentUniverse: pin(
      "/release/published-open-document-universe.bin",
    ),
    semanticSnapshotArtifact: pin("/release/published-snapshot.bin"),
    memoryReleaseManifest: pin("/release/memory-release-manifest.json"),
    baselineDriver: pin(
      `${CHENG_CURRENT_ROOT}/artifacts/bootstrap/cheng.stage3`,
    ),
    driverSource: pin(
      `${CHENG_CURRENT_ROOT}/src/core/tooling/compiler_main.cheng`,
    ),
    backend2Epoch: pin(
      `${CHENG_CURRENT_ROOT}/tools/backend2_version_manifest.rec`,
    ),
    generationEnvironment: pin("/release/generation-environment.json"),
    gen2Driver: pin("/release/GEN2"),
    gen3Driver: pin("/release/GEN3"),
    gen2Receipt: pin("/release/GEN2.generation-receipt.json"),
    gen3Receipt: pin("/release/GEN3.generation-receipt.json"),
    officialDriver: pin(CHENG_CURRENT_OFFICIAL_DRIVER, "official-driver"),
    targets,
    performanceEvidence: pin("/release/performance-evidence.json"),
    freshMcpRuntime: pin("/release/fresh-mcp-runtime-identity.json"),
    freshMcpTypeArenaExecution: pin(
      "/release/fresh-mcp-type-arena-execution.json",
    ),
    tools: toolRows,
    releaseIdentityRaw32: hash("release-identity"),
    manifestRaw32: "",
  },
  "manifestRaw32",
);
assert.equal(
  validateCurrentReleaseManifestBindings(manifest, sevenStage).targets.length,
  3,
);
const pinnedFreshMcpRuntime = await probeFreshChengFusionMcpRuntime();
const liveFreshMcpRuntime = await probeFreshChengFusionMcpRuntime();
validateFreshChengFusionMcpRuntimeReceipt(pinnedFreshMcpRuntime);
validateFreshChengFusionMcpRuntimeReceipt(liveFreshMcpRuntime);
validateCurrentReleaseFreshMcpBinding(
  pinnedFreshMcpRuntime,
  liveFreshMcpRuntime,
);
const typeArenaPinned: any = {
  status: "PASS",
  officialDriver: pin(CHENG_CURRENT_OFFICIAL_DRIVER),
  sourceFiles: {
    entrySource: pin("/source/type-arena-entry.cheng"),
    querySource: pin("/source/type-arena-query.cheng"),
  },
  generationArtifacts: {
    facts: pin("/generation/current.facts"),
    manifest: pin("/generation/summary.json"),
  },
  runtimeIdentity: pinnedFreshMcpRuntime.runtimeIdentity,
  steps: [
    ["cheng_csg_roundtrip", 2],
    ["cheng_csg_query", 3],
    ["cheng_evidence", 4],
  ].map(([toolName, requestId], ordinal) => ({
    ordinal,
    requestId,
    toolName,
    inputRaw32: hash(`input-${ordinal}`),
    outputByteLength: 100 + ordinal,
    outputRaw32: hash(`output-${ordinal}`),
  })),
  semantic: {
    factsRoot: `sha256:${hash("facts")}`,
    queryMatchCount: 1,
    evidenceDeclarationCount: 1,
  },
  semanticRaw32: hash("semantic"),
};
const typeArenaReplay = clone(typeArenaPinned);
typeArenaReplay.runtimeIdentity = liveFreshMcpRuntime.runtimeIdentity;
validateCurrentReleaseFreshMcpTypeArenaBinding(
  typeArenaPinned,
  typeArenaReplay,
);
const typeArenaOutputDrift = clone(typeArenaReplay);
typeArenaOutputDrift.steps[1].outputRaw32 = hash("replayed-output-drift");
assert.throws(
  () =>
    validateCurrentReleaseFreshMcpTypeArenaBinding(
      typeArenaPinned,
      typeArenaOutputDrift,
    ),
  /fresh_mcp_type_arena_execution_drift/,
);
const typeArenaFactsPinDrift = clone(typeArenaReplay);
typeArenaFactsPinDrift.generationArtifacts.facts.bytesRaw32 = hash(
  "replayed-facts-drift",
);
assert.throws(
  () =>
    validateCurrentReleaseFreshMcpTypeArenaBinding(
      typeArenaPinned,
      typeArenaFactsPinDrift,
    ),
  /fresh_mcp_type_arena_execution_drift/,
);
const staleFreshMcpRuntime = structuredClone(liveFreshMcpRuntime) as any;
staleFreshMcpRuntime.runtimeIdentity.implementationRaw32 = hash(
  "stale-mcp-implementation",
);
assert.throws(
  () =>
    validateCurrentReleaseFreshMcpBinding(
      pinnedFreshMcpRuntime,
      staleFreshMcpRuntime,
    ),
  /fresh_mcp_runtime_drift/,
);

function rejectManifest(
  name: string,
  mutation: (value: any) => void,
  pattern: RegExp,
): void {
  const value = clone(manifest) as any;
  mutation(value);
  const resealed = seal(value, "manifestRaw32");
  assert.throws(
    () => validateCurrentReleaseManifestBindings(resealed, sevenStage),
    pattern,
    name,
  );
}

rejectManifest(
  "old-generation-ingress",
  (value) => (value.parserIngressRaw32 = hash("old-generation")),
  /parser_ingress_binding_drift/,
);
rejectManifest(
  "source-swap",
  (value) => (value.sourceBundleRaw32 = hash("other-source")),
  /source_bundle_binding_drift/,
);
rejectManifest(
  "driver-swap",
  (value) => (value.officialDriverRaw32 = hash("other-driver")),
  /official_driver_binding_drift/,
);
rejectManifest(
  "tool-swap",
  (value) => {
    [value.tools[0].artifact, value.tools[1].artifact] = [
      value.tools[1].artifact,
      value.tools[0].artifact,
    ];
  },
  /tool_0_identity_invalid/,
);
rejectManifest(
  "receipt-swap",
  (value) => {
    const backend = value.targets[0].backends[0];
    [backend.runStdout, backend.runStderr] = [
      backend.runStderr,
      backend.runStdout,
    ];
  },
  /target_receipt_role_path_invalid/,
);
rejectManifest(
  "missing-target",
  (value) => value.targets.pop(),
  /manifest_header_invalid/,
);
rejectManifest(
  "missing-fresh-mcp-runtime",
  (value) => delete value.freshMcpRuntime,
  /current_release_manifest_keys_invalid/,
);
rejectManifest(
  "fresh-mcp-runtime-path-swap",
  (value) =>
    (value.freshMcpRuntime.path = "/release/stale-mcp-runtime-identity.json"),
  /receipt_role_path_invalid:fresh-mcp-runtime-identity\.json/,
);
rejectManifest(
  "missing-fresh-mcp-type-arena-execution",
  (value) => delete value.freshMcpTypeArenaExecution,
  /current_release_manifest_keys_invalid/,
);
rejectManifest(
  "fresh-mcp-type-arena-execution-path-swap",
  (value) =>
    (value.freshMcpTypeArenaExecution.path =
      "/release/stale-mcp-type-arena-execution.json"),
  /receipt_role_path_invalid:fresh-mcp-type-arena-execution\.json/,
);
rejectManifest(
  "target-order",
  (value) => {
    [value.targets[0], value.targets[1]] = [value.targets[1], value.targets[0]];
  },
  /identity_or_backend_count_invalid/,
);
rejectManifest(
  "gen-alias",
  (value) => (value.gen3Driver.path = value.gen2Driver.path),
  /receipt_role_path_invalid|artifact_paths_alias/,
);

const generationEnvironment = {
  schema: CHENG_CURRENT_DRIVER_GENERATION_ENVIRONMENT_SCHEMA,
  status: "FROZEN",
  jobs: 8,
  PATH: "/usr/bin:/bin",
  LANG: "C",
  LC_ALL: "C",
  TZ: "UTC",
  BACKEND_INCREMENTAL: "0",
  BACKEND_MULTI_MODULE_CACHE: "0",
  CHENG_DISABLE_PRIMARY_OBJECT_CACHE: "1",
  CHENG_PROGRESS: "1",
};
const parsedGenerationEnvironment = parseCurrentGenerationEnvironment(
  generationEnvironment,
);
assert.equal(parsedGenerationEnvironment.jobs, 8);
assert.deepEqual(parsedGenerationEnvironment.env, {
  PATH: "/usr/bin:/bin",
  LANG: "C",
  LC_ALL: "C",
  TZ: "UTC",
  BACKEND_INCREMENTAL: "0",
  BACKEND_MULTI_MODULE_CACHE: "0",
  CHENG_DISABLE_PRIMARY_OBJECT_CACHE: "1",
  CHENG_PROGRESS: "1",
  BACKEND_JOBS: "8",
});
for (const [field, value] of [
  ["jobs", 0],
  ["LANG", "en_US.UTF-8"],
  ["BACKEND_INCREMENTAL", "1"],
  ["CHENG_PROGRESS", "0"],
] as const) {
  assert.throws(
    () =>
      parseCurrentGenerationEnvironment({
        ...generationEnvironment,
        [field]: value,
      }),
    /generation_environment_invalid/,
    `generation environment mutation ${field}`,
  );
}

const generationExecution: CurrentGenerationExecution = {
  generation: "GEN2",
  producerDriverRaw32: hash("generation-producer"),
  inputSourceClosureRaw32: hash("generation-source"),
  commandRaw32: hash("generation-command"),
  environmentRaw32: hash("generation-environment"),
  backend2EpochRaw32: hash("generation-backend2-epoch"),
  jobs: 8,
  stdoutRaw32: hash("generation-stdout"),
  stderrRaw32: hash("generation-stderr"),
  outputDriverRaw32: hash("generation-output"),
};
const generationReceipt = seal(
  {
    schema: CHENG_CURRENT_DRIVER_GENERATION_RECEIPT_SCHEMA,
    status: "PASS",
    ...generationExecution,
    executionRaw32: currentGenerationExecutionRaw32(generationExecution),
    receiptRaw32: "",
  },
  "receiptRaw32",
);
assert.equal(
  validateCurrentDriverGenerationReceipt(
    generationReceipt,
    generationExecution,
  ),
  generationReceipt.receiptRaw32,
);
for (const field of [
  "producerDriverRaw32",
  "inputSourceClosureRaw32",
  "commandRaw32",
  "environmentRaw32",
  "backend2EpochRaw32",
  "jobs",
  "stdoutRaw32",
  "stderrRaw32",
  "outputDriverRaw32",
  "executionRaw32",
] as const) {
  const mutation = clone(generationReceipt) as any;
  mutation[field] = field === "jobs" ? 9 : hash(`mutated-${field}`);
  assert.throws(
    () =>
      validateCurrentDriverGenerationReceipt(
        seal(mutation, "receiptRaw32"),
        generationExecution,
      ),
    /generation_execution_drift/,
    `generation receipt mutation ${field}`,
  );
}

validateCurrentReleaseOfficialReplay(sevenStage, clone(sevenStage));
assert.throws(
  () =>
    validateCurrentReleaseOfficialReplay(sevenStage, {
      ...sevenStage,
      runnerManifestRaw32: hash("mutated-runner"),
    }),
  /final_seven_stage_drift/,
);
const memoryIdentity = {
  sourceClosureRaw32: hash("source-snapshot-manifest"),
  drivers: [
    {
      targetTriple: "aarch64-unknown-linux-gnu" as const,
      bytesRaw32: targets[1]!.driverRaw32,
    },
    {
      targetTriple: "x86_64-unknown-linux-gnu" as const,
      bytesRaw32: targets[2]!.driverRaw32,
    },
  ],
};
validateCurrentReleaseMemoryIdentityBinding(
  memoryIdentity,
  memoryIdentity.sourceClosureRaw32,
  targets[0]!.driverRaw32,
  targets,
);
assert.throws(
  () =>
    validateCurrentReleaseMemoryIdentityBinding(
      memoryIdentity,
      hash("other-source-snapshot"),
      targets[0]!.driverRaw32,
      targets,
    ),
  /memory_source_identity_drift/,
);
validateCurrentReleaseCompositeIdentity(
  manifest.releaseIdentityRaw32,
  manifest.releaseIdentityRaw32,
);
assert.throws(
  () =>
    validateCurrentReleaseCompositeIdentity(
      manifest.releaseIdentityRaw32,
      hash("other-composite"),
    ),
  /composite_identity_drift/,
);

const policyRoot = realpathSync.native(
  mkdtempSync(join(tmpdir(), "cheng-current-release-policy-")),
);
try {
  const identityPins = {
    sourceBundle: putPolicyFile(
      policyRoot,
      "identity/source-bundle.bin",
      "source-bundle",
    ),
    materializerBytes: putPolicyFile(
      policyRoot,
      "identity/materializer.bin",
      "materializer",
    ),
    grammarObligation: putPolicyFile(
      policyRoot,
      "identity/grammar.bin",
      "grammar",
    ),
    compilerSourceClosure: putPolicyFile(
      policyRoot,
      "identity/compiler-source-closure.bin",
      "compiler-source-closure",
    ),
    driverBytes: putPolicyFile(policyRoot, "identity/driver.bin", "driver"),
    toolchainManifest: putPolicyFile(
      policyRoot,
      "identity/toolchain.manifest",
      "toolchain",
    ),
    commandManifest: putPolicyFile(
      policyRoot,
      "identity/command.manifest",
      "command",
    ),
  };
  const policyStages = [
    "typed_expr",
    "csg",
    "lowering",
    "primary",
    "primary_regalloc",
    "backend2",
    "backend2_regalloc",
  ].map((stageKind, index) => ({
    stageKind,
    producerSource: putPolicyFile(
      policyRoot,
      `producer/${stageKind}.cheng`,
      `producer-${stageKind}`,
    ),
    sidecarPath: `stage/${index}/semantic.bin`,
    sidecarBytesRaw32: putPolicyFile(
      policyRoot,
      `stage/${index}/semantic.bin`,
      `semantic-${stageKind}`,
    ).bytesRaw32,
    artifactPath: `stage/${index}/artifact.bin`,
    artifactBytesRaw32: putPolicyFile(
      policyRoot,
      `stage/${index}/artifact.bin`,
      `artifact-${stageKind}`,
    ).bytesRaw32,
  }));
  const policy = {
    schema: "cheng_fusion.execution_stage_receipt_policy",
    evidenceRoot: policyRoot,
    receipt: putPolicyFile(
      policyRoot,
      "execution-stage-receipt.json",
      "receipt",
    ),
    caseId: "current-release",
    targetTriple: "aarch64-apple-darwin",
    identityInputs: identityPins,
    parserReceiptRaw32: hash("policy-parser"),
    parserSemanticRaw32: hash("policy-parser-semantic"),
    stages: policyStages,
  };
  assert.equal(pinCurrentExecutionPolicyClosure(policy).files.length, 29);
  writeFileSync(
    join(policyRoot, identityPins.toolchainManifest.path),
    "mutated-toolchain\n",
  );
  assert.throws(
    () => pinCurrentExecutionPolicyClosure(policy),
    /policy_identity_toolchainManifest_pin_drift/,
  );
} finally {
  rmSync(policyRoot, { recursive: true, force: true });
}

const harnessRoot = realpathSync.native(
  mkdtempSync(join(tmpdir(), "cheng-current-release-harness-")),
);
try {
  const chengPackage = existingHarnessPin(
    join(CHENG_CURRENT_ROOT, "cheng-package.toml"),
  );
  const fusionPackage = existingHarnessPin(
    "/Users/lbcheng/cheng-fusion/package.json",
  );
  const runtimePath = realpathSync.native(process.execPath);
  const runtimePin = existingHarnessPin(runtimePath);
  const artifact = (name: string) => {
    const path = join(harnessRoot, name);
    writeFileSync(path, `${name}\n`);
    const pin = existingHarnessPin(path);
    return { ...pin, inode: lstatSync(path).ino.toString() };
  };
  const driverA = artifact("driver-a");
  const driverB = artifact("driver-b");
  const source = artifact("source.cheng");
  const receiptA = artifact("receipt-a.json");
  const receiptB = artifact("receipt-b.json");
  const chengClosureRows = [
    {
      path: "cheng-package.toml",
      byteLength: chengPackage.byteLength,
      sha256: chengPackage.sha256,
    },
  ];
  const toolClosureRows = [
    {
      path: "package.json",
      byteLength: fusionPackage.byteLength,
      sha256: fusionPackage.sha256,
    },
  ];
  const harnessManifest = {
    schema: "cheng_parser_production_receipt_harness",
    status: "accepted",
    formalEbnfSha256: hash("formal-ebnf"),
    formalSpec: { path: chengPackage.path, sha256: chengPackage.sha256 },
    parser: { path: chengPackage.path, sha256: chengPackage.sha256 },
    receiptProducer: {
      path: chengPackage.path,
      sha256: chengPackage.sha256,
    },
    driverEntry: { path: chengPackage.path, sha256: chengPackage.sha256 },
    bootstrap: { path: chengPackage.path, sha256: chengPackage.sha256 },
    harness: { path: fusionPackage.path, sha256: fusionPackage.sha256 },
    dependencyClosure: {
      fileCount: chengClosureRows.length,
      sha256: createHash("sha256")
        .update(canonicalJson(chengClosureRows))
        .digest("hex"),
      rows: chengClosureRows,
    },
    toolClosure: {
      fileCount: toolClosureRows.length,
      sha256: createHash("sha256")
        .update(canonicalJson(toolClosureRows))
        .digest("hex"),
      rows: toolClosureRows,
    },
    buildCompiler: {
      command: "cc",
      executablePath: runtimePath,
      executableSha256: runtimePin.sha256,
      versionSha256: hash("compiler-version"),
    },
    compilerProfile: {},
    runtime: {
      executablePath: runtimePath,
      executableSha256: runtimePin.sha256,
      version: Bun.version,
    },
    drivers: [
      { role: "receipt_driver_a", ...driverA },
      { role: "receipt_driver_b", ...driverB },
    ],
    sources: [
      {
        path: source.path,
        sha256: source.sha256,
        byteLength: source.byteLength,
      },
    ],
    receipts: [
      {
        ...receiptA,
        sourcePath: source.path,
        driverRole: "receipt_driver_a",
        driverSha256: driverA.sha256,
        parserTraceRootSha256: hash("trace"),
      },
      {
        ...receiptB,
        sourcePath: source.path,
        driverRole: "receipt_driver_b",
        driverSha256: driverB.sha256,
        parserTraceRootSha256: hash("trace"),
      },
    ],
  };
  assert.ok(pinCurrentParserHarnessClosure(harnessManifest).files.length >= 7);
  const mutatedHarness = clone(harnessManifest);
  mutatedHarness.toolClosure.rows[0]!.sha256 = hash("tool-mutation");
  mutatedHarness.toolClosure.sha256 = createHash("sha256")
    .update(canonicalJson(mutatedHarness.toolClosure.rows))
    .digest("hex");
  assert.throws(
    () => pinCurrentParserHarnessClosure(mutatedHarness),
    /harness_tool_closure_0_pin_drift/,
  );
} finally {
  rmSync(harnessRoot, { recursive: true, force: true });
}

const publishedCandidateReceipt = {
  schema: "cheng.semantic_snapshot.published_candidate_receipt",
  status: "pass",
  executionBound: true,
  sourceVersion: 7,
  documentCount: 3,
  openDocumentCount: 3,
  compilerSha256: hash("compiler"),
  sourceClosureCid: hash("source-closure"),
  objectSha256: hash("object"),
  bindingReceiptCid: hash("binding"),
  queryProjectionCid: hash("query"),
  openDocumentUniverseCid: hash("open-document-universe"),
  stdoutSha256: hash("stdout"),
  runtimeReceiptCid: hash("runtime"),
  routingReceiptCid: hash("routing"),
  receiptCid: hash("published"),
};
const semanticAudit = {
  schema: "cheng.semantic_snapshot.audit",
  status: "pass",
  scope: "production_closure",
  root: "/Users/lbcheng/cheng-lang",
  sourceSetCid: hash("source-set"),
  structuralAudit: {},
  productionClosureAudit: {
    status: "pass",
    blockers: [],
    observations: {
      publishedCandidateEvidence: true,
      candidatePublicationRequiresZeroMissingFacts: true,
    },
    receiptCid: hash("closure"),
  },
  publishedCandidateReceipt,
  compilerInputAudit: {},
  inputs: [],
  auditCid: hash("audit"),
};
const bitmap = seal(
  {
    schema: "cheng_current_semantic_snapshot_admission_receipt",
    status: "PASS",
    published: 1,
    missingFactBitmap: 0,
    sourceVersion: 7,
    sourceBundleRaw32: identity.sourceBundleRaw32,
    officialDriverRaw32: identity.officialDriverRaw32,
    executionRaw32: identity.executionRaw32,
    snapshotRaw32: hash("snapshot"),
    queryProjectionRaw32: publishedCandidateReceipt.queryProjectionCid,
    openDocumentUniverseRaw32:
      publishedCandidateReceipt.openDocumentUniverseCid,
    publishedCandidateReceiptRaw32: publishedCandidateReceipt.receiptCid,
    receiptRaw32: "",
  },
  "receiptRaw32",
);
assert.throws(
  () =>
    validateCurrentReleaseSemanticSnapshotReceipts(
      semanticAudit,
      bitmap,
      identity,
      {
        expectedRoot: CHENG_CURRENT_ROOT,
        inputArtifacts: [],
        sourceSnapshotRows: [],
        publishedStdoutRaw: Buffer.from("fabricated\n"),
        sourceClosureRaw: Buffer.from("fabricated"),
        publishedObjectRaw: Buffer.from("fabricated"),
        bindingRaw: Buffer.from("fabricated"),
        queryProjectionRaw: Buffer.from("fabricated"),
        openDocumentUniverseRaw: Buffer.from("fabricated"),
        snapshotRaw: Buffer.from("fabricated"),
      },
    ),
  /semantic_input_set_invalid/,
);

assert.throws(
  () =>
    parseUniqueCurrentJson(
      JSON.stringify({ ...manifest, compatibilityReader: false }),
      "current_release_manifest",
    ),
  /forbidden_compatibility_key/,
);

const aliasRoot = mkdtempSync(join(tmpdir(), "cheng-current-release-alias-"));
try {
  const realDirectory = join(aliasRoot, "real");
  const aliasDirectory = join(aliasRoot, "alias");
  mkdirSync(realDirectory);
  symlinkSync(realDirectory, aliasDirectory, "dir");
  writeFileSync(join(realDirectory, "current-release-manifest.json"), "{}\n");
  const aliasReport = await auditCurrentReleaseGreen({
    officialCurrentBuildBindingPath: CURRENT_BINDING_PATH,
    harnessManifestPath: "/tmp/parser-production-receipt-harness.json",
    executionPolicyPath: "/tmp/execution-stage-policy.json",
    runnerManifestPath: "/tmp/current-official-seven-stage-manifest.json",
    releaseManifestPath: join(aliasDirectory, "current-release-manifest.json"),
  });
  assert.equal(aliasReport.status, "HARD_RED");
  assert.match(aliasReport.reason, /current_release_manifest_identity_invalid/);
} finally {
  rmSync(aliasRoot, { recursive: true, force: true });
}

const current = await auditCurrentReleaseGreen({
  officialCurrentBuildBindingPath: CURRENT_BINDING_PATH,
  harnessManifestPath: "/tmp/parser-production-receipt-harness.json",
  executionPolicyPath: "/tmp/execution-stage-policy.json",
  runnerManifestPath: "/tmp/current-official-seven-stage-manifest.json",
  releaseManifestPath: "/tmp/current-release-manifest.json",
});
assert.equal(current.status, "HARD_RED");
assert.equal(current.red_count, 1);
assert.equal(current.verdict, "RED");
assert.equal(current.targetCount, 0);
assert.equal(current.backendEvidenceCount, 0);
assert.equal(current.executionRaw32, "");
validateCurrentReleaseGreenAuditReport(current);
assert.equal(
  (
    parseUniqueCurrentJson(
      serializeCurrentReleaseGreenAuditReport(current),
      "current_release_report",
    ) as { status: string }
  ).status,
  "HARD_RED",
);
assert.throws(
  () =>
    validateCurrentReleaseGreenAuditReport({
      ...current,
      status: "GREEN",
      red_count: 0,
      verdict: "RELEASE_GREEN",
    }),
  /green_contract_invalid/,
);
assert.equal(current.schema, CHENG_CURRENT_RELEASE_AUDIT_SCHEMA);

console.log(
  "item34 current RELEASE_GREEN audit: PASS " +
    "publisher-envelope/generation/source/driver/tool/harness/policy/raw-target/snapshot/" +
    "replay/alias/perf mutations hard-red",
);
