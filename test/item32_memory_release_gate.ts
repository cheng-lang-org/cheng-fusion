#!/usr/bin/env bun

import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {
  linkSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {
  HARD_GATE_RECEIPT_KEYS,
  verifyLinuxMemoryReceipt,
} from "../src/cheng_cid_identity_chain_evidence.ts";
import {
  CHENG_MEMORY_RELEASE_BACKENDS,
  CHENG_MEMORY_RELEASE_DRIVER_RECEIPT_SCHEMA,
  CHENG_MEMORY_RELEASE_FAILURE_PATHS,
  CHENG_MEMORY_RELEASE_GATE_SCHEMA,
  CHENG_MEMORY_RELEASE_OUTCOMES,
  CHENG_MEMORY_RELEASE_RECEIPT_SCHEMA,
  CHENG_MEMORY_RELEASE_REQUIRED_CASES,
  CHENG_MEMORY_RELEASE_TARGETS,
  memoryReleaseCanonicalJson,
  parseMemoryReleaseGateManifest,
  verifyMemoryReleaseDriverReceipt,
  verifyMemoryReleaseGate,
  verifyMemoryReleaseReceipt,
} from "../src/cheng_memory_release_gate.ts";
import {
  CHENG_MEMORY_RELEASE_GATE_AUDIT_SCHEMA,
  runMemoryReleaseGateAudit,
} from "../src/cheng_memory_release_gate_audit.ts";
import {handleMcpRequest} from "../src/cheng_fusion_mcp_server_m9009.ts";
import {
  getChengFusionToolManifest,
  initChengFusionToolRegistryModule,
} from "../src/cheng_fusion_tool_registry.ts";

const CLI = fileURLToPath(
  new URL("../tools/memory_release_gate_verify.ts", import.meta.url),
);

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function selfHashedJson(
  projection: Record<string, unknown>,
  key: "receiptSha256" | "manifestSha256",
): Buffer {
  return Buffer.from(`${memoryReleaseCanonicalJson({
    ...projection,
    [key]: sha256(memoryReleaseCanonicalJson(projection)),
  })}\n`);
}

function entered(component: string, pathKind: string): boolean {
  if (component === "production_entry") return true;
  if (component === "compiler_csg") {
    return !["source_admission_failure", "parser_failure"].includes(pathKind);
  }
  if (component === "lowering") {
    return ![
      "source_admission_failure",
      "parser_failure",
      "csg_failure",
    ].includes(pathKind);
  }
  return ["backend_failure", "emit_failure", "success"].includes(pathKind);
}

function componentProof(component: string) {
  if (component === "production_entry") {
    return {
      producerOperation: "SystemLinkExecPlanCompleteExecution",
      receiptKind: "system_link_exec_payload_finalize_receipt",
    };
  }
  if (component === "compiler_csg") {
    return {
      producerOperation: "CompilerCsgProductionLifetimeReceiptInto",
      receiptKind: "compiler_csg_production_lifetime_receipt",
    };
  }
  if (component === "lowering") {
    return {
      producerOperation: "CompilerPayloadLifecycleEnd",
      receiptKind: "compiler_payload_lifecycle_receipt",
    };
  }
  if (component === "body_ir") {
    return {
      producerOperation: "BodyIrFunctionLifecycleRelease",
      receiptKind: "body_ir_function_lifecycle_receipt_set",
    };
  }
  if (component === "primary") {
    return {
      producerOperation: "PrimaryObjectPlanReleaseWithReceipt",
      receiptKind: "primary_object_plan_release_receipt",
    };
  }
  assert.equal(component, "backend2");
  return {
    producerOperation: "Backend2AssemblerTempLifecycleFinalizeStrictInto",
    receiptKind: "backend2_assembler_temp_release_receipt",
  };
}

function ledgerRow(pathKind: string, component: string) {
  const active = entered(component, pathKind);
  const proof = componentProof(component);
  const ownsLedger = active && component !== "primary";
  const ledgerSequenceCount =
    ownsLedger && component === "body_ir" ? "18" : ownsLedger ? "6" : "0";
  const row = {
    allocated: active ? "3" : "0",
    allocatedBytes: active ? "192" : "0",
    component,
    ledgerStorageReleased: ownsLedger,
    ledgerStorageReleasedSequenceCount: ledgerSequenceCount,
    // A borrow-free component frees five of the six ledger sequences; the
    // structural count above is what stays pinned at six.
    ledgerStorageReleasedBufferCount: ownsLedger ? "5" : "0",
    ledgerStorageReleasedBytes: ownsLedger ? "384" : "0",
    live: "0",
    liveBytes: "0",
    pathKind,
    physicalBufferCount: active ? "2" : "0",
    physicalFreeCount: active ? "2" : "0",
    producerOperation: active ? proof.producerOperation : "",
    receiptKind: active ? proof.receiptKind : "",
    released: active ? "3" : "0",
    releasedBytes: active ? "192" : "0",
    stateMachineReceiptCid: "",
    storageReleased: active,
  };
  if (active) {
    const {
      stateMachineReceiptCid: _stateMachineReceiptCid,
      ...stateProjection
    } = row;
    row.stateMachineReceiptCid =
      sha256(memoryReleaseCanonicalJson(stateProjection));
  }
  return row;
}

function releaseProjection(
  row: typeof CHENG_MEMORY_RELEASE_REQUIRED_CASES[number],
) {
  const driverBytesRaw32 = sha256(`driver:${row.targetTriple}`);
  const compilerSourceClosureRaw32 = sha256("source-closure");
  const workloadRunnerRaw32 = sha256("memory-runner");
  const paths = row.outcome === "success"
    ? ["success"]
    : [...CHENG_MEMORY_RELEASE_FAILURE_PATHS];
  const components = [
    "production_entry",
    "compiler_csg",
    "lowering",
    "body_ir",
    row.backend,
  ];
  const ledgerRows = paths.flatMap((pathKind) =>
    components.map((component) => ledgerRow(pathKind, component))
  );
  const orcRows = paths.map((pathKind) => ({
    allocCount: "1",
    freeCount: "1",
    iterations: row.outcome === "success" ? "5000" : "1",
    liveCount: "0",
    pathKind,
    releaseCount: row.outcome === "success" ? "5000" : "0",
    retainCount: row.outcome === "success" ? "5000" : "0",
  }));
  const expected = {
    backend: row.backend,
    caseId: row.caseId,
    compilerSourceClosureRaw32,
    driverBytesRaw32,
    outcome: row.outcome,
    targetTriple: row.targetTriple,
    workloadRunnerRaw32,
  };
  const driverProjection = {
    backend: row.backend,
    caseId: row.caseId,
    compilerSourceClosureRaw32,
    driverBytesRaw32,
    driverRole: "production",
    ledgerRows,
    orcRows,
    outcome: row.outcome,
    schema: CHENG_MEMORY_RELEASE_DRIVER_RECEIPT_SCHEMA,
    targetTriple: row.targetTriple,
    workloadRunnerRaw32,
  };
  const driverRaw = selfHashedJson(driverProjection, "receiptSha256");
  const driverChildArgv = [
    "memory-release-case",
    row.caseId,
    row.targetTriple,
    row.backend,
    row.outcome,
    "/cheng-memory-release/source-closure",
    driverBytesRaw32,
    compilerSourceClosureRaw32,
    workloadRunnerRaw32,
  ];
  return {
    expected,
    driverProjection,
    projection: {
      driverChildArgv,
      driverChildCommandPath: "/cheng-memory-release/driver",
      driverChildExitCode: "0",
      driverReceipt: JSON.parse(driverRaw.toString("utf8")),
      driverReceiptRaw32: sha256(driverRaw),
      schema: CHENG_MEMORY_RELEASE_RECEIPT_SCHEMA,
    },
  };
}

for (const row of CHENG_MEMORY_RELEASE_REQUIRED_CASES) {
  const built = releaseProjection(row);
  const raw = selfHashedJson(built.projection, "receiptSha256");
  const verified = verifyMemoryReleaseReceipt(raw, built.expected);
  const driverVerified = verifyMemoryReleaseDriverReceipt(
    selfHashedJson(built.driverProjection, "receiptSha256"),
    built.expected,
  );
  assert.equal(verified.caseId, row.caseId);
  assert.equal(driverVerified.caseId, row.caseId);
  assert.equal(verified.pathCount, row.outcome === "success" ? 1 : 6);
  assert.equal(
    verified.ledgerRowCount,
    verified.pathCount * 5,
  );
  assert.equal(verified.orcRowCount, verified.pathCount);
}
assert.equal(CHENG_MEMORY_RELEASE_REQUIRED_CASES.length, 8);
assert.deepEqual(
  [...new Set(CHENG_MEMORY_RELEASE_REQUIRED_CASES.map((row) => row.targetTriple))],
  [...CHENG_MEMORY_RELEASE_TARGETS],
);
assert.deepEqual(
  [...new Set(CHENG_MEMORY_RELEASE_REQUIRED_CASES.map((row) => row.backend))],
  [...CHENG_MEMORY_RELEASE_BACKENDS],
);
assert.deepEqual(
  [...new Set(CHENG_MEMORY_RELEASE_REQUIRED_CASES.map((row) => row.outcome))],
  [...CHENG_MEMORY_RELEASE_OUTCOMES],
);

const success = releaseProjection(CHENG_MEMORY_RELEASE_REQUIRED_CASES[0]!);
function receiptMutation(
  mutate: (projection: Record<string, any>) => void,
  recomputeStateMachineCids = true,
): Buffer {
  const projection = structuredClone(success.projection) as Record<string, any>;
  mutate(projection);
  if (projection.driverReceipt !== undefined) {
    if (recomputeStateMachineCids) {
      for (const row of projection.driverReceipt.ledgerRows) {
        if (row.stateMachineReceiptCid !== "") {
          const {
            stateMachineReceiptCid: _stateMachineReceiptCid,
            ...stateProjection
          } = row;
          row.stateMachineReceiptCid =
            sha256(memoryReleaseCanonicalJson(stateProjection));
        }
      }
    }
    const driverProjection = structuredClone(projection.driverReceipt);
    delete driverProjection.receiptSha256;
    projection.driverReceipt.receiptSha256 =
      sha256(memoryReleaseCanonicalJson(driverProjection));
    projection.driverReceiptRaw32 = sha256(
      `${memoryReleaseCanonicalJson(projection.driverReceipt)}\n`,
    );
  }
  return selfHashedJson(projection, "receiptSha256");
}

function runnerReceiptMutation(
  mutate: (projection: Record<string, any>) => void,
): Buffer {
  const projection = structuredClone(success.projection) as Record<string, any>;
  mutate(projection);
  return selfHashedJson(projection, "receiptSha256");
}

assert.throws(
  () => verifyMemoryReleaseReceipt(
    receiptMutation((value) => {
      value.schema = "cheng.memory_release_receipt.invalid";
    }),
    success.expected,
  ),
  /child identity\/exit/,
);
assert.throws(
  () => verifyMemoryReleaseReceipt(
    receiptMutation((value) => {
      value.driverReceipt.ledgerRows[0].live = "1";
    }),
    success.expected,
  ),
  /not (physically )?closed/,
);
assert.throws(
  () => verifyMemoryReleaseReceipt(
    receiptMutation((value) => {
      value.driverReceipt.ledgerRows[0].ledgerStorageReleasedSequenceCount = "5";
    }),
    success.expected,
  ),
  /not (physically )?closed/,
);
assert.throws(
  () => verifyMemoryReleaseReceipt(
    receiptMutation((value) => {
      value.driverReceipt.ledgerRows[0].ledgerStorageReleasedBufferCount = "0";
    }),
    success.expected,
  ),
  /not (physically )?closed/,
);
assert.throws(
  () => verifyMemoryReleaseReceipt(
    receiptMutation((value) => {
      value.driverReceipt.ledgerRows[0].ledgerStorageReleasedBufferCount = "7";
    }),
    success.expected,
  ),
  /not (physically )?closed/,
);
assert.throws(
  () => verifyMemoryReleaseReceipt(
    receiptMutation((value) => {
      value.driverReceipt.ledgerRows[0].released = "2";
    }),
    success.expected,
  ),
  /not (physically )?closed/,
);
assert.throws(
  () => verifyMemoryReleaseReceipt(
    receiptMutation((value) => {
      value.driverReceipt.ledgerRows[0].physicalFreeCount = "1";
    }),
    success.expected,
  ),
  /not (physically )?closed/,
);
assert.throws(
  () => verifyMemoryReleaseReceipt(
    receiptMutation((value) => {
      value.driverReceipt.orcRows[0].freeCount = "0";
    }),
    success.expected,
  ),
  /ORC alloc\/free\/live/,
);
assert.throws(
  () => verifyMemoryReleaseReceipt(
    receiptMutation((value) => {
      value.driverReceipt.orcRows[0].iterations = "4999";
    }),
    success.expected,
  ),
  /5000-iteration/,
);
assert.throws(
  () => verifyMemoryReleaseReceipt(
    receiptMutation((value) => {
      value.driverReceipt.ledgerRows.reverse();
    }),
    success.expected,
  ),
  /path\/component\/entered mismatch/,
);
assert.throws(
  () => verifyMemoryReleaseReceipt(
    receiptMutation((value) => {
      value.driverReceipt.driverRole = "diagnostic";
    }),
    success.expected,
  ),
  /identity\/role mismatch/,
);
assert.throws(
  () => verifyMemoryReleaseReceipt(
    receiptMutation((value) => {
      value.driverReceipt.ledgerRows[0].stateMachineReceiptCid =
        sha256("forged-component-state");
    }, false),
    success.expected,
  ),
  /state-machine receipt CID mismatch/,
);
assert.throws(
  () => verifyMemoryReleaseReceipt(
    receiptMutation((value) => {
      value.driverReceipt.ledgerRows[0].producerOperation =
        "RunnerFabricatedComponentLedger";
    }),
    success.expected,
  ),
  /state-machine producer mismatch/,
);
assert.throws(
  () => verifyMemoryReleaseReceipt(
    runnerReceiptMutation((value) => {
      value.driverChildCommandPath = "/cheng-memory-release/not-driver";
    }),
    success.expected,
  ),
  /child identity\/exit/,
);
assert.throws(
  () => verifyMemoryReleaseReceipt(
    runnerReceiptMutation((value) => {
      value.driverChildArgv[1] = "different-case";
    }),
    success.expected,
  ),
  /child argv mismatch/,
);
assert.throws(
  () => verifyMemoryReleaseReceipt(
    runnerReceiptMutation((value) => {
      value.driverChildExitCode = "1";
    }),
    success.expected,
  ),
  /child identity\/exit/,
);
assert.throws(
  () => verifyMemoryReleaseReceipt(
    runnerReceiptMutation((value) => {
      value.driverReceiptRaw32 = sha256("forged-child-stdout");
    }),
    success.expected,
  ),
  /child stdout identity/,
);
assert.throws(
  () => verifyMemoryReleaseReceipt(
    receiptMutation((value) => {
      value.compatibility = true;
    }),
    success.expected,
  ),
  /keys mismatch/,
);

function hardGateReceipt(stdout: Buffer): Buffer {
  const hash = sha256("hard-gate-field");
  const rows = new Map<string, string>(
    HARD_GATE_RECEIPT_KEYS.map((key) => [
      key,
      key.endsWith("sha256") ? hash : "0",
    ]),
  );
  const values: Record<string, string> = Object.fromEntries(rows);
  Object.assign(values, {
    tool: "tools/beat_c_linux_cgroup_v2_hard_memory_gate.sh",
    schema: "beat_c_linux_cgroup_v2_hard_memory_gate",
    status: "completed",
    applicability: "linux_colima_container_cgroup_v2_only",
    darwin_official_driver_status:
      "not_covered_macho_cannot_execute_in_linux_vm",
    hard_memory_limit_proof_status:
      "proved_linux_kernel_cgroup_v2_aggregate",
    memory_enforcement_scope: "container_and_all_descendants",
    mode: "workload",
    memory_limit_bytes: "1073741824",
    memory_swap_max_bytes: "0",
    memory_and_swap_total_limit_bytes: "1073741824",
    attack_child_count: "0",
    attack_child_bytes: "0",
    attack_aggregate_bytes: "0",
    workload_rc: "0",
    attack_child_one_rc: "-1",
    attack_child_two_rc: "-1",
    docker_attach_rc: "0",
    container_exit_code: "0",
    container_oom_killed_before: "0",
    container_oom_killed_after: "0",
    container_oom_killed_final: "0",
    cgroup_mount_type: "cgroup2",
    native_descriptor_machine: "x86_64",
    native_descriptor_controller_host_os: "darwin",
    native_descriptor_controller_host_machine: "x86_64",
    native_descriptor_controller_host_translated: "false",
    native_descriptor_native_execution: "true",
    native_descriptor_emulation: "false",
    native_descriptor_native_execution_proof:
      "controller_guest_same_isa_and_guest_cpuinfo_no_qemu_tcg",
    controller_host_os: "darwin",
    controller_host_machine: "x86_64",
    controller_host_translated: "false",
    vm_architecture: "x86_64",
    guest_cpu_emulation_status: "not_detected",
    native_execution_proof:
      "controller_guest_same_isa_and_guest_cpuinfo_no_qemu_tcg",
    native_descriptor_source_closure_cid: hash,
    source_closure_cid: hash,
    current_source_binding_status: "bound_unique_current",
    memory_peak_after_bytes: "4096",
    stdout_sha256: sha256(stdout),
    stdout_size: String(stdout.length),
    stderr_sha256: sha256(Buffer.alloc(0)),
    stderr_size: "0",
    output_identity_schema: "beat_c_linux_cgroup_v2_output_identity",
    output_path_history_monitor: "darwin_kqueue_vnode",
    output_path_history_status: "verified_clean",
    output_path_history_forbidden_events: "delete,link,rename,revoke",
    control_stderr_sha256: sha256(Buffer.alloc(0)),
    control_stderr_size: "0",
  });
  for (const key of [
    "low",
    "high",
    "max",
    "oom",
    "oom_kill",
    "oom_group_kill",
  ]) {
    values[`memory_events_before_${key}`] = "0";
    values[`memory_events_after_${key}`] = "0";
  }
  const prefix = HARD_GATE_RECEIPT_KEYS.slice(0, -1)
    .map((key) => `${key}=${values[key]}`)
    .join("\n") + "\n";
  values.receipt_sha256 = sha256(prefix);
  return Buffer.from(
    HARD_GATE_RECEIPT_KEYS.map((key) => `${key}=${values[key]}`).join("\n") +
      "\n",
  );
}

const hardReceipt = hardGateReceipt(
  selfHashedJson(success.projection, "receiptSha256"),
);
const hardRows = verifyLinuxMemoryReceipt(
  hardReceipt,
  "unit workload cgroup receipt",
  "workload",
);
assert.equal(hardRows.get("memory_limit_bytes"), "1073741824");
assert.equal(hardRows.get("memory_swap_max_bytes"), "0");
function hardReceiptMutation(
  raw: Buffer,
  key: string,
  value: string,
): Buffer {
  const rows = new Map(
    raw.toString("utf8").trimEnd().split("\n").map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1)] as const;
    }),
  );
  rows.set(key, value);
  const prefix = HARD_GATE_RECEIPT_KEYS.slice(0, -1)
    .map((name) => `${name}=${rows.get(name)}`)
    .join("\n") + "\n";
  rows.set("receipt_sha256", sha256(prefix));
  return Buffer.from(
    HARD_GATE_RECEIPT_KEYS.map((name) => `${name}=${rows.get(name)}`).join("\n") +
      "\n",
  );
}
assert.throws(
  () => verifyLinuxMemoryReceipt(
    hardReceiptMutation(
      hardReceipt,
      "hard_memory_limit_proof_status",
      "not_provable_userspace_poll",
    ),
    "userspace poll mutant",
    "workload",
  ),
  /Linux cgroup v2/,
);
assert.throws(
  () => verifyLinuxMemoryReceipt(
    hardReceiptMutation(hardReceipt, "memory_swap_max_bytes", "1"),
    "swap mutant",
    "workload",
  ),
  /swap=0/,
);
assert.throws(
  () => verifyLinuxMemoryReceipt(
    hardReceiptMutation(hardReceipt, "controller_host_machine", "aarch64"),
    "cross ISA controller mutant",
    "workload",
  ),
  /身份链/,
);
assert.throws(
  () => verifyLinuxMemoryReceipt(
    hardReceiptMutation(
      hardReceipt,
      "guest_cpu_emulation_status",
      "qemu_tcg",
    ),
    "QEMU TCG mutant",
    "workload",
  ),
  /身份链/,
);
assert.throws(
  () => verifyLinuxMemoryReceipt(
    hardReceiptMutation(hardReceipt, "source_closure_cid", sha256("other")),
    "portable source CID mutant",
    "workload",
  ),
  /current source/,
);

const sourcePin = {
  byteLength: 1,
  bytesRaw32: sha256("source"),
  path: "identity/source.manifest",
};
const runnerPin = {
  byteLength: 1,
  bytesRaw32: sha256("runner"),
  path: "tools/memory-workload",
};
const driverPins = CHENG_MEMORY_RELEASE_TARGETS.map((targetTriple) => ({
  artifact: {
    byteLength: 64,
    bytesRaw32: sha256(`driver:${targetTriple}`),
    path: `drivers/${targetTriple}/cheng`,
  },
  targetTriple,
}));
const manifestProjection = {
  cases: CHENG_MEMORY_RELEASE_REQUIRED_CASES.map((row, index) => ({
    backend: row.backend,
    caseId: row.caseId,
    cgroupEvidenceDirectory: `cgroup/case-${index}`,
    cgroupReceiptRaw32: sha256(`cgroup:${index}`),
    outcome: row.outcome,
    releaseReceiptRaw32: sha256(`release:${index}`),
    targetTriple: row.targetTriple,
  })),
  drivers: driverPins,
  evidenceKind: "production",
  schema: CHENG_MEMORY_RELEASE_GATE_SCHEMA,
  sourceClosure: sourcePin,
  workloadRunner: runnerPin,
};
const manifestRaw = selfHashedJson(manifestProjection, "manifestSha256");
const parsedManifest = parseMemoryReleaseGateManifest(manifestRaw);
assert.equal(parsedManifest.caseIds.length, 8);
assert.throws(
  () => parseMemoryReleaseGateManifest(selfHashedJson({
    ...manifestProjection,
    schema: "cheng.memory_release_gate.invalid",
  }, "manifestSha256")),
  /unique current production schema/,
);
assert.throws(
  () => parseMemoryReleaseGateManifest(selfHashedJson({
    ...manifestProjection,
    cases: manifestProjection.cases.slice(0, -1),
  }, "manifestSha256")),
  /case matrix is incomplete/,
);
const aliasedManifest = structuredClone(manifestProjection);
aliasedManifest.cases[1]!.cgroupEvidenceDirectory =
  aliasedManifest.cases[0]!.cgroupEvidenceDirectory;
assert.throws(
  () => parseMemoryReleaseGateManifest(
    selfHashedJson(aliasedManifest, "manifestSha256"),
  ),
  /directory alias/,
);
const pathMutationRoot = realpathSync.native(mkdtempSync(
  join(tmpdir(), "cheng-memory-release-path-mutation-"),
));
try {
  const manifestPath = join(pathMutationRoot, "evidence.json");
  const hardlinkPath = join(pathMutationRoot, "evidence-hardlink.json");
  const symlinkPath = join(pathMutationRoot, "evidence-symlink.json");
  writeFileSync(manifestPath, manifestRaw);
  linkSync(manifestPath, hardlinkPath);
  assert.throws(
    () => verifyMemoryReleaseGate(manifestPath),
    /unalias|unaliased/,
  );
  rmSync(hardlinkPath);
  symlinkSync(manifestPath, symlinkPath);
  assert.throws(
    () => verifyMemoryReleaseGate(symlinkPath),
    /canonical absolute path/,
  );
} finally {
  rmSync(pathMutationRoot, {recursive: true});
}

initChengFusionToolRegistryModule();
const registry = getChengFusionToolManifest();
assert.equal(registry.schema, "cheng_fusion_tool_registry");
assert.equal(
  registry.names.filter((name: string) =>
    name === "cheng_memory_release_gate_audit"
  ).length,
  1,
);
const listed = await handleMcpRequest({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/list",
  params: {},
});
const tools = (listed.tools ?? []).filter((tool: any) =>
  tool.name === "cheng_memory_release_gate_audit"
);
assert.equal(tools.length, 1);
assert.equal(tools[0].annotations.readOnlyHint, true);
assert.deepEqual(tools[0].inputSchema.required, ["manifestPath"]);
assert.throws(
  () => runMemoryReleaseGateAudit("relative/evidence.json"),
  /absolute canonical path/,
);
const missingPath = "/does/not/exist/cheng-memory-release/evidence.json";
const missing = await handleMcpRequest({
  jsonrpc: "2.0",
  id: 2,
  method: "tools/call",
  params: {
    name: "cheng_memory_release_gate_audit",
    arguments: {manifestPath: missingPath},
  },
});
assert.equal(missing.isError, true);
assert.match(missing.content[0].text, /ENOENT|no such file/i);
const missingCli = spawnSync(process.execPath, [
  CLI,
  "--manifest",
  missingPath,
], {cwd: dirname(CLI), encoding: "utf8"});
assert.equal(missingCli.status, 1);
assert.equal(missingCli.stdout, "");
assert.match(missingCli.stderr, /^MEMORY_RELEASE_RED:/);

const evidence = process.env.CHENG_FUSION_MEMORY_RELEASE_EVIDENCE;
if (evidence) {
  const manifestPath = realpathSync.native(evidence);
  const verified = verifyMemoryReleaseGate(manifestPath);
  assert.equal(verified.status, "MEMORY_RELEASE_GREEN");
  const audited = runMemoryReleaseGateAudit(manifestPath);
  assert.equal(audited.schema, CHENG_MEMORY_RELEASE_GATE_AUDIT_SCHEMA);
  assert.equal(audited.status, "MEMORY_RELEASE_GREEN");
  assert.equal(audited.manifestSha256, verified.manifestSha256);
  console.log(
    `item32 production memory release gate: PASS manifest=${verified.manifestSha256}`,
  );
} else {
  console.log(
    "item32 memory release validator/mutations/MCP: PASS " +
      "(production Linux cgroup evidence and official drivers pending; release remains RED)",
  );
}
