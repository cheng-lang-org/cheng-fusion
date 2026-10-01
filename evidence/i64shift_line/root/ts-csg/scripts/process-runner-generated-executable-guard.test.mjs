import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildGeneratedExecutableGuardInvocation,
  generatedExecutableProcessTreeLimitBytes,
  validateGeneratedExecutableGuardReceipt,
} from "./process-runner.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const guardPath = join(repoRoot, "tools", "beat_c_process_group_guard.sh");
const oneClickPath = join(repoRoot, "ts-csg", "scripts", "unimaker-one-click.mjs");
const tempRoot = mkdtempSync(join(realpathSync(tmpdir()), "cheng-generated-guard-contract-"));

try {
  const commandPath = join(tempRoot, "generated-app");
  const receiptPath = join(tempRoot, "guard.receipt.txt");
  const stdoutPath = join(tempRoot, "guard.stdout.txt");
  const stderrPath = join(tempRoot, "guard.stderr.txt");
  writeFileSync(commandPath, "#!/bin/sh\nexit 0\n");
  chmodSync(commandPath, 0o500);

  const invocation = buildGeneratedExecutableGuardInvocation(commandPath, ["--exact", "value"], {
    guardPath,
    timeout: 1500,
    maxBuffer: 4096,
    env: {
      LANG: "C",
      LC_ALL: "C",
    },
    receiptPath,
    stdoutPath,
    stderrPath,
  });
  const { authority } = invocation;
  assert.equal(invocation.guardCommand, guardPath);
  assert.deepEqual(invocation.guardArgs.slice(-3), [commandPath, "--exact", "value"]);
  assert(invocation.guardArgs.includes("--snapshot-command"));
  assert(invocation.guardArgs.includes("--require-command-identity"));
  assert(invocation.guardArgs.includes("--target-env-clear"));
  assert(invocation.guardArgs.includes(`--rss-limit:${generatedExecutableProcessTreeLimitBytes}`));
  assert(invocation.guardArgs.includes("--timeout:2"));
  assert(invocation.guardArgs.includes("--target-env:LANG=C"));
  assert(invocation.guardArgs.includes("--target-env:LC_ALL=C"));
  assert.equal(authority.memoryLimitBytes, 1073741824);
  assert.equal(authority.commandSha256, sha256(readFileSync(commandPath)));
  assert.equal(authority.commandArgv.length, 3);

  writeFileSync(stdoutPath, "generated-output\n");
  writeFileSync(stderrPath, "");
  writeFileSync(receiptPath, "");
  chmodSync(stdoutPath, 0o400);
  chmodSync(stderrPath, 0o400);
  const stdoutInfo = statSync(stdoutPath);
  const stderrInfo = statSync(stderrPath);
  const receiptInfo = statSync(receiptPath);
  authority.receiptIdentity = {
    device: String(receiptInfo.dev),
    inode: String(receiptInfo.ino),
  };
  const baseRows = {
    schema: "beat_c_process_memory_guard",
    status: "completed",
    rc: "0",
    abort_reason: "",
    expected_exit_code: "0",
    actual_exit_code: "0",
    exit_code_contract_status: "verified",
    formal_command_identity_status: "required_verified",
    command_execution_mode: "private_single_link_snapshot",
    expected_command_path: authority.commandPath,
    expected_command_sha256: authority.commandSha256,
    command_path: authority.commandPath,
    command_sha256: authority.commandSha256,
    command_execution_snapshot_sha256: authority.commandSha256,
    command_argv_count: String(authority.commandArgv.length),
    command_argv_sha256: authority.commandArgvSha256,
    target_env_mode: "exact",
    target_env_requested_count: String(Object.keys(authority.targetEnv).length),
    target_env_requested_sha256: authority.targetEnvSha256,
    monitor_runtime_script_path: authority.monitorRuntimePath,
    monitor_runtime_script_sha256: authority.monitorRuntimeSha256,
    monitor_runtime_script_invocation_status: "verified_o_nofollow_loader_fd9",
    memory_guard_mode: "process_tree",
    memory_guard_scope: "identity_history_union_group_session_and_descendants",
    memory_limit_bytes: String(authority.memoryLimitBytes),
    memory_enforcement_metric: process.platform === "darwin"
      ? "max_process_tree_resident_and_phys_footprint"
      : "process_tree_resident",
    observed_sample_limit_status: "proved",
    memory_measurement_status: "available",
    root_identity_sampled: "1",
    process_tree_escape_pid: "0",
    hard_memory_limit_proof_status: "not_provable_userspace_poll",
    startup_status: "sampled",
    output_path_history_status: "verified_clean",
    report_path: receiptPath,
    report_device: String(receiptInfo.dev),
    report_inode: String(receiptInfo.ino),
    process_tree_resident_peak_bytes: "4096",
    process_tree_phys_footprint_status: process.platform === "darwin"
      ? "available"
      : "unsupported",
    process_tree_phys_footprint_peak_bytes: process.platform === "darwin" ? "8192" : "0",
    process_tree_enforced_peak_bytes: process.platform === "darwin" ? "8192" : "4096",
    process_tree_enforced_sample_peak_bytes: process.platform === "darwin" ? "8192" : "4096",
    memory_sample_count: "2",
    process_tree_peak_process_count: "1",
    process_tree_identity_history_peak_count: "1",
    stdout_status: "available",
    stdout_path: stdoutPath,
    stdout_sha256: sha256(readFileSync(stdoutPath)),
    stdout_device: String(stdoutInfo.dev),
    stdout_inode: String(stdoutInfo.ino),
    stdout_size: String(stdoutInfo.size),
    stderr_status: "available",
    stderr_path: stderrPath,
    stderr_sha256: sha256(readFileSync(stderrPath)),
    stderr_device: String(stderrInfo.dev),
    stderr_inode: String(stderrInfo.ino),
    stderr_size: String(stderrInfo.size),
  };

  const receipt = validateGeneratedExecutableGuardReceipt(receiptText(baseRows), authority);
  assert.equal(receipt.commandSha256, authority.commandSha256);
  assert.equal(receipt.processTreeEnforcedPeakBytes, process.platform === "darwin" ? 8192 : 4096);
  assert.equal(receipt.hardMemoryLimitProofStatus, "not_provable_userspace_poll");

  const mutations = [
    ["status", "ABORT"],
    ["actual_exit_code", "137"],
    ["formal_command_identity_status", "not_required"],
    ["command_execution_mode", "direct"],
    ["command_sha256", "0".repeat(64)],
    ["command_argv_sha256", "0".repeat(64)],
    ["target_env_requested_sha256", "0".repeat(64)],
    ["monitor_runtime_script_sha256", "0".repeat(64)],
    ["memory_guard_mode", "single_process"],
    ["memory_limit_bytes", "8589934592"],
    ["observed_sample_limit_status", "not_proved"],
    ["hard_memory_limit_proof_status", "proved"],
    ["process_tree_enforced_peak_bytes", "1073741825"],
    ["process_tree_identity_history_peak_count", "0"],
    ["stdout_sha256", "0".repeat(64)],
  ];
  for (const [key, value] of mutations) {
    assert.throws(
      () => validateGeneratedExecutableGuardReceipt(
        receiptText({ ...baseRows, [key]: value }),
        authority,
      ),
      undefined,
      `mutation must be rejected: ${key}`,
    );
  }
  assert.throws(
    () => validateGeneratedExecutableGuardReceipt(
      receiptText(baseRows) + "status=completed\n",
      authority,
    ),
    /duplicated/,
  );

  const oneClickSource = readFileSync(oneClickPath, "utf8");
  assert.equal(oneClickSource.includes("runCommand(sceneGlyphSdfPrecomputeExePath"), false);
  assert.equal(oneClickSource.includes("runCommand(exePath"), false);
  assert.equal(
    [...oneClickSource.matchAll(/runGeneratedExecutable\(/g)].length,
    2,
    "both generated executable launches must use the unique process-tree guard",
  );
  assert(oneClickSource.includes("sceneGlyphSdfPrecomputeGuardReceiptPath"));
  assert(oneClickSource.includes("runProcessTreeGuard: runGuardReceipt"));

  process.stdout.write(
    `generated_executable_guard_contract=PASS mutations_rejected=${mutations.length + 1}\n`,
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function receiptText(rows) {
  return Object.entries(rows).map(([key, value]) => `${key}=${value}\n`).join("");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
