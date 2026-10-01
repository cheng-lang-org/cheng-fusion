#!/usr/bin/env bun
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  lstatSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  CHENG_CURRENT_RELEASE_AUDIT_SCHEMA,
  CHENG_CURRENT_RELEASE_MANIFEST_SCHEMA,
  assembleCurrentReleaseManifest,
  auditCurrentReleaseGreen,
  inspectCurrentReleaseSemanticPublisherArtifacts,
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
  currentPublishedCandidateReceiptBindingCid,
  currentReleaseDomainCid,
  currentGenerationExecutionRaw32,
  parseCurrentGenerationEnvironment,
  validateCurrentPublishedCandidateExecutionReceipt,
  validateCurrentSourceMembershipFocusedEvidence,
  validateCurrentDriverGenerationReceipt,
  type CurrentGenerationExecution,
} from "../src/cheng_current_release_evidence_validator.ts";
import {
  SEMANTIC_SNAPSHOT_AUDIT_INPUT_SPECS,
  semanticSnapshotPublishedCandidateReceiptBindingCid,
} from "../src/cheng_semantic_snapshot_audit.ts";
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

function mutateSealedKvField(
  path: string,
  key: string,
  value: string,
  payloadKey: string,
): void {
  const lines = readFileSync(path, "utf8").trimEnd().split("\n");
  if (lines.at(-1)?.startsWith(`${payloadKey}=`) !== true) {
    throw new Error("mutation_payload_key_missing");
  }
  const payload = lines.slice(0, -1);
  const index = payload.findIndex((line) => line.startsWith(`${key}=`));
  if (index < 0 || payload.filter((line) => line.startsWith(`${key}=`)).length !== 1) {
    throw new Error("mutation_field_count_invalid");
  }
  payload[index] = `${key}=${value}`;
  chmodSync(path, 0o600);
  writeFileSync(path, sealKv(payload, payloadKey));
  chmodSync(path, 0o400);
}

function mutateSealedKvFields(
  path: string,
  values: ReadonlyMap<string, string>,
  payloadKey: string,
): void {
  const lines = readFileSync(path, "utf8").trimEnd().split("\n");
  if (lines.at(-1)?.startsWith(`${payloadKey}=`) !== true) {
    throw new Error("mutation_payload_key_missing");
  }
  const payload = lines.slice(0, -1);
  for (const [key, value] of values) {
    const indices = payload
      .map((line, index) => (line.startsWith(`${key}=`) ? index : -1))
      .filter((index) => index >= 0);
    if (indices.length !== 1) {
      throw new Error(`mutation_field_count_invalid:${key}`);
    }
    payload[indices[0]!] = `${key}=${value}`;
  }
  chmodSync(path, 0o600);
  writeFileSync(path, sealKv(payload, payloadKey));
  chmodSync(path, 0o400);
}

function mutateManifestFieldAndRebind(
  root: string,
  receiptPath: string,
  key: string,
): void {
  const manifestPath = join(root, "artifact-manifest.kv");
  const current = readFileSync(manifestPath, "utf8")
    .split("\n")
    .find((line) => line.startsWith(`${key}=`));
  if (current === undefined) {
    throw new Error(`manifest_mutation_field_missing:${key}`);
  }
  const value = BigInt(current.slice(key.length + 1)) + 1n;
  mutateSealedKvField(
    manifestPath,
    key,
    value.toString(),
    "manifest_payload_sha256",
  );
  const stat = lstatSync(manifestPath, { bigint: true });
  const raw = readFileSync(manifestPath);
  mutateSealedKvFields(
    receiptPath,
    new Map([
      [
        "artifact_manifest_sha256",
        createHash("sha256").update(raw).digest("hex"),
      ],
      ["artifact_manifest_device", stat.dev.toString()],
      ["artifact_manifest_inode", stat.ino.toString()],
      ["artifact_manifest_size", stat.size.toString()],
      ["artifact_manifest_mode", stat.mode.toString(8)],
      ["artifact_manifest_nlink", stat.nlink.toString()],
      ["artifact_manifest_uid", stat.uid.toString()],
      ["artifact_manifest_gid", stat.gid.toString()],
      ["artifact_manifest_mtime_ns", stat.mtimeNs.toString()],
      ["artifact_manifest_ctime_ns", stat.ctimeNs.toString()],
    ]),
    "receipt_payload_sha256",
  );
}

function publisherAnchorPath(root: string): string {
  return join(
    dirname(root),
    `.cheng-current-publisher-${Buffer.from(
      basename(root),
      "utf8",
    ).toString("hex")}-control`,
  );
}

function removePublisherFixture(root: string): void {
  rmSync(root, { recursive: true, force: true });
  rmSync(publisherAnchorPath(root), { recursive: true, force: true });
}

type PublisherSourceClosureSchema =
  | "current"
  | "legacy"
  | "dual"
  | "missing";

function writePublisherEnvelopeFixture(
  root: string,
  sourceClosureSchema: PublisherSourceClosureSchema = "current",
  additionalArtifacts: readonly (readonly [string, string])[] = [],
  sortArtifacts = true,
): string {
  const anchorPath = publisherAnchorPath(root);
  mkdirSync(anchorPath, { mode: 0o700 });
  const anchorStat = lstatSync(anchorPath, { bigint: true });
  const runtimeOutputRoot = join(root, "runtime");
  mkdirSync(runtimeOutputRoot, { mode: 0o700 });
  const runtimeFormalRaw = sealKv(
    [
      "darwin_current_release_runtime_validation=PASS",
      "driver_role=production",
      "target=arm64-apple-darwin",
      `publish_root_fshex=${Buffer.from(root).toString("hex")}`,
      `runtime_output_root_fshex=${Buffer.from(runtimeOutputRoot).toString("hex")}`,
      `runtime_validator_sha256=${hash("runtime-formal:validator")}`,
      `identity_manifest_sha256=${hash("runtime-formal:identity")}`,
      `formal_inputs_sha256=${hash("runtime-formal:inputs")}`,
      "published_process_count=1",
      `process_argv_raw32=${hash("runtime-formal:argv")}`,
      `process_env_raw32=${hash("runtime-formal:env")}`,
      `process_guard_raw32=${hash("runtime-formal:guard")}`,
      `process_physical_sha256=${hash("runtime-formal:physical")}`,
      `process_logical_sha256=${hash("runtime-formal:logical")}`,
      `process_path_role_sha256=${hash("runtime-formal:path-role")}`,
      `process_support_path_role_sha256=${hash("runtime-formal:support-path-role")}`,
      `primary_receipt_sha256=${hash("runtime-formal:primary")}`,
      `backend2_receipt_sha256=${hash("runtime-formal:backend2")}`,
      `exec_diff_receipt_sha256=${hash("runtime-formal:exec-diff")}`,
      `performance_evidence_sha256=${hash("runtime-formal:performance")}`,
    ],
    "receipt_payload_sha256",
  );
  const artifacts: (readonly [string, string])[] = [
    ["binding.kv", "binding\n"],
    ["completion-index.kv", "completion\n"],
    ["contract.kv", "contract\n"],
    ["darwin-runtime-formal-validation.kv", runtimeFormalRaw],
    ...additionalArtifacts,
  ];
  if (sortArtifacts) {
    artifacts.sort((left, right) =>
      Buffer.compare(Buffer.from(left[0]), Buffer.from(right[0])),
    );
  }
  const directories = new Set<string>(["runtime"]);
  for (const [name] of artifacts) {
    let directory = dirname(name);
    while (directory !== ".") {
      directories.add(directory);
      directory = dirname(directory);
    }
  }
  const orderedDirectories = [...directories].sort((left, right) =>
    Buffer.compare(Buffer.from(left), Buffer.from(right)),
  );
  for (const directory of orderedDirectories) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  for (const [name, raw] of artifacts) {
    writeFileSync(join(root, name), raw, { flag: "wx", mode: 0o400 });
  }
  const manifestLines = [
    "schema=cheng.backend2.current_source_release_artifact_manifest",
    "status=PASS",
    "driver_role=production",
    `producer_root_fshex=${Buffer.from(root).toString("hex")}`,
    `directory_count=${orderedDirectories.length}`,
  ];
  for (const [index, name] of orderedDirectories.entries()) {
    const stat = lstatSync(join(root, name), { bigint: true });
    manifestLines.push(
      `directory.${index}.path_fshex=${Buffer.from(name).toString("hex")}`,
      `directory.${index}.device=${stat.dev}`,
      `directory.${index}.inode=${stat.ino}`,
      `directory.${index}.mode=${stat.mode.toString(8)}`,
      `directory.${index}.nlink=${stat.nlink}`,
      `directory.${index}.uid=${stat.uid}`,
      `directory.${index}.gid=${stat.gid}`,
      `directory.${index}.mtime_ns=${stat.mtimeNs}`,
      `directory.${index}.ctime_ns=${stat.ctimeNs}`,
    );
  }
  manifestLines.push(`artifact_count=${artifacts.length}`);
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
      `artifact.${index}.nlink=${stat.nlink}`,
      `artifact.${index}.uid=${stat.uid}`,
      `artifact.${index}.gid=${stat.gid}`,
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
  const runtimeFormalPath = join(
    root,
    "darwin-runtime-formal-validation.kv",
  );
  const runtimeFormalStat = lstatSync(runtimeFormalPath, { bigint: true });
  const runtimeFormalRaw32 = createHash("sha256")
    .update(readFileSync(runtimeFormalPath))
    .digest("hex");
  const artifactRaw32 = (name: string) =>
    createHash("sha256").update(readFileSync(join(root, name))).digest("hex");
  const sourceClosureRows = [
    ...(
      sourceClosureSchema === "current" ||
      sourceClosureSchema === "dual"
        ? [`source_closure_cid=${hash("publisher-fixture:source_closure_cid")}`]
        : []
    ),
    ...(
      sourceClosureSchema === "legacy" ||
      sourceClosureSchema === "dual"
        ? [
            `source_closure_sha256=${hash(
              "publisher-fixture:source_closure_sha256",
            )}`,
          ]
        : []
    ),
  ];
  const receiptLines = [
    "schema=cheng.backend2.current_source_release_publisher_receipt",
    "status=PASS",
    "release_status=GREEN",
    "red_count=0",
    "driver_role=production",
    "release_marker=RELEASE_GREEN",
    `producer_root_fshex=${Buffer.from(root).toString("hex")}`,
    `publication_anchor_path_fshex=${Buffer.from(anchorPath).toString("hex")}`,
    "publication_anchor_status=EMPTY_RETAINED",
    `publication_anchor_device=${anchorStat.dev}`,
    `publication_anchor_inode=${anchorStat.ino}`,
    `publication_anchor_mode=${anchorStat.mode.toString(8)}`,
    `publication_anchor_uid=${anchorStat.uid}`,
    `publication_anchor_gid=${anchorStat.gid}`,
    `artifact_manifest_path_fshex=${Buffer.from(manifestPath).toString("hex")}`,
    `artifact_manifest_sha256=${createHash("sha256").update(manifestRaw).digest("hex")}`,
    `artifact_manifest_device=${manifestStat.dev}`,
    `artifact_manifest_inode=${manifestStat.ino}`,
    `artifact_manifest_size=${manifestStat.size}`,
    `artifact_manifest_mode=${manifestStat.mode.toString(8)}`,
    `artifact_manifest_nlink=${manifestStat.nlink}`,
    `artifact_manifest_uid=${manifestStat.uid}`,
    `artifact_manifest_gid=${manifestStat.gid}`,
    `artifact_manifest_mtime_ns=${manifestStat.mtimeNs}`,
    `artifact_manifest_ctime_ns=${manifestStat.ctimeNs}`,
    `darwin_runtime_formal_validation_path_fshex=${Buffer.from(runtimeFormalPath).toString("hex")}`,
    `darwin_runtime_formal_validation_sha256=${runtimeFormalRaw32}`,
    `darwin_runtime_formal_validation_device=${runtimeFormalStat.dev}`,
    `darwin_runtime_formal_validation_inode=${runtimeFormalStat.ino}`,
    `darwin_runtime_formal_validation_size=${runtimeFormalStat.size}`,
    `darwin_runtime_formal_validation_mode=${runtimeFormalStat.mode.toString(8)}`,
    `darwin_runtime_formal_validation_nlink=${runtimeFormalStat.nlink}`,
    `darwin_runtime_formal_validation_uid=${runtimeFormalStat.uid}`,
    `darwin_runtime_formal_validation_gid=${runtimeFormalStat.gid}`,
    `darwin_runtime_formal_validation_mtime_ns=${runtimeFormalStat.mtimeNs}`,
    `darwin_runtime_formal_validation_ctime_ns=${runtimeFormalStat.ctimeNs}`,
    "darwin_runtime_formal_process_count=1",
    `darwin_runtime_formal_physical_sha256=${hash("runtime-formal:physical")}`,
    `darwin_runtime_formal_logical_sha256=${hash("runtime-formal:logical")}`,
    `darwin_runtime_formal_path_role_sha256=${hash("runtime-formal:path-role")}`,
    `darwin_runtime_formal_support_path_role_sha256=${hash("runtime-formal:support-path-role")}`,
    `artifact_count=${artifacts.length}`,
    `directory_count=${orderedDirectories.length}`,
    `contract_sha256=${artifactRaw32("contract.kv")}`,
    `binding_sha256=${artifactRaw32("binding.kv")}`,
    `completion_index_sha256=${artifactRaw32("completion-index.kv")}`,
    ...sourceClosureRows,
    ...[
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

const SEMANTIC_PUBLISHER_ARTIFACTS = Object.freeze([
  ["semantic-snapshot-audit.json", "semantic audit\n"],
  ["semantic-snapshot-bitmap-receipt.json", "semantic bitmap\n"],
  ["published-candidate.stdout.txt", "published stdout\n"],
  ["source-membership-focused.stdout.txt", "membership focused stdout\n"],
  ["published-source-closure.bin", "source closure\n"],
  ["published-candidate.o", "object\n"],
  ["published-binding.bin", "binding raw\n"],
  ["published-query-projection.bin", "query projection\n"],
  ["published-open-document-universe.bin", "open document universe\n"],
  ["published-snapshot.bin", "snapshot\n"],
] as const);

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
const semanticInputAuthority =
  SEMANTIC_SNAPSHOT_AUDIT_INPUT_SPECS.map(
    (row) => [row.path, row.role],
  );
const missingFormalSpecInput =
  CHENG_CURRENT_SEMANTIC_INPUT_SPECS.filter(
    ([path]) => path !== "docs/cheng-formal-spec.md",
  );
assert.throws(
  () => assert.deepEqual(
    missingFormalSpecInput,
    semanticInputAuthority,
  ),
  /Expected values to be strictly deep-equal/,
  "删除 formal spec 必须破坏唯一 semantic input authority",
);
const wrongFormalSpecRole =
  CHENG_CURRENT_SEMANTIC_INPUT_SPECS.map(
    ([path, role]) => path === "docs/cheng-formal-spec.md"
      ? [path, "core_source"]
      : [path, role],
  );
assert.throws(
  () => assert.deepEqual(
    wrongFormalSpecRole,
    semanticInputAuthority,
  ),
  /Expected values to be strictly deep-equal/,
  "替换 formal spec role 必须破坏唯一 semantic input authority",
);

const focusedInputSpecs = [
  ["cheng-package.toml", "project_manifest"],
  ["src/core/tooling/semantic_snapshot.cheng", "core_source"],
  ["src/core/tooling/semantic_snapshot_production.cheng", "production_source"],
  [
    "src/core/tooling/semantic_snapshot_query_projection.cheng",
    "query_projection_source",
  ],
  [
    "src/core/tooling/compiler_snapshot_builder.cheng",
    "snapshot_builder_source",
  ],
  [
    "src/core/tooling/semantic_snapshot_incremental_plan.cheng",
    "incremental_plan_source",
  ],
  ["src/core/tooling/lsp_server.cheng", "lsp_producer_source"],
  [
    "src/tests/semantic_snapshot_source_membership_event_smoke.cheng",
    "source_membership_smoke_source",
  ],
  [
    "src/tests/semantic_snapshot_candidate_job_smoke.cheng",
    "candidate_job_smoke_source",
  ],
  [
    "src/tests/lsp_multifile_exact_snapshot_acceptance_smoke.cheng",
    "lsp_multifile_smoke_source",
  ],
  [
    "tools/lsp_candidate_job_scheduler_contract.py",
    "candidate_scheduler_contract_source",
  ],
  ["bootstrap/cheng_cold.c", "cold_compiler_source"],
  ["tools/beat_c_process_group_guard.sh", "process_tree_guard"],
  [
    "tools/semantic_snapshot_source_membership_event_gate.sh",
    "source_membership_gate_source",
  ],
] as const;
const focusedMutationIds = [
  "binding_stable_row",
  "cancelled_completion_receipt_mismatch",
  "completion_receipt_mismatch",
  "duplicate_active",
  "duplicate_add",
  "duplicate_remove",
  "late_completion_receipt_mismatch",
  "lsp_current_event_receipt_publisher",
  "lsp_current_event_receipt_query",
  "lsp_duplicate_delete",
  "lsp_entry_delete",
  "lsp_stale_rename",
  "missing_active",
  "presence_state",
  "remove_unknown",
  "rename_peer",
  "rename_target_present",
  "reordered_active",
  "tombstone_inclusion",
  "wrong_active_cid",
] as const;
const focusedInputArtifacts = focusedInputSpecs.map(([relativePath, role]) => {
  const raw = readFileSync(join(CHENG_CURRENT_ROOT, relativePath));
  return { relativePath, role, raw };
});
const focusedInputLines = focusedInputArtifacts.map((artifact) =>
  `input role=${artifact.role} path=${artifact.relativePath} ` +
  `bytes=${artifact.raw.length} sha256=${createHash("sha256")
    .update(artifact.raw)
    .digest("hex")}`
);
const focusedClosureCid = createHash("sha256")
  .update(`${focusedInputLines.join("\n")}\n`)
  .digest("hex");
const focusedMutationLines = focusedMutationIds.map((id) => {
  const bytes = `membership_event|case=${id}|authority=current`;
  return `semantic_snapshot_source_membership_mutation id=${id} ` +
    `cid=${createHash("sha256").update(bytes).digest("hex")} bytes=${bytes}`;
});
const focusedStdoutText = [
  "semantic_snapshot_source_membership_event_gate_schema=cheng.semantic_snapshot.source_membership_event_gate",
  "semantic_snapshot_source_membership_event_gate_status=passed",
  `semantic_snapshot_source_membership_event_gate_mutations=${focusedMutationIds.length}`,
  `semantic_snapshot_source_membership_event_gate_unique_mutation_cids=${focusedMutationIds.length}`,
  `semantic_snapshot_source_membership_event_gate_source_closure_cid=${focusedClosureCid}`,
  `semantic_snapshot_source_membership_event_gate_input_count=${focusedInputSpecs.length}`,
  ...focusedInputLines,
  ...focusedMutationLines,
  "semantic_snapshot_source_membership_event_smoke: ok",
  "semantic_snapshot_candidate_job_smoke: ok cancelled=1 late=1 duplicate=1",
  "lsp_source_membership_event_status=pass rename_source_version=4 delete_source_version=5 stable_rows=4 active_rows=2 published=1",
].join("\n") + "\n";
const focusedSourceSetCid = hash("focused-source-set");
assert.match(
  validateCurrentSourceMembershipFocusedEvidence(
    Buffer.from(focusedStdoutText),
    focusedInputArtifacts,
    focusedSourceSetCid,
  ),
  /^[0-9a-f]{64}$/,
);
for (const [label, mutated, expected] of [
  [
    "role",
    focusedStdoutText.replace(
      "role=incremental_plan_source",
      "role=production_source",
    ),
    /input_5_drift/,
  ],
  [
    "closure",
    focusedStdoutText.replace(focusedClosureCid, hash("wrong-closure")),
    /closure_cid_drift/,
  ],
  [
    "mutation-bytes",
    focusedStdoutText.replace(
      "case=lsp_current_event_receipt_query|authority=current",
      "case=lsp_current_event_receipt_query|authority=stale",
    ),
    /mutation_8_invalid/,
  ],
  [
    "mutation-id",
    focusedStdoutText.replace(
      "id=lsp_current_event_receipt_publisher",
      "id=lsp_current_event_receipt_query",
    ),
    /mutation_7_invalid/,
  ],
  [
    "terminal",
    focusedStdoutText.replace(
      "delete_source_version=5",
      "delete_source_version=6",
    ),
    /lsp_terminal_invalid/,
  ],
] as const) {
  assert.throws(
    () => validateCurrentSourceMembershipFocusedEvidence(
      Buffer.from(mutated),
      focusedInputArtifacts,
      focusedSourceSetCid,
    ),
    expected,
    label,
  );
}
const mutatedFocusedInputs = focusedInputArtifacts.map((artifact, index) =>
  index === 5
    ? { ...artifact, raw: Buffer.concat([artifact.raw, Buffer.from("\n")]) }
    : artifact
);
assert.throws(
  () => validateCurrentSourceMembershipFocusedEvidence(
    Buffer.from(focusedStdoutText),
    mutatedFocusedInputs,
    focusedSourceSetCid,
  ),
  /input_5_drift/,
);
assert.equal(
  readFileSync(
    join(
      CHENG_CURRENT_ROOT,
      "src/core/tooling/semantic_snapshot_production.cheng",
    ),
    "utf8",
  ).includes("fn SemanticSnapshotProductionJobCompletionAdmitInto("),
  false,
);

const publisherFixtureRoot = realpathSync.native(
  mkdtempSync(join(tmpdir(), "cheng-current-release-publisher-envelope-")),
);
try {
  const receiptPath = writePublisherEnvelopeFixture(publisherFixtureRoot);
  const envelope = inspectCurrentReleasePublisherEnvelope(receiptPath);
  assert.equal(envelope.producerRoot, publisherFixtureRoot);
  assert.equal(envelope.artifacts.length, 4);
  assert.equal(
    envelope.runtimeFormalPhysicalRaw32,
    hash("runtime-formal:physical"),
  );
  assert.equal(
    envelope.runtimeFormalLogicalRaw32,
    hash("runtime-formal:logical"),
  );
  assert.equal(
    envelope.runtimeFormalPathRoleRaw32,
    hash("runtime-formal:path-role"),
  );
  assert.equal(
    envelope.runtimeFormalSupportPathRoleRaw32,
    hash("runtime-formal:support-path-role"),
  );
  assert.deepEqual(
    envelope.artifacts.map((artifact) => artifact.path),
    [
      join(publisherFixtureRoot, "binding.kv"),
      join(publisherFixtureRoot, "completion-index.kv"),
      join(publisherFixtureRoot, "contract.kv"),
      join(
        publisherFixtureRoot,
        "darwin-runtime-formal-validation.kv",
      ),
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
  const anchorPath = publisherAnchorPath(publisherFixtureRoot);
  chmodSync(anchorPath, 0o755);
  assert.throws(
    () => inspectCurrentReleasePublisherEnvelope(receiptPath),
    /publisher_anchor_identity_invalid/,
  );
  chmodSync(anchorPath, 0o700);
  writeFileSync(join(anchorPath, "foreign"), "foreign\n", {
    flag: "wx",
    mode: 0o400,
  });
  assert.throws(
    () => inspectCurrentReleasePublisherEnvelope(receiptPath),
    /publisher_anchor_identity_invalid/,
  );
  rmSync(join(anchorPath, "foreign"));
  const savedAnchor = `${anchorPath}.saved`;
  renameSync(anchorPath, savedAnchor);
  mkdirSync(anchorPath, { mode: 0o700 });
  assert.throws(
    () => inspectCurrentReleasePublisherEnvelope(receiptPath),
    /publisher_anchor_identity_invalid/,
  );
  rmSync(anchorPath, { recursive: true, force: true });
  renameSync(savedAnchor, anchorPath);
  chmodSync(publisherFixtureRoot, 0o755);
  assert.throws(
    () => inspectCurrentReleasePublisherEnvelope(receiptPath),
    /publisher_root_invalid/,
  );
  chmodSync(publisherFixtureRoot, 0o700);
  writeFileSync(join(publisherFixtureRoot, "unmanifested.bin"), "drift\n", {
    flag: "wx",
    mode: 0o400,
  });
  assert.throws(
    () => inspectCurrentReleasePublisherEnvelope(receiptPath),
    /publisher_tree_manifest_drift/,
  );
} finally {
  removePublisherFixture(publisherFixtureRoot);
}

const semanticPublisherRoot = realpathSync.native(
  mkdtempSync(join(tmpdir(), "cheng-current-release-semantic-publisher-")),
);
try {
  const receiptPath = writePublisherEnvelopeFixture(
    semanticPublisherRoot,
    "current",
    SEMANTIC_PUBLISHER_ARTIFACTS,
  );
  const artifacts =
    inspectCurrentReleaseSemanticPublisherArtifacts(receiptPath);
  assert.deepEqual(
    artifacts.map((artifact) => artifact.role),
    [
      "semanticSnapshotAudit",
      "semanticSnapshotBitmapReceipt",
      "semanticPublishedStdout",
      "semanticSourceMembershipFocusedStdout",
      "semanticSourceClosure",
      "semanticPublishedObject",
      "semanticBinding",
      "semanticQueryProjection",
      "semanticOpenDocumentUniverse",
      "semanticSnapshotArtifact",
    ],
  );
  assert.deepEqual(
    artifacts.map((artifact) => artifact.path),
    SEMANTIC_PUBLISHER_ARTIFACTS.map(([name]) =>
      join(semanticPublisherRoot, name),
    ),
  );
  for (const artifact of artifacts) {
    assert.equal(
      artifact.bytesRaw32,
      createHash("sha256").update(readFileSync(artifact.path)).digest("hex"),
    );
  }
} finally {
  removePublisherFixture(semanticPublisherRoot);
}

for (const [name, additionalArtifacts, expected] of [
  [
    "missing",
    SEMANTIC_PUBLISHER_ARTIFACTS.slice(0, -1),
    /artifact_role_count_invalid:published-snapshot\.bin:0/,
  ],
  [
    "nested",
    SEMANTIC_PUBLISHER_ARTIFACTS.map(([path, raw]) =>
      path === "published-snapshot.bin"
        ? ([`nested/${path}`, raw] as const)
        : ([path, raw] as const),
    ),
    /artifact_role_path_invalid:published-snapshot\.bin/,
  ],
  [
    "duplicate-basename",
    [
      ...SEMANTIC_PUBLISHER_ARTIFACTS,
      ["nested/published-snapshot.bin", "duplicate snapshot\n"] as const,
    ],
    /artifact_role_count_invalid:published-snapshot\.bin:2/,
  ],
  [
    "empty",
    SEMANTIC_PUBLISHER_ARTIFACTS.map(([path, raw]) =>
      path === "published-snapshot.bin"
        ? ([path, ""] as const)
        : ([path, raw] as const),
    ),
    /publisher_artifact_.*_raw32_invalid/,
  ],
] as const) {
  const root = realpathSync.native(
    mkdtempSync(join(tmpdir(), `cheng-current-release-semantic-${name}-`)),
  );
  try {
    const receiptPath = writePublisherEnvelopeFixture(
      root,
      "current",
      additionalArtifacts,
    );
    assert.throws(
      () => inspectCurrentReleaseSemanticPublisherArtifacts(receiptPath),
      expected,
      name,
    );
  } finally {
    removePublisherFixture(root);
  }
}

const semanticOrderRoot = realpathSync.native(
  mkdtempSync(join(tmpdir(), "cheng-current-release-semantic-order-")),
);
try {
  const receiptPath = writePublisherEnvelopeFixture(
    semanticOrderRoot,
    "current",
    [...SEMANTIC_PUBLISHER_ARTIFACTS].reverse(),
    false,
  );
  assert.throws(
    () => inspectCurrentReleaseSemanticPublisherArtifacts(receiptPath),
    /publisher_artifact_order_invalid/,
  );
} finally {
  removePublisherFixture(semanticOrderRoot);
}

const semanticIdentityRoot = realpathSync.native(
  mkdtempSync(join(tmpdir(), "cheng-current-release-semantic-identity-")),
);
try {
  const receiptPath = writePublisherEnvelopeFixture(
    semanticIdentityRoot,
    "current",
    SEMANTIC_PUBLISHER_ARTIFACTS,
  );
  const path = join(semanticIdentityRoot, "published-binding.bin");
  chmodSync(path, 0o600);
  writeFileSync(path, "tampered binding\n");
  assert.throws(
    () => inspectCurrentReleaseSemanticPublisherArtifacts(receiptPath),
    /publisher_artifact_.*_identity_drift/,
  );
} finally {
  removePublisherFixture(semanticIdentityRoot);
}

const semanticNlinkRoot = realpathSync.native(
  mkdtempSync(join(tmpdir(), "cheng-current-release-semantic-nlink-")),
);
try {
  const receiptPath = writePublisherEnvelopeFixture(
    semanticNlinkRoot,
    "current",
    SEMANTIC_PUBLISHER_ARTIFACTS,
  );
  linkSync(
    join(semanticNlinkRoot, "published-query-projection.bin"),
    join(semanticNlinkRoot, "unmanifested-hardlink.bin"),
  );
  assert.throws(
    () => inspectCurrentReleaseSemanticPublisherArtifacts(receiptPath),
    /publisher_artifact_.*_identity_invalid/,
  );
} finally {
  removePublisherFixture(semanticNlinkRoot);
}

for (const kind of ["symlink", "nonregular"] as const) {
  const root = realpathSync.native(
    mkdtempSync(join(tmpdir(), `cheng-current-release-semantic-${kind}-`)),
  );
  try {
    const receiptPath = writePublisherEnvelopeFixture(
      root,
      "current",
      SEMANTIC_PUBLISHER_ARTIFACTS,
    );
    const path = join(root, "published-open-document-universe.bin");
    rmSync(path);
    if (kind === "symlink") {
      symlinkSync(join(root, "published-binding.bin"), path);
    } else {
      mkdirSync(path);
    }
    assert.throws(
      () => inspectCurrentReleaseSemanticPublisherArtifacts(receiptPath),
      /publisher_artifact_.*_identity_invalid/,
      kind,
    );
  } finally {
    removePublisherFixture(root);
  }
}

for (const sourceClosureSchema of ["legacy", "dual", "missing"] as const) {
  const root = realpathSync.native(
    mkdtempSync(
      join(
        tmpdir(),
        `cheng-current-release-publisher-${sourceClosureSchema}-schema-`,
      ),
    ),
  );
  try {
    const receiptPath = writePublisherEnvelopeFixture(
      root,
      sourceClosureSchema,
    );
    assert.throws(
      () => inspectCurrentReleasePublisherEnvelope(receiptPath),
      /current_release_publisher_receipt_keys_invalid/,
      sourceClosureSchema,
    );
  } finally {
    removePublisherFixture(root);
  }
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
  removePublisherFixture(publisherMutationRoot);
}

for (const [receiptKey, runtimeKey] of [
  [
    "darwin_runtime_formal_physical_sha256",
    "physical",
  ],
  [
    "darwin_runtime_formal_logical_sha256",
    "logical",
  ],
  [
    "darwin_runtime_formal_path_role_sha256",
    "path-role",
  ],
  [
    "darwin_runtime_formal_support_path_role_sha256",
    "support-path-role",
  ],
] as const) {
  const root = realpathSync.native(
    mkdtempSync(
      join(
        tmpdir(),
        `cheng-current-release-runtime-${runtimeKey}-mutation-`,
      ),
    ),
  );
  try {
    const receiptPath = writePublisherEnvelopeFixture(root);
    mutateSealedKvField(
      receiptPath,
      receiptKey,
      hash(`runtime-formal:${runtimeKey}:mutated`),
      "receipt_payload_sha256",
    );
    assert.throws(
      () => inspectCurrentReleasePublisherEnvelope(receiptPath),
      /current_release_runtime_formal_authority_drift/,
      runtimeKey,
    );
  } finally {
    removePublisherFixture(root);
  }
}

for (const [field, expected] of [
  [
    "directory.0.uid",
    /current_release_publisher_directory_0_identity_drift/,
  ],
  [
    "directory.0.gid",
    /current_release_publisher_directory_0_identity_drift/,
  ],
  [
    "artifact.0.nlink",
    /current_release_publisher_artifact_0_identity_drift/,
  ],
  [
    "artifact.0.uid",
    /current_release_publisher_artifact_0_identity_drift/,
  ],
  [
    "artifact.0.gid",
    /current_release_publisher_artifact_0_identity_drift/,
  ],
] as const) {
  const root = realpathSync.native(
    mkdtempSync(
      join(
        tmpdir(),
        `cheng-current-release-identity-${field.replaceAll(".", "-")}-`,
      ),
    ),
  );
  try {
    const receiptPath = writePublisherEnvelopeFixture(root);
    mutateManifestFieldAndRebind(root, receiptPath, field);
    assert.throws(
      () => inspectCurrentReleasePublisherEnvelope(receiptPath),
      expected,
      field,
    );
  } finally {
    removePublisherFixture(root);
  }
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
    semanticSourceMembershipFocusedStdout: pin(
      "/release/source-membership-focused.stdout.txt",
    ),
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
    publisherReceiptRaw32: hash("publisher-receipt"),
    publisherManifestRaw32: hash("publisher-manifest"),
    runtimeFormalValidationRaw32: hash("runtime-formal-validation"),
    runtimeFormalPhysicalRaw32: hash("runtime-formal-physical"),
    runtimeFormalLogicalRaw32: hash("runtime-formal-logical"),
    runtimeFormalPathRoleRaw32: hash("runtime-formal-path-role"),
    runtimeFormalSupportPathRoleRaw32: hash(
      "runtime-formal-support-path-role",
    ),
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
  const artifact = (name: string, contents = `${name}\n`) => {
    const path = join(harnessRoot, name);
    writeFileSync(path, contents);
    const pin = existingHarnessPin(path);
    return { ...pin, inode: lstatSync(path).ino.toString() };
  };
  const driverA = artifact("driver-a", "fixed-point-driver\n");
  const driverB = artifact("driver-b", "fixed-point-driver\n");
  const source = artifact("source.cheng");
  const receiptA = artifact("receipt-a.json");
  const receiptB = artifact("receipt-b.json");
  const formalSpec = existingHarnessPin(
    join(CHENG_CURRENT_ROOT, "docs/cheng-formal-spec.md"),
  );
  const parserSource = existingHarnessPin(
    join(CHENG_CURRENT_ROOT, "src/core/lang/parser.cheng"),
  );
  const receiptProducer = existingHarnessPin(
    join(
      CHENG_CURRENT_ROOT,
      "src/core/tooling/compiler_parser_receipt.cheng",
    ),
  );
  const driverEntry = existingHarnessPin(
    join(
      CHENG_CURRENT_ROOT,
      "src/core/tooling/backend_driver_dispatch_min.cheng",
    ),
  );
  const bootstrap = existingHarnessPin(
    join(CHENG_CURRENT_ROOT, "bootstrap/cheng_cold.c"),
  );
  const parserNodeMap = existingHarnessPin(
    join(
      "/Users/lbcheng/cheng-fusion",
      "fixtures/semantic/ebnf_parser_node_map.json",
    ),
  );
  const parserNodeMapValue = JSON.parse(
    readFileSync(parserNodeMap.path, "utf8"),
  ) as any;
  const buildCompilerPath = realpathSync.native("/usr/bin/cc");
  const buildCompilerPin = existingHarnessPin(buildCompilerPath);
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
    officialCurrentBuild: {
      bindingPath: join(harnessRoot, "current-official-binding.kv"),
      bindingSha256: hash("official-binding"),
      officialBuildReceiptPath: join(
        harnessRoot,
        "cheng.current-build-receipt.kv",
      ),
      officialBuildReceiptSha256: hash("official-build-receipt"),
      sourceSnapshotManifestPath: join(
        harnessRoot,
        "cheng-source-snapshot.manifest.txt",
      ),
      sourceSnapshotManifestSha256: hash("source-snapshot-manifest"),
      sourceSnapshotRoot: CHENG_CURRENT_ROOT,
      sourceSnapshotClosureSha256: hash("source-snapshot-closure"),
      officialDriverPath: driverA.path,
      officialDriverSha256: driverA.sha256,
    },
    formalEbnfSha256: parserNodeMapValue.spec.ebnfSha256,
    formalSpec: {
      path: formalSpec.path,
      sha256: formalSpec.sha256,
    },
    parser: {
      path: parserSource.path,
      sha256: parserSource.sha256,
    },
    receiptProducer: {
      path: receiptProducer.path,
      sha256: receiptProducer.sha256,
    },
    driverEntry: {
      path: driverEntry.path,
      sha256: driverEntry.sha256,
    },
    bootstrap: {
      path: bootstrap.path,
      sha256: bootstrap.sha256,
    },
    harness: { path: fusionPackage.path, sha256: fusionPackage.sha256 },
    parserNodeMap: {
      path: parserNodeMap.path,
      sha256: parserNodeMap.sha256,
    },
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
      executablePath: buildCompilerPath,
      executableSha256: buildCompilerPin.sha256,
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
        parserBindingSha256: hash("parser-binding"),
        parserBindingRequiredResultCount: 971,
        parserBindingHitCount: 1,
      },
      {
        ...receiptB,
        sourcePath: source.path,
        driverRole: "receipt_driver_b",
        driverSha256: driverB.sha256,
        parserTraceRootSha256: hash("trace"),
        parserBindingSha256: hash("parser-binding"),
        parserBindingRequiredResultCount: 971,
        parserBindingHitCount: 1,
      },
    ],
  };
  assert.throws(
    () => pinCurrentParserHarnessClosure(harnessManifest),
    /driver_parse_receipt|json/i,
    "current release 必须拒绝未经过 current binder 的旧合成 receipt",
  );
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

const publishedCandidateAuthority = {
  sourceSetCid: hash("source-set"),
  sourceVersion: 7,
  documentCount: 3,
  openDocumentCount: 3,
  compilerSha256: hash("compiler"),
  formalSpecSha256: hash("formal-spec"),
  sourceClosureCid: hash("source-closure"),
  objectSha256: hash("object"),
  bindingReceiptCid: hash("binding"),
  queryProjectionCid: hash("query"),
  openDocumentUniverseCid: hash("open-document-universe"),
  snapshotPayloadCid: hash("snapshot"),
  stdoutSha256: hash("stdout"),
  routingReceiptCid: hash("routing"),
};
const publishedRuntimeReceiptCid = currentReleaseDomainCid(
  "cheng.semantic_snapshot.published_candidate_receipt",
  [
    publishedCandidateAuthority.sourceSetCid,
    publishedCandidateAuthority.stdoutSha256,
    publishedCandidateAuthority.compilerSha256,
    publishedCandidateAuthority.formalSpecSha256,
    publishedCandidateAuthority.sourceClosureCid,
    publishedCandidateAuthority.objectSha256,
    String(publishedCandidateAuthority.sourceVersion),
    String(publishedCandidateAuthority.documentCount),
    String(publishedCandidateAuthority.openDocumentCount),
    publishedCandidateAuthority.bindingReceiptCid,
    publishedCandidateAuthority.queryProjectionCid,
    publishedCandidateAuthority.openDocumentUniverseCid,
    publishedCandidateAuthority.snapshotPayloadCid,
  ],
);
const publishedCandidateReceipt = {
  schema: "cheng.semantic_snapshot.published_candidate_receipt",
  status: "pass",
  executionBound: true,
  ...publishedCandidateAuthority,
  runtimeReceiptCid: publishedRuntimeReceiptCid,
  receiptCid: currentReleaseDomainCid(
    "cheng.semantic_snapshot.published_candidate_execution_receipt",
    [
      publishedCandidateAuthority.sourceSetCid,
      publishedRuntimeReceiptCid,
      publishedCandidateAuthority.routingReceiptCid,
      String(publishedCandidateAuthority.sourceVersion),
      String(publishedCandidateAuthority.documentCount),
      String(publishedCandidateAuthority.openDocumentCount),
      publishedCandidateAuthority.compilerSha256,
      publishedCandidateAuthority.formalSpecSha256,
      publishedCandidateAuthority.sourceClosureCid,
      publishedCandidateAuthority.objectSha256,
      publishedCandidateAuthority.bindingReceiptCid,
      publishedCandidateAuthority.queryProjectionCid,
      publishedCandidateAuthority.openDocumentUniverseCid,
      publishedCandidateAuthority.snapshotPayloadCid,
      publishedCandidateAuthority.stdoutSha256,
    ],
  ),
};
assert.equal(
  validateCurrentPublishedCandidateExecutionReceipt(
    publishedCandidateReceipt,
    publishedCandidateAuthority,
  ),
  publishedCandidateReceipt.receiptCid,
);
assert.equal(
  currentPublishedCandidateReceiptBindingCid(
    publishedCandidateReceipt.receiptCid),
  semanticSnapshotPublishedCandidateReceiptBindingCid(
    publishedCandidateReceipt),
);
assert.notEqual(
  currentPublishedCandidateReceiptBindingCid(
    publishedCandidateReceipt.receiptCid),
  publishedCandidateReceipt.receiptCid,
);
const publishedCandidateWithoutSourceSet = {...publishedCandidateReceipt};
delete publishedCandidateWithoutSourceSet.sourceSetCid;
assert.throws(
  () => validateCurrentPublishedCandidateExecutionReceipt(
    publishedCandidateWithoutSourceSet,
    publishedCandidateAuthority,
  ),
  /current_release_published_candidate_keys_invalid/,
);
assert.throws(
  () => validateCurrentPublishedCandidateExecutionReceipt(
    {
      ...publishedCandidateReceipt,
      receiptCid: currentReleaseDomainCid(
        "cheng.semantic_snapshot.published_candidate_execution_receipt",
        [
          publishedCandidateAuthority.sourceSetCid,
          publishedRuntimeReceiptCid,
          publishedCandidateAuthority.routingReceiptCid,
          publishedCandidateAuthority.formalSpecSha256,
        ],
      ),
    },
    publishedCandidateAuthority,
  ),
  /current_release_published_candidate_cid_drift/,
);
const changedPublishedPayloadAuthority = {
  ...publishedCandidateAuthority,
  snapshotPayloadCid: hash("snapshot-tampered"),
};
assert.throws(
  () => validateCurrentPublishedCandidateExecutionReceipt(
    {
      ...publishedCandidateReceipt,
      snapshotPayloadCid: changedPublishedPayloadAuthority.snapshotPayloadCid,
      receiptCid: currentReleaseDomainCid(
        "cheng.semantic_snapshot.published_candidate_execution_receipt",
        [
          changedPublishedPayloadAuthority.sourceSetCid,
          publishedRuntimeReceiptCid,
          changedPublishedPayloadAuthority.routingReceiptCid,
          String(changedPublishedPayloadAuthority.sourceVersion),
          String(changedPublishedPayloadAuthority.documentCount),
          String(changedPublishedPayloadAuthority.openDocumentCount),
          changedPublishedPayloadAuthority.compilerSha256,
          changedPublishedPayloadAuthority.formalSpecSha256,
          changedPublishedPayloadAuthority.sourceClosureCid,
          changedPublishedPayloadAuthority.objectSha256,
          changedPublishedPayloadAuthority.bindingReceiptCid,
          changedPublishedPayloadAuthority.queryProjectionCid,
          changedPublishedPayloadAuthority.openDocumentUniverseCid,
          changedPublishedPayloadAuthority.snapshotPayloadCid,
          changedPublishedPayloadAuthority.stdoutSha256,
        ],
      ),
    },
    changedPublishedPayloadAuthority,
  ),
  /current_release_published_candidate_cid_drift/,
);
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
        sourceMembershipFocusedStdoutRaw: Buffer.from("fabricated\n"),
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
    "replay/alias/perf mutations hard-red semantic_publisher_mutations=9 " +
    "runtime_authority_mutations=4 publisher_identity_mutations=5 " +
    "source_membership_focused_mutations=6",
);
