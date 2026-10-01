#!/usr/bin/env bun
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {
  CHENG_CURRENT_PARSER_RECEIPT_INGRESS_SCHEMA,
  CHENG_CURRENT_PARSER_RECEIPT_PRODUCTION_COUNT,
  CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT,
  admitCurrentParserReceipts,
  serializeCurrentParserReceiptIngressReport,
  validateCurrentParserReceiptIngressReport,
  validateCurrentParserReceiptIngressTopology,
  validateFrozenCurrentSourceSnapshotClosure,
  validateOfficialCurrentBuildBindingClosure,
  type CurrentParserReceiptIngressReport,
} from "../src/cheng_current_parser_receipt_ingress.ts";
import {parseUniqueCurrentJson} from "../src/current_schema_json.ts";

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function frame32(bytes: Buffer): Buffer {
  const prefix = Buffer.allocUnsafe(4);
  prefix.writeUInt32BE(bytes.length);
  return Buffer.concat([prefix, bytes]);
}

function frame64(value: number): Buffer {
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fshex(path: string): string {
  return Buffer.from(path, "utf8").toString("hex");
}

const COLD_SCRATCH_STDOUT =
  "cold_codegen_scratch_static_mutations_rejected=16\n" +
  "cold_codegen_scratch_lifetime_gate_status=PASS\n" +
  "cold_codegen_scratch_begin_count=4\n" +
  "cold_codegen_scratch_release_count=4\n" +
  "cold_codegen_scratch_failure_release_count=3\n" +
  "cold_codegen_scratch_live_count=0\n" +
  "cold_codegen_scratch_signal_recovery=PROVED\n" +
  "cold_codegen_scratch_carrier_restore=PROVED\n" +
  "cold_codegen_scratch_release_internal_failure=HARD_FAIL\n" +
  "cold_codegen_scratch_lifetime_gate_status=PASS\n";
const COLD_SCRATCH_STDERR =
  "cheng_cold: focused codegen scratch failure (recovery=1 depth=1)\n" +
  "cheng_cold: codegen scratch release failed with live owner\n";

function scratchFrame(bytes: Buffer): Buffer {
  const size = Buffer.allocUnsafe(4);
  size.writeUInt32BE(bytes.length);
  return Buffer.concat([size, bytes]);
}

function scratchArgvSha256(values: readonly string[]): string {
  const count = Buffer.allocUnsafe(4);
  count.writeUInt32BE(values.length);
  return sha256(Buffer.concat([
    scratchFrame(Buffer.from("cheng.guard.command_argv")),
    count,
    ...values.map((value) => scratchFrame(Buffer.from(value))),
  ]));
}

function scratchEnvSha256(values: ReadonlyMap<string, string>): string {
  const keys = [...values.keys()].sort((left, right) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
  const count = Buffer.allocUnsafe(4);
  count.writeUInt32BE(keys.length);
  return sha256(Buffer.concat([
    scratchFrame(Buffer.from("cheng.guard.target_env")),
    count,
    ...keys.flatMap((key) => [
      scratchFrame(Buffer.from(key)),
      scratchFrame(Buffer.from(values.get(key) ?? "")),
    ]),
  ]));
}

function physicalRows(prefix: string, path: string): string[] {
  const bytes = readFileSync(path);
  const stat = lstatSync(path, {bigint: true});
  return [
    `${prefix}path_fshex=${fshex(path)}`,
    `${prefix}sha256=${sha256(bytes)}`,
    `${prefix}device=${stat.dev}`,
    `${prefix}inode=${stat.ino}`,
    `${prefix}mode=${stat.mode.toString(8)}`,
    `${prefix}nlink=${stat.nlink}`,
    `${prefix}uid=${stat.uid}`,
    `${prefix}gid=${stat.gid}`,
    `${prefix}size=${stat.size}`,
    `${prefix}mtime_ns=${stat.mtimeNs}`,
    `${prefix}ctime_ns=${stat.ctimeNs}`,
  ];
}

function writeScratchExecutionManifests(
  argvPath: string,
  envPath: string,
  executionPath: string,
  argv: readonly string[],
  env: ReadonlyMap<string, string>,
  commandPath: string,
  monitorRuntimePath: string,
  monitorPythonPath: string,
  outputs: readonly [string, string][],
): void {
  const argvRows = [
    "schema=cheng.guard.argv_manifest",
    `count=${argv.length}`,
    `sha256=${scratchArgvSha256(argv)}`,
    ...argv.map((value, index) =>
      `arg.${index}.fshex=${Buffer.from(value, "utf8").toString("hex")}`),
  ];
  writeFileSync(argvPath, `${argvRows.join("\n")}\n`, {mode: 0o400});

  const envKeys = [...env.keys()].sort((left, right) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
  const envRows = [
    "schema=cheng.guard.env_manifest",
    `count=${envKeys.length}`,
    `sha256=${scratchEnvSha256(env)}`,
  ];
  for (let index = 0; index < envKeys.length; index += 1) {
    const key = envKeys[index]!;
    envRows.push(
      `entry.${index}.key_fshex=${Buffer.from(key, "utf8").toString("hex")}`,
      `entry.${index}.value_fshex=${
        Buffer.from(env.get(key)!, "utf8").toString("hex")
      }`,
    );
  }
  writeFileSync(envPath, `${envRows.join("\n")}\n`, {mode: 0o400});

  const executionRows = ["schema=cheng.guard.execution_manifest"];
  for (const [role, path] of [
    ["command", commandPath],
    ["monitor_runtime", monitorRuntimePath],
    ["monitor_python", monitorPythonPath],
  ] as const) {
    executionRows.push(...physicalRows(`input.${role}.`, path));
  }
  executionRows.push(`output_count=${outputs.length}`);
  const uid = process.geteuid?.() ?? -1;
  const gid = process.getegid?.() ?? -1;
  for (let index = 0; index < outputs.length; index += 1) {
    const [role, path] = outputs[index]!;
    const prefix = `output.${index}.`;
    executionRows.push(
      `${prefix}role=${role}`,
      `${prefix}path_fshex=${fshex(path)}`,
      `${prefix}expected_kind=regular`,
      `${prefix}expected_mode=100400`,
      `${prefix}expected_nlink=1`,
      `${prefix}expected_uid=${uid}`,
      `${prefix}expected_gid=${gid}`,
      `${prefix}pre_run_status=absent`,
    );
  }
  const executionPayload = Buffer.from(
    `${executionRows.join("\n")}\n`,
    "utf8",
  );
  executionRows.push(
    `manifest_payload_sha256=${sha256(executionPayload)}`,
  );
  writeFileSync(
    executionPath,
    `${executionRows.join("\n")}\n`,
    {mode: 0o400},
  );
}

function frame64Bytes(bytes: Buffer): Buffer {
  const size = Buffer.allocUnsafe(8);
  size.writeBigUInt64BE(BigInt(bytes.length));
  return Buffer.concat([size, bytes]);
}

function count64(value: number): Buffer {
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes;
}

interface CurrentSourceFixtureRow {
  readonly relativePath: string;
  readonly relativeBytes: Buffer;
  readonly sha256: string;
  readonly mode: bigint;
  readonly size: number;
  readonly rawRow: string;
}

function currentSourceFixtureContentCid(
  head: string,
  scopes: readonly string[],
  rows: readonly CurrentSourceFixtureRow[],
): string {
  const parts = [
    frame64Bytes(Buffer.from("cheng.current_source_closure.content.cid")),
    frame64Bytes(Buffer.from(head)),
    count64(scopes.length),
    ...scopes.map((scope) => frame64Bytes(Buffer.from(scope))),
    count64(rows.length),
  ];
  for (const row of rows) {
    parts.push(
      frame64Bytes(row.relativeBytes),
      frame64Bytes(Buffer.from("tracked")),
      Buffer.from(row.sha256, "hex"),
      Buffer.from([(row.mode & 0o111n) === 0n ? 0 : 1]),
      count64(row.size),
    );
  }
  return sha256(Buffer.concat(parts));
}

function materializeCurrentSourceSnapshot(
  workspaceRoot: string,
  snapshotRoot: string,
  manifestPath: string,
  relativePaths: readonly string[],
): Buffer {
  const rows = [...relativePaths]
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left), Buffer.from(right)))
    .map((relativePath): CurrentSourceFixtureRow => {
      const sourcePath = join(workspaceRoot, relativePath);
      const bytes = readFileSync(sourcePath);
      const stat = lstatSync(sourcePath, {bigint: true});
      const relativeBytes = Buffer.from(relativePath);
      return {
        relativePath,
        relativeBytes,
        sha256: sha256(bytes),
        mode: stat.mode,
        size: bytes.length,
        rawRow: [
          relativeBytes.toString("hex"),
          "tracked",
          sha256(bytes),
          String(stat.dev),
          String(stat.ino),
          String(stat.mode),
          String(stat.size),
          String(stat.mtimeNs),
          String(stat.ctimeNs),
        ].join("\t"),
      };
    });
  const scopes = ["bootstrap", "tools"];
  const head = "0".repeat(40);
  const manifest = Buffer.from([
    "schema=cheng.current_source_closure_manifest",
    `head=${head}`,
    `scope_count=${scopes.length}`,
    ...scopes.map((scope) => `scope=${Buffer.from(scope).toString("hex")}`),
    `path_count=${rows.length}`,
    `content_cid=${currentSourceFixtureContentCid(head, scopes, rows)}`,
    ...rows.map((row) => row.rawRow),
    "",
  ].join("\n"));
  writeFileSync(manifestPath, manifest, {mode: 0o400});
  mkdirSync(snapshotRoot, {recursive: true});
  for (const row of rows) {
    const destination = join(snapshotRoot, row.relativePath);
    mkdirSync(dirname(destination), {recursive: true});
    copyFileSync(join(workspaceRoot, row.relativePath), destination);
    chmodSync(destination, (row.mode & 0o111n) === 0n ? 0o400 : 0o500);
  }
  const directories: string[] = [];
  const visit = (directory: string): void => {
    directories.push(directory);
    for (const name of readdirSync(directory)) {
      const child = join(directory, name);
      if (lstatSync(child).isDirectory()) {
        visit(child);
      }
    }
  };
  visit(snapshotRoot);
  directories.sort((left, right) => right.length - left.length);
  for (const directory of directories) {
    chmodSync(directory, 0o500);
  }
  return manifest;
}

function removeFixtureTree(root: string): void {
  const makeWritable = (path: string): void => {
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return;
    chmodSync(path, 0o700);
    for (const name of readdirSync(path)) {
      makeWritable(join(path, name));
    }
  };
  makeWritable(root);
  rmSync(root, {recursive: true, force: true});
}

function renderKv(rows: readonly string[]): Buffer {
  const payload = Buffer.from(`${rows.join("\n")}\n`, "utf8");
  return Buffer.concat([
    payload,
    Buffer.from(`receipt_payload_sha256=${sha256(payload)}\n`, "utf8"),
  ]);
}

function writeHashedKv(path: string, rows: readonly string[]): void {
  writeFileSync(path, renderKv(rows), {mode: 0o400});
}

function rewriteHashedKv(
  path: string,
  mutate: (rows: string[]) => void,
): void {
  const rows = readFileSync(path, "utf8").trimEnd().split("\n");
  assert.match(rows.pop() ?? "", /^receipt_payload_sha256=/);
  mutate(rows);
  chmodSync(path, 0o600);
  writeHashedKv(path, rows);
  chmodSync(path, 0o400);
}

interface OfficialBindingFixture {
  readonly root: string;
  readonly bindingPath: string;
  readonly officialDriverPath: string;
  readonly officialBuildReceiptPath: string;
  readonly coldScratchReceiptPath: string;
  readonly coldScratchGuardReportPath: string;
  readonly coldScratchStdoutPath: string;
  readonly coldScratchArgvManifestPath: string;
  readonly coldScratchEnvManifestPath: string;
  readonly coldScratchExecutionManifestPath: string;
  readonly coldScratchExecutionEvidencePath: string;
  readonly coldScratchSnapshotRoot: string;
  readonly officialSourceBeforePath: string;
  readonly officialSourceAfterPath: string;
  readonly installReceiptPath: string;
  readonly compilerReceiptPath: string;
  readonly privateManifestPath: string;
}

function buildOfficialBindingFixture(root: string): OfficialBindingFixture {
  const workspaceRoot = join(root, "workspace");
  const officialRoot = join(workspaceRoot, "artifacts/backend_driver");
  const transactionRoot = join(root, "transaction");
  const compilerRoot = join(transactionRoot, "compiler-candidate-evidence");
  const compilerSnapshotRoot = join(compilerRoot, "source-snapshot");
  const scratchSnapshotRoot = join(transactionRoot, "source-snapshot");
  const coldScratchRoot = join(transactionRoot, "cold-scratch-execution");
  mkdirSync(officialRoot, {recursive: true});
  mkdirSync(compilerSnapshotRoot, {recursive: true});
  mkdirSync(coldScratchRoot, {recursive: true});

  const officialDriverPath = join(officialRoot, "cheng");
  const officialBuildReceiptPath = join(
    officialRoot,
    "cheng.current-build-receipt.kv",
  );
  const officialSourceBefore = join(transactionRoot, "source-closure.before");
  const officialSourceAfter = join(transactionRoot, "source-closure.after");
  const installReceiptPath = join(transactionRoot, "install-receipt.kv");
  const publisherReceiptPath = join(
    transactionRoot,
    "official/publisher-receipt.kv",
  );
  const compilerCandidatePath = join(compilerRoot, "cheng.compiler-main");
  const compilerReceiptPath = join(
    compilerRoot,
    "cheng.compiler-main.build-receipt.txt",
  );
  const privateManifestPath = join(
    compilerRoot,
    "cheng-source-snapshot.manifest.txt",
  );
  const bindingPath = join(transactionRoot, "current-official-binding.kv");
  const processGuardPath = join(
    workspaceRoot,
    "tools/beat_c_process_group_guard.sh",
  );
  const monitorRuntimePath = join(
    workspaceRoot,
    "tools/beat_c_process_group_guard_runtime.py",
  );
  const commandPath = join(
    workspaceRoot,
    "tools/cold_codegen_scratch_lifetime_gate.sh",
  );
  const scratchHarnessSourcePath = join(
    workspaceRoot,
    "tools/cold_codegen_scratch_lifetime_gate.c",
  );
  const coldSourcePath = join(workspaceRoot, "bootstrap/cheng_cold.c");
  const monitorPythonPath = join(root, "monitor/bin/python3");
  const coldScratchReceiptPath = join(coldScratchRoot, "receipt.kv");
  const coldScratchGuardReportPath = join(
    coldScratchRoot,
    "guard-report.kv",
  );
  const coldScratchStdoutPath = join(coldScratchRoot, "stdout.txt");
  const coldScratchStderrPath = join(coldScratchRoot, "stderr.txt");
  const coldScratchResourcePath = join(
    coldScratchRoot,
    "resource-trace.tsv",
  );
  const coldScratchArgvManifestPath = join(
    coldScratchRoot,
    "argv-manifest.kv",
  );
  const coldScratchEnvManifestPath = join(
    coldScratchRoot,
    "env-manifest.kv",
  );
  const coldScratchExecutionManifestPath = join(
    coldScratchRoot,
    "execution-manifest.kv",
  );
  const coldScratchExecutionEvidencePath = join(
    workspaceRoot,
    "tools/backend2_current_source_official_evidence",
  );
  mkdirSync(dirname(publisherReceiptPath), {recursive: true});
  mkdirSync(dirname(processGuardPath), {recursive: true});
  mkdirSync(dirname(coldSourcePath), {recursive: true});
  mkdirSync(dirname(monitorPythonPath), {recursive: true});

  writeFileSync(officialDriverPath, "official-driver\n", {mode: 0o500});
  writeFileSync(processGuardPath, "#!/bin/sh\nexit 0\n", {mode: 0o500});
  writeFileSync(monitorRuntimePath, "raise SystemExit(0)\n", {mode: 0o400});
  writeFileSync(
    coldScratchExecutionEvidencePath,
    "#!/bin/sh\nexit 0\n",
    {mode: 0o500},
  );
  writeFileSync(commandPath, "#!/bin/sh\nexit 0\n", {mode: 0o500});
  writeFileSync(scratchHarnessSourcePath, "int main(void){return 0;}\n", {
    mode: 0o400,
  });
  writeFileSync(coldSourcePath, "int cheng_cold_fixture;\n", {mode: 0o400});
  writeFileSync(monitorPythonPath, "#!/bin/sh\nexit 0\n", {mode: 0o500});
  const sourceManifest = materializeCurrentSourceSnapshot(
    workspaceRoot,
    scratchSnapshotRoot,
    officialSourceBefore,
    [
      "bootstrap/cheng_cold.c",
      "tools/beat_c_process_group_guard.sh",
      "tools/beat_c_process_group_guard_runtime.py",
      "tools/cold_codegen_scratch_lifetime_gate.c",
      "tools/cold_codegen_scratch_lifetime_gate.sh",
    ],
  );
  copyFileSync(officialSourceBefore, officialSourceAfter);
  chmodSync(officialSourceAfter, 0o400);
  writeFileSync(publisherReceiptPath, "publisher\n", {mode: 0o400});
  writeFileSync(compilerCandidatePath, "compiler-candidate\n", {mode: 0o500});
  writeFileSync(privateManifestPath, "private-source-manifest\n", {mode: 0o400});
  writeHashedKv(compilerReceiptPath, [
    `private_source_snapshot_root=${compilerSnapshotRoot}`,
    `private_source_snapshot_manifest_path=${privateManifestPath}`,
    `private_source_snapshot_manifest_sha256=${
      sha256("private-source-manifest\n")
    }`,
  ]);

  writeFileSync(coldScratchStdoutPath, COLD_SCRATCH_STDOUT, {mode: 0o400});
  writeFileSync(coldScratchStderrPath, COLD_SCRATCH_STDERR, {mode: 0o400});
  writeFileSync(coldScratchResourcePath, "0\t1\t1\n", {mode: 0o400});
  writeFileSync(coldScratchGuardReportPath, "", {mode: 0o600});
  const commandSha256 = sha256(readFileSync(commandPath));
  const expectedArgvSha256 = scratchArgvSha256([
    commandPath,
    "--root",
    scratchSnapshotRoot,
  ]);
  const expectedEnv = new Map([
    ["HOME", "/var/empty"],
    ["LANG", "C"],
    ["LC_ALL", "C"],
    ["PATH", `${dirname(monitorPythonPath)}:/usr/bin:/bin`],
    ["TMPDIR", "/private/var/tmp"],
  ]);
  const expectedEnvSha256 = scratchEnvSha256(expectedEnv);
  writeScratchExecutionManifests(
    coldScratchArgvManifestPath,
    coldScratchEnvManifestPath,
    coldScratchExecutionManifestPath,
    [commandPath, "--root", scratchSnapshotRoot],
    expectedEnv,
    commandPath,
    monitorRuntimePath,
    monitorPythonPath,
    [
      ["report", coldScratchGuardReportPath],
      ["stdout", coldScratchStdoutPath],
      ["stderr", coldScratchStderrPath],
      ["resource_trace", coldScratchResourcePath],
    ],
  );
  const stdoutStat = lstatSync(coldScratchStdoutPath, {bigint: true});
  const stderrStat = lstatSync(coldScratchStderrPath, {bigint: true});
  const resourceStat = lstatSync(coldScratchResourcePath, {bigint: true});
  const reportStat = lstatSync(coldScratchGuardReportPath, {bigint: true});
  const guardRows = [
    "schema=beat_c_process_memory_guard",
    "status=completed",
    "rc=0",
    "abort_reason=",
    "expected_exit_code=0",
    "actual_exit_code=0",
    "exit_code_contract_status=verified",
    "memory_guard_mode=process_tree",
    "memory_limit_bytes=1073741824",
    "memory_measurement_status=available",
    "process_tree_enforced_peak_bytes=1048576",
    "process_tree_escape_pid=0",
    "combined_output_limit_status=within_limit",
    "combined_output_failure_class=",
    "tracked_output_count=0",
    "formal_command_identity_status=required_verified",
    "command_identity_status=available",
    `command_path=${commandPath}`,
    `command_sha256=${commandSha256}`,
    "command_execution_mode=private_single_link_snapshot",
    `command_execution_snapshot_sha256=${commandSha256}`,
    "command_argv_count=3",
    `command_argv_sha256=${expectedArgvSha256}`,
    "target_env_mode=exact",
    "target_env_requested_count=5",
    `target_env_requested_sha256=${expectedEnvSha256}`,
    `monitor_python_path=${monitorPythonPath}`,
    `monitor_python_sha256=${sha256(readFileSync(monitorPythonPath))}`,
    `monitor_runtime_script_path=${monitorRuntimePath}`,
    `monitor_runtime_script_sha256=${sha256(readFileSync(monitorRuntimePath))}`,
    "monitor_runtime_script_invocation_status=verified_o_nofollow_loader_fd9",
    "monitor_runtime_script_expected_sha_match=1",
    "output_path_history_status=verified_clean",
    `report_path=${coldScratchGuardReportPath}`,
    `report_device=${reportStat.dev}`,
    `report_inode=${reportStat.ino}`,
    "stdout_status=available",
    `stdout_path=${coldScratchStdoutPath}`,
    `stdout_sha256=${sha256(COLD_SCRATCH_STDOUT)}`,
    `stdout_size=${Buffer.byteLength(COLD_SCRATCH_STDOUT)}`,
    `stdout_device=${stdoutStat.dev}`,
    `stdout_inode=${stdoutStat.ino}`,
    "stderr_status=available",
    `stderr_path=${coldScratchStderrPath}`,
    `stderr_sha256=${sha256(COLD_SCRATCH_STDERR)}`,
    `stderr_size=${Buffer.byteLength(COLD_SCRATCH_STDERR)}`,
    `stderr_device=${stderrStat.dev}`,
    `stderr_inode=${stderrStat.ino}`,
    "resource_trace_status=available",
    `resource_trace_path=${coldScratchResourcePath}`,
    `resource_trace_sha256=${sha256("0\t1\t1\n")}`,
    `resource_trace_size=${Buffer.byteLength("0\t1\t1\n")}`,
    `resource_trace_device=${resourceStat.dev}`,
    `resource_trace_inode=${resourceStat.ino}`,
  ];
  writeFileSync(
    coldScratchGuardReportPath,
    `${guardRows.join("\n")}\n`,
  );
  chmodSync(coldScratchGuardReportPath, 0o400);
  writeHashedKv(coldScratchReceiptPath, [
    "schema=cheng.backend2.current_source_cold_scratch_execution_receipt",
    "status=PASS",
    ...physicalRows("guard_report_", coldScratchGuardReportPath),
    ...physicalRows("stdout_", coldScratchStdoutPath),
    ...physicalRows("stderr_", coldScratchStderrPath),
    ...physicalRows("resource_trace_", coldScratchResourcePath),
    ...physicalRows("argv_manifest_", coldScratchArgvManifestPath),
    ...physicalRows("env_manifest_", coldScratchEnvManifestPath),
    ...physicalRows("execution_manifest_", coldScratchExecutionManifestPath),
    ...physicalRows("execution_evidence_", coldScratchExecutionEvidencePath),
    `process_guard_path_fshex=${fshex(processGuardPath)}`,
    `process_guard_sha256=${sha256(readFileSync(processGuardPath))}`,
    `monitor_runtime_path_fshex=${fshex(monitorRuntimePath)}`,
    `monitor_runtime_sha256=${sha256(readFileSync(monitorRuntimePath))}`,
    `monitor_python_path_fshex=${fshex(monitorPythonPath)}`,
    `monitor_python_sha256=${sha256(readFileSync(monitorPythonPath))}`,
    `command_path_fshex=${fshex(commandPath)}`,
    `command_sha256=${commandSha256}`,
    `source_snapshot_root_fshex=${fshex(scratchSnapshotRoot)}`,
    `source_manifest_path_fshex=${fshex(officialSourceBefore)}`,
    `source_manifest_sha256=${sha256(sourceManifest)}`,
    `scratch_gate_path_fshex=${fshex(
      join(
        scratchSnapshotRoot,
        "tools/cold_codegen_scratch_lifetime_gate.sh",
      ),
    )}`,
    `scratch_gate_sha256=${commandSha256}`,
    `scratch_harness_path_fshex=${fshex(
      join(
        scratchSnapshotRoot,
        "tools/cold_codegen_scratch_lifetime_gate.c",
      ),
    )}`,
    `scratch_harness_sha256=${sha256(
      readFileSync(scratchHarnessSourcePath),
    )}`,
    `cold_source_path_fshex=${fshex(
      join(scratchSnapshotRoot, "bootstrap/cheng_cold.c"),
    )}`,
    `cold_source_sha256=${sha256(readFileSync(coldSourcePath))}`,
    `command_argv_sha256=${expectedArgvSha256}`,
    `target_env_requested_sha256=${expectedEnvSha256}`,
    "memory_limit_bytes=1073741824",
    "formal_command_identity_status=required_verified",
  ]);

  const driverStat = lstatSync(officialDriverPath, {bigint: true});
  writeHashedKv(installReceiptPath, [
    "schema=cheng.backend2.current_source_official_install_receipt",
    "status=PASS",
    "driver_role=production",
    `source_manifest_path_fshex=${fshex(officialSourceBefore)}`,
    `source_manifest_sha256=${sha256(sourceManifest)}`,
    `compiler_candidate_path_fshex=${fshex(compilerCandidatePath)}`,
    `compiler_candidate_sha256=${sha256("compiler-candidate\n")}`,
    `compiler_build_receipt_path_fshex=${fshex(compilerReceiptPath)}`,
    `compiler_build_receipt_sha256=${sha256(
      readFileSync(compilerReceiptPath),
    )}`,
    `bootstrap_summary_sha256=${sha256("summary")}`,
    `bootstrap_fixed_point_sha256=${sha256("fixed")}`,
    `bootstrap_gen2_sha256=${sha256("gen2")}`,
    `bootstrap_gen3_sha256=${sha256("gen3")}`,
    "previous_official_present=false",
    "previous_official_sha256=",
    "previous_official_device=0",
    "previous_official_inode=0",
    `official_path_fshex=${fshex(officialDriverPath)}`,
    `official_sha256=${sha256("official-driver\n")}`,
    `official_device=${driverStat.dev}`,
    `official_inode=${driverStat.ino}`,
    `official_size=${driverStat.size}`,
  ]);
  writeHashedKv(officialBuildReceiptPath, [
    "schema=cheng.backend2.current_source_official_build_receipt",
    "status=PASS",
    "driver_role=production",
    `source_manifest_sha256=${sha256(sourceManifest)}`,
    `source_manifest_before_path_fshex=${fshex(officialSourceBefore)}`,
    `source_manifest_after_path_fshex=${fshex(officialSourceAfter)}`,
    `official_sha256=${sha256("official-driver\n")}`,
    `cold_scratch_execution_receipt_path_fshex=${fshex(
      coldScratchReceiptPath,
    )}`,
    `cold_scratch_execution_receipt_sha256=${sha256(
      readFileSync(coldScratchReceiptPath),
    )}`,
    `install_receipt_path_fshex=${fshex(installReceiptPath)}`,
    `install_receipt_sha256=${sha256(readFileSync(installReceiptPath))}`,
    `publisher_receipt_path_fshex=${fshex(publisherReceiptPath)}`,
    `publisher_receipt_sha256=${sha256(readFileSync(publisherReceiptPath))}`,
    "source_postflight_status=stable",
    "raw_bytes_fixed_point=true",
  ]);
  writeHashedKv(bindingPath, [
    "schema=cheng.backend2.current_source_official_binding",
    "status=PASS",
    "driver_role=production",
    `official_build_receipt_path_fshex=${fshex(officialBuildReceiptPath)}`,
    `official_build_receipt_sha256=${
      sha256(readFileSync(officialBuildReceiptPath))
    }`,
    `official_source_manifest_path_fshex=${fshex(officialSourceBefore)}`,
    `official_source_manifest_sha256=${sha256(sourceManifest)}`,
    `compiler_private_source_manifest_path_fshex=${fshex(
      privateManifestPath,
    )}`,
    `compiler_private_source_manifest_sha256=${
      sha256("private-source-manifest\n")
    }`,
    `official_driver_path_fshex=${fshex(officialDriverPath)}`,
    `official_driver_sha256=${sha256("official-driver\n")}`,
    `final_receipt_source_manifest_sha256=${
      sha256(sourceManifest)
    }`,
  ]);
  return {
    root,
    bindingPath,
    officialDriverPath,
    officialBuildReceiptPath,
    coldScratchReceiptPath,
    coldScratchGuardReportPath,
    coldScratchStdoutPath,
    coldScratchArgvManifestPath,
    coldScratchEnvManifestPath,
    coldScratchExecutionManifestPath,
    coldScratchExecutionEvidencePath,
    coldScratchSnapshotRoot: scratchSnapshotRoot,
    officialSourceBeforePath: officialSourceBefore,
    officialSourceAfterPath: officialSourceAfter,
    installReceiptPath,
    compilerReceiptPath,
    privateManifestPath,
  };
}

function rebindFixtureChain(fixture: OfficialBindingFixture): void {
  rewriteHashedKv(fixture.installReceiptPath, (rows) => {
    const index = rows.findIndex((row) =>
      row.startsWith("compiler_build_receipt_sha256="));
    rows[index] =
      `compiler_build_receipt_sha256=${sha256(
        readFileSync(fixture.compilerReceiptPath),
      )}`;
  });
  rewriteHashedKv(fixture.officialBuildReceiptPath, (rows) => {
    const index = rows.findIndex((row) =>
      row.startsWith("install_receipt_sha256="));
    rows[index] =
      `install_receipt_sha256=${sha256(
        readFileSync(fixture.installReceiptPath),
      )}`;
  });
  rewriteHashedKv(fixture.bindingPath, (rows) => {
    const index = rows.findIndex((row) =>
      row.startsWith("official_build_receipt_sha256="));
    rows[index] =
      `official_build_receipt_sha256=${sha256(
        readFileSync(fixture.officialBuildReceiptPath),
      )}`;
  });
}

function rebindOfficialBuildIntoBinding(
  fixture: OfficialBindingFixture,
): void {
  rewriteHashedKv(fixture.bindingPath, (rows) => {
    const index = rows.findIndex((row) =>
      row.startsWith("official_build_receipt_sha256="));
    rows[index] =
      `official_build_receipt_sha256=${sha256(
        readFileSync(fixture.officialBuildReceiptPath),
      )}`;
  });
}

function rebindScratchReceiptIntoOfficial(
  fixture: OfficialBindingFixture,
): void {
  rewriteHashedKv(fixture.officialBuildReceiptPath, (rows) => {
    const index = rows.findIndex((row) =>
      row.startsWith("cold_scratch_execution_receipt_sha256="));
    rows[index] =
      `cold_scratch_execution_receipt_sha256=${sha256(
        readFileSync(fixture.coldScratchReceiptPath),
      )}`;
  });
  rebindOfficialBuildIntoBinding(fixture);
}

function rewritePlainKv(
  path: string,
  mutate: (rows: string[]) => void,
): void {
  const rows = readFileSync(path, "utf8").trimEnd().split("\n");
  mutate(rows);
  chmodSync(path, 0o600);
  writeFileSync(path, `${rows.join("\n")}\n`);
  chmodSync(path, 0o400);
}

function rewriteExecutionManifest(
  path: string,
  mutate: (rows: string[]) => void,
): void {
  const rows = readFileSync(path, "utf8").trimEnd().split("\n");
  assert.match(rows.pop() ?? "", /^manifest_payload_sha256=/);
  mutate(rows);
  const payload = Buffer.from(`${rows.join("\n")}\n`, "utf8");
  rows.push(`manifest_payload_sha256=${sha256(payload)}`);
  chmodSync(path, 0o600);
  writeFileSync(path, `${rows.join("\n")}\n`);
  chmodSync(path, 0o400);
}

function rebindGuardIntoScratchReceipt(
  fixture: OfficialBindingFixture,
): void {
  rebindBoundFileIntoScratchReceipt(
    fixture,
    "guard_report",
    fixture.coldScratchGuardReportPath,
  );
}

function rebindBoundFileIntoScratchReceipt(
  fixture: OfficialBindingFixture,
  role: string,
  path: string,
): void {
  const replacements = new Map(
    physicalRows(`${role}_`, path).map((row) => {
      const separator = row.indexOf("=");
      return [row.slice(0, separator), row] as const;
    }),
  );
  rewriteHashedKv(fixture.coldScratchReceiptPath, (rows) => {
    for (let index = 0; index < rows.length; index += 1) {
      const separator = rows[index]!.indexOf("=");
      const replacement = replacements.get(
        rows[index]!.slice(0, separator),
      );
      if (replacement !== undefined) {
        rows[index] = replacement;
      }
    }
  });
  rebindScratchReceiptIntoOfficial(fixture);
}

function mutateScratchReceiptField(
  fixture: OfficialBindingFixture,
  key: string,
  value: string,
): void {
  rewriteHashedKv(fixture.coldScratchReceiptPath, (rows) => {
    const index = rows.findIndex((row) => row.startsWith(`${key}=`));
    assert.notEqual(index, -1, key);
    rows[index] = `${key}=${value}`;
  });
  rebindScratchReceiptIntoOfficial(fixture);
}

function rebindSourceManifestChain(
  fixture: OfficialBindingFixture,
): void {
  const manifestSha256 = sha256(
    readFileSync(fixture.officialSourceBeforePath),
  );
  rewriteHashedKv(fixture.coldScratchReceiptPath, (rows) => {
    const index = rows.findIndex((row) =>
      row.startsWith("source_manifest_sha256="));
    rows[index] = `source_manifest_sha256=${manifestSha256}`;
  });
  rewriteHashedKv(fixture.installReceiptPath, (rows) => {
    const index = rows.findIndex((row) =>
      row.startsWith("source_manifest_sha256="));
    rows[index] = `source_manifest_sha256=${manifestSha256}`;
  });
  rewriteHashedKv(fixture.officialBuildReceiptPath, (rows) => {
    const sourceIndex = rows.findIndex((row) =>
      row.startsWith("source_manifest_sha256="));
    rows[sourceIndex] = `source_manifest_sha256=${manifestSha256}`;
    const scratchIndex = rows.findIndex((row) =>
      row.startsWith("cold_scratch_execution_receipt_sha256="));
    rows[scratchIndex] =
      `cold_scratch_execution_receipt_sha256=${sha256(
        readFileSync(fixture.coldScratchReceiptPath),
      )}`;
    const installIndex = rows.findIndex((row) =>
      row.startsWith("install_receipt_sha256="));
    rows[installIndex] =
      `install_receipt_sha256=${sha256(
        readFileSync(fixture.installReceiptPath),
      )}`;
  });
  rewriteHashedKv(fixture.bindingPath, (rows) => {
    for (const key of [
      "official_source_manifest_sha256",
      "final_receipt_source_manifest_sha256",
    ]) {
      const index = rows.findIndex((row) => row.startsWith(`${key}=`));
      rows[index] = `${key}=${manifestSha256}`;
    }
    const buildIndex = rows.findIndex((row) =>
      row.startsWith("official_build_receipt_sha256="));
    rows[buildIndex] =
      `official_build_receipt_sha256=${sha256(
        readFileSync(fixture.officialBuildReceiptPath),
      )}`;
  });
}

const digest = sha256("official-driver");
const sources = [
  {
    path: "/current-generation/a.cheng",
    sha256: sha256("a"),
    byteLength: 1,
  },
  {
    path: "/current-generation/b.cheng",
    sha256: sha256("b"),
    byteLength: 1,
  },
] as const;
const topology = {
  drivers: [
    {
      role: "receipt_driver_a",
      path: "/receipts/receipt_driver_a/cheng",
      sha256: digest,
      byteLength: 16,
    },
    {
      role: "receipt_driver_b",
      path: "/receipts/receipt_driver_b/cheng",
      sha256: digest,
      byteLength: 16,
    },
  ],
  sources,
  receipts: sources.flatMap((source) => [
    {
      path: `/receipts/${source.path.slice(1).replaceAll("/", "_")}.a.json`,
      sourcePath: source.path,
      driverRole: "receipt_driver_a",
      driverSha256: digest,
    },
    {
      path: `/receipts/${source.path.slice(1).replaceAll("/", "_")}.b.json`,
      sourcePath: source.path,
      driverRole: "receipt_driver_b",
      driverSha256: digest,
    },
  ]),
};

{
  const deleted = clone(topology);
  deleted.receipts.pop();
  assert.throws(
    () => validateCurrentParserReceiptIngressTopology(
      deleted,
      sources,
      {sha256: digest, byteLength: 16},
    ),
    /receipt_set_incomplete/,
  );

  const swapped = clone(topology);
  [swapped.receipts[1], swapped.receipts[2]] =
    [swapped.receipts[2]!, swapped.receipts[1]!];
  assert.throws(
    () => validateCurrentParserReceiptIngressTopology(
      swapped,
      sources,
      {sha256: digest, byteLength: 16},
    ),
    /receipt_source_driver_swap/,
  );

  const oldGeneration = {
    ...clone(topology),
    sources: clone(topology.sources).map((source, index) => ({
      ...source,
      path: index === 0 ? "/old-generation/a.cheng" : source.path,
    })),
  };
  assert.throws(
    () => validateCurrentParserReceiptIngressTopology(
      oldGeneration,
      sources,
      {sha256: digest, byteLength: 16},
    ),
    /source_generation_invalid/,
  );

  const driverDrift = clone(topology);
  driverDrift.drivers[1]!.sha256 = sha256("driver-drift");
  assert.throws(
    () => validateCurrentParserReceiptIngressTopology(
      driverDrift,
      sources,
      {sha256: digest, byteLength: 16},
    ),
    /official_driver_drift/,
  );
}

{
  const root = realpathSync(mkdtempSync(
    join(tmpdir(), "cheng-current-official-binding-positive-"),
  ));
  try {
    const fixture = buildOfficialBindingFixture(root);
    assert.equal(
      readFileSync(fixture.coldScratchReceiptPath, "utf8")
        .trimEnd()
        .split("\n").length,
      112,
    );
    const identity = validateOfficialCurrentBuildBindingClosure(
      fixture.bindingPath,
      fixture.officialBuildReceiptPath,
      fixture.officialDriverPath,
    );
    assert.equal(identity.bindingPath, fixture.bindingPath);
    assert.equal(
      identity.sourceSnapshotManifestPath,
      fixture.privateManifestPath,
    );
    assert.equal(identity.officialDriverPath, fixture.officialDriverPath);
    assert.match(identity.bindingSha256, /^[0-9a-f]{64}$/);
  } finally {
    removeFixtureTree(root);
  }
}

for (const [name, mutate, pattern] of [
  [
    "manifest-path",
    (fixture: OfficialBindingFixture) => rewriteHashedKv(
      fixture.bindingPath,
      (rows) => {
        const index = rows.findIndex((row) =>
          row.startsWith("compiler_private_source_manifest_path_fshex="));
        rows[index] =
          `compiler_private_source_manifest_path_fshex=${fshex(
            join(fixture.root, "other.manifest"),
          )}`;
      },
    ),
    /private_source_manifest_binding_drift/,
  ],
  [
    "manifest-hash",
    (fixture: OfficialBindingFixture) => rewriteHashedKv(
      fixture.bindingPath,
      (rows) => {
        const index = rows.findIndex((row) =>
          row.startsWith("compiler_private_source_manifest_sha256="));
        rows[index] =
          `compiler_private_source_manifest_sha256=${sha256("other")}`;
      },
    ),
    /private_source_manifest_binding_drift/,
  ],
  [
    "driver-path",
    (fixture: OfficialBindingFixture) => rewriteHashedKv(
      fixture.bindingPath,
      (rows) => {
        const index = rows.findIndex((row) =>
          row.startsWith("official_driver_path_fshex="));
        rows[index] =
          `official_driver_path_fshex=${fshex(join(fixture.root, "other"))}`;
      },
    ),
    /driver_path_not_authoritative/,
  ],
  [
    "driver-hash",
    (fixture: OfficialBindingFixture) => rewriteHashedKv(
      fixture.bindingPath,
      (rows) => {
        const index = rows.findIndex((row) =>
          row.startsWith("official_driver_sha256="));
        rows[index] = `official_driver_sha256=${sha256("other")}`;
      },
    ),
    /driver_binding_drift/,
  ],
  [
    "binding-self-hash",
    (fixture: OfficialBindingFixture) => {
      chmodSync(fixture.bindingPath, 0o600);
      const bytes = readFileSync(fixture.bindingPath);
      writeFileSync(
        fixture.bindingPath,
        Buffer.concat([bytes.subarray(0, bytes.length - 1), Buffer.from("x\n")]),
      );
    },
    /payload_hash_(?:position_)?invalid/,
  ],
  [
    "candidate-root",
    (fixture: OfficialBindingFixture) => {
      const otherCandidate = join(
        fixture.root,
        "other/cheng.compiler-main",
      );
      mkdirSync(dirname(otherCandidate), {recursive: true});
      writeFileSync(otherCandidate, "compiler-candidate\n", {mode: 0o500});
      rewriteHashedKv(fixture.installReceiptPath, (rows) => {
        const index = rows.findIndex((row) =>
          row.startsWith("compiler_candidate_path_fshex="));
        rows[index] =
          `compiler_candidate_path_fshex=${fshex(otherCandidate)}`;
      });
      rebindFixtureChain(fixture);
    },
    /compiler_evidence_layout_invalid/,
  ],
  [
    "root-escape",
    (fixture: OfficialBindingFixture) => {
      const escaped = join(fixture.root, "escaped.manifest");
      writeFileSync(escaped, "private-source-manifest\n");
      rewriteHashedKv(fixture.compilerReceiptPath, (rows) => {
        const pathIndex = rows.findIndex((row) =>
          row.startsWith("private_source_snapshot_manifest_path="));
        rows[pathIndex] = `private_source_snapshot_manifest_path=${escaped}`;
      });
      rebindFixtureChain(fixture);
    },
    /private_snapshot_layout_invalid/,
  ],
  [
    "private-manifest-drift",
    (fixture: OfficialBindingFixture) => {
      chmodSync(fixture.privateManifestPath, 0o600);
      writeFileSync(fixture.privateManifestPath, "private-source-drifted!\n");
    },
    /private_source_manifest_sha_drift/,
  ],
] as const) {
  const root = realpathSync(mkdtempSync(
    join(tmpdir(), `cheng-current-official-binding-${name}-`),
  ));
  try {
    const fixture = buildOfficialBindingFixture(root);
    mutate(fixture);
    assert.throws(
      () => validateOfficialCurrentBuildBindingClosure(
        fixture.bindingPath,
        fixture.officialBuildReceiptPath,
        fixture.officialDriverPath,
      ),
      pattern,
      name,
    );
  } finally {
    removeFixtureTree(root);
  }
}

const coldScratchMutations = [
  [
    "final-scratch-receipt-path",
    (fixture: OfficialBindingFixture) => {
      const other = join(fixture.root, "other/receipt.kv");
      mkdirSync(dirname(other), {recursive: true});
      copyFileSync(fixture.coldScratchReceiptPath, other);
      chmodSync(other, 0o400);
      rewriteHashedKv(fixture.officialBuildReceiptPath, (rows) => {
        const pathIndex = rows.findIndex((row) =>
          row.startsWith("cold_scratch_execution_receipt_path_fshex="));
        rows[pathIndex] =
          `cold_scratch_execution_receipt_path_fshex=${fshex(other)}`;
        const shaIndex = rows.findIndex((row) =>
          row.startsWith("cold_scratch_execution_receipt_sha256="));
        rows[shaIndex] =
          `cold_scratch_execution_receipt_sha256=${sha256(
            readFileSync(other),
          )}`;
      });
      rebindOfficialBuildIntoBinding(fixture);
    },
    /cold_scratch_execution_receipt_layout_invalid/,
  ],
  [
    "final-scratch-receipt-hash",
    (fixture: OfficialBindingFixture) => {
      rewriteHashedKv(fixture.officialBuildReceiptPath, (rows) => {
        const index = rows.findIndex((row) =>
          row.startsWith("cold_scratch_execution_receipt_sha256="));
        rows[index] =
          `cold_scratch_execution_receipt_sha256=${sha256("other")}`;
      });
      rebindOfficialBuildIntoBinding(fixture);
    },
    /cold_scratch_execution_receipt_sha_drift/,
  ],
  [
    "scratch-key-order",
    (fixture: OfficialBindingFixture) => {
      rewriteHashedKv(fixture.coldScratchReceiptPath, (rows) => {
        [rows[18], rows[19]] = [rows[19]!, rows[18]!];
      });
      rebindScratchReceiptIntoOfficial(fixture);
    },
    /cold_scratch_execution_receipt_key_order_invalid/,
  ],
  [
    "scratch-authority-field-missing",
    (fixture: OfficialBindingFixture) => {
      rewriteHashedKv(fixture.coldScratchReceiptPath, (rows) => {
        const index = rows.findIndex((row) =>
          row.startsWith("argv_manifest_ctime_ns="));
        assert.notEqual(index, -1);
        rows.splice(index, 1);
      });
      rebindScratchReceiptIntoOfficial(fixture);
    },
    /cold_scratch_execution_receipt_key_set_invalid/,
  ],
  [
    "scratch-old-32-key-format",
    (fixture: OfficialBindingFixture) => {
      const oldKeys = new Set([
        "schema",
        "status",
        "guard_report_path_fshex",
        "guard_report_sha256",
        "stdout_path_fshex",
        "stdout_sha256",
        "stderr_path_fshex",
        "stderr_sha256",
        "resource_trace_path_fshex",
        "resource_trace_sha256",
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
      ]);
      rewriteHashedKv(fixture.coldScratchReceiptPath, (rows) => {
        rows.splice(
          0,
          rows.length,
          ...rows.filter((row) =>
            oldKeys.has(row.slice(0, row.indexOf("=")))),
        );
      });
      rebindScratchReceiptIntoOfficial(fixture);
    },
    /cold_scratch_execution_receipt_key_set_invalid/,
  ],
  [
    "scratch-authority-path",
    (fixture: OfficialBindingFixture) => {
      mutateScratchReceiptField(
        fixture,
        "argv_manifest_path_fshex",
        fshex(fixture.coldScratchEnvManifestPath),
      );
    },
    /cold_scratch_execution_argv_manifest_path_invalid/,
  ],
  [
    "scratch-authority-same-bytes-inode",
    (fixture: OfficialBindingFixture) => {
      const replacement = `${fixture.coldScratchArgvManifestPath}.replacement`;
      copyFileSync(fixture.coldScratchArgvManifestPath, replacement);
      chmodSync(replacement, 0o400);
      renameSync(replacement, fixture.coldScratchArgvManifestPath);
    },
    /cold_scratch_execution_argv_manifest_physical_identity_invalid:inode/,
  ],
  [
    "scratch-authority-mode",
    (fixture: OfficialBindingFixture) => {
      chmodSync(fixture.coldScratchEnvManifestPath, 0o600);
    },
    /cold_scratch_execution_env_manifest_physical_identity_invalid/,
  ],
  [
    "scratch-authority-nlink",
    (fixture: OfficialBindingFixture) => {
      linkSync(
        fixture.coldScratchEnvManifestPath,
        `${fixture.coldScratchEnvManifestPath}.foreign-link`,
      );
    },
    /cold_scratch_execution_env_manifest_physical_identity_invalid:nlink/,
  ],
  [
    "scratch-authority-hash",
    (fixture: OfficialBindingFixture) => {
      mutateScratchReceiptField(
        fixture,
        "execution_manifest_sha256",
        sha256("other"),
      );
    },
    /cold_scratch_execution_execution_manifest_sha_drift/,
  ],
  ...([
    "uid",
    "gid",
    "size",
    "mtime_ns",
    "ctime_ns",
  ] as const).map((suffix) => [
    `scratch-authority-${suffix}`,
    (fixture: OfficialBindingFixture) => {
      const stat = lstatSync(
        fixture.coldScratchExecutionEvidencePath,
        {bigint: true},
      );
      const actual = {
        uid: stat.uid,
        gid: stat.gid,
        size: stat.size,
        mtime_ns: stat.mtimeNs,
        ctime_ns: stat.ctimeNs,
      }[suffix];
      mutateScratchReceiptField(
        fixture,
        `execution_evidence_${suffix}`,
        String(actual + 1n),
      );
    },
    new RegExp(
      `cold_scratch_execution_execution_evidence_` +
      `physical_identity_invalid:${suffix}`,
    ),
  ] as const),
  [
    "scratch-argv-manifest-content",
    (fixture: OfficialBindingFixture) => {
      const commandPath = join(
        fixture.root,
        "workspace/tools/cold_codegen_scratch_lifetime_gate.sh",
      );
      const changed = [commandPath, "--root", join(fixture.root, "other")];
      rewritePlainKv(fixture.coldScratchArgvManifestPath, (rows) => {
        rows[2] = `sha256=${scratchArgvSha256(changed)}`;
        rows[5] = `arg.2.fshex=${fshex(changed[2]!)}`;
      });
      rebindBoundFileIntoScratchReceipt(
        fixture,
        "argv_manifest",
        fixture.coldScratchArgvManifestPath,
      );
    },
    /cold_scratch_argv_manifest_value_invalid/,
  ],
  [
    "scratch-env-manifest-content",
    (fixture: OfficialBindingFixture) => {
      const changedEnv = new Map([
        ["HOME", "/var/empty"],
        ["LANG", "C"],
        ["LC_ALL", "C"],
        ["PATH", "/usr/bin:/bin"],
        ["TMPDIR", "/private/var/tmp"],
      ]);
      rewritePlainKv(fixture.coldScratchEnvManifestPath, (rows) => {
        rows[2] = `sha256=${scratchEnvSha256(changedEnv)}`;
        const valueIndex = rows.findIndex((row) =>
          row === `entry.3.key_fshex=${Buffer.from("PATH").toString("hex")}`);
        assert.notEqual(valueIndex, -1);
        rows[valueIndex + 1] =
          `entry.3.value_fshex=${Buffer.from("/usr/bin:/bin").toString("hex")}`;
      });
      rebindBoundFileIntoScratchReceipt(
        fixture,
        "env_manifest",
        fixture.coldScratchEnvManifestPath,
      );
    },
    /cold_scratch_env_manifest_value_invalid/,
  ],
  [
    "scratch-execution-manifest-content",
    (fixture: OfficialBindingFixture) => {
      rewriteExecutionManifest(
        fixture.coldScratchExecutionManifestPath,
        (rows) => {
          const index = rows.findIndex((row) =>
            row.startsWith("input.command.inode="));
          assert.notEqual(index, -1);
          rows[index] = "input.command.inode=0";
        },
      );
      rebindBoundFileIntoScratchReceipt(
        fixture,
        "execution_manifest",
        fixture.coldScratchExecutionManifestPath,
      );
    },
    /cold_scratch_execution_manifest_input_command_physical_identity_invalid:inode/,
  ],
  [
    "scratch-source-manifest-hash",
    (fixture: OfficialBindingFixture) => {
      rewriteHashedKv(fixture.coldScratchReceiptPath, (rows) => {
        const index = rows.findIndex((row) =>
          row.startsWith("source_manifest_sha256="));
        rows[index] = `source_manifest_sha256=${sha256("other")}`;
      });
      rebindScratchReceiptIntoOfficial(fixture);
    },
    /cold_scratch_source_manifest_binding_invalid/,
  ],
  [
    "scratch-manifest-content-cid",
    (fixture: OfficialBindingFixture) => {
      const mutated = readFileSync(
        fixture.officialSourceBeforePath,
        "utf8",
      ).replace(
        /^content_cid=[0-9a-f]{64}$/m,
        `content_cid=${sha256("self-consistent-outer-wrong-inner")}`,
      );
      chmodSync(fixture.officialSourceBeforePath, 0o600);
      writeFileSync(fixture.officialSourceBeforePath, mutated);
      chmodSync(fixture.officialSourceBeforePath, 0o400);
      chmodSync(fixture.officialSourceAfterPath, 0o600);
      writeFileSync(fixture.officialSourceAfterPath, mutated);
      chmodSync(fixture.officialSourceAfterPath, 0o400);
      rebindSourceManifestChain(fixture);
    },
    /cold_scratch_source_manifest_content_cid_mismatch/,
  ],
  [
    "scratch-snapshot-gate-bytes",
    (fixture: OfficialBindingFixture) => {
      const tools = join(fixture.coldScratchSnapshotRoot, "tools");
      const gate = join(
        tools,
        "cold_codegen_scratch_lifetime_gate.sh",
      );
      chmodSync(fixture.coldScratchSnapshotRoot, 0o700);
      chmodSync(tools, 0o700);
      chmodSync(gate, 0o600);
      writeFileSync(gate, "#!/bin/sh\nexit 1\n");
      chmodSync(gate, 0o500);
      chmodSync(tools, 0o500);
      chmodSync(fixture.coldScratchSnapshotRoot, 0o500);
    },
    /cold_scratch_snapshot_member_drift:/,
  ],
  [
    "scratch-command-argv",
    (fixture: OfficialBindingFixture) => {
      rewriteHashedKv(fixture.coldScratchReceiptPath, (rows) => {
        const index = rows.findIndex((row) =>
          row.startsWith("command_argv_sha256="));
        rows[index] = `command_argv_sha256=${sha256("other")}`;
      });
      rebindScratchReceiptIntoOfficial(fixture);
    },
    /cold_scratch_execution_authority_invalid/,
  ],
  [
    "scratch-guard-formal-command",
    (fixture: OfficialBindingFixture) => {
      rewritePlainKv(fixture.coldScratchGuardReportPath, (rows) => {
        const index = rows.findIndex((row) =>
          row.startsWith("formal_command_identity_status="));
        rows[index] = "formal_command_identity_status=missing";
      });
      rebindGuardIntoScratchReceipt(fixture);
    },
    /cold_scratch_guard_report_binding_invalid:formal_command_identity_status/,
  ],
  [
    "scratch-guard-output-inode",
    (fixture: OfficialBindingFixture) => {
      rewritePlainKv(fixture.coldScratchGuardReportPath, (rows) => {
        const index = rows.findIndex((row) =>
          row.startsWith("stdout_inode="));
        rows[index] = "stdout_inode=0";
      });
      rebindGuardIntoScratchReceipt(fixture);
    },
    /cold_scratch_guard_report_artifact_identity_invalid:stdout_inode/,
  ],
  [
    "scratch-stdout-bytes",
    (fixture: OfficialBindingFixture) => {
      chmodSync(fixture.coldScratchStdoutPath, 0o600);
      writeFileSync(
        fixture.coldScratchStdoutPath,
        COLD_SCRATCH_STDOUT.replace("begin_count=4", "begin_count=5"),
      );
      chmodSync(fixture.coldScratchStdoutPath, 0o400);
    },
    /cold_scratch_execution_stdout_sha_drift/,
  ],
] as const;

for (const [name, mutate, pattern] of coldScratchMutations) {
  const root = realpathSync(mkdtempSync(
    join(tmpdir(), `cheng-current-cold-scratch-${name}-`),
  ));
  try {
    const fixture = buildOfficialBindingFixture(root);
    mutate(fixture);
    assert.throws(
      () => validateOfficialCurrentBuildBindingClosure(
        fixture.bindingPath,
        fixture.officialBuildReceiptPath,
        fixture.officialDriverPath,
      ),
      pattern,
      name,
    );
  } finally {
    removeFixtureTree(root);
  }
}

{
  const root = realpathSync(mkdtempSync(
    join(tmpdir(), "cheng-current-official-binding-symlink-"),
  ));
  try {
    const fixture = buildOfficialBindingFixture(root);
    const target = join(root, "private-target.manifest");
    copyFileSync(fixture.privateManifestPath, target);
    rmSync(fixture.privateManifestPath);
    symlinkSync(target, fixture.privateManifestPath);
    assert.throws(() => validateOfficialCurrentBuildBindingClosure(
      fixture.bindingPath,
      fixture.officialBuildReceiptPath,
      fixture.officialDriverPath,
    ));
  } finally {
    removeFixtureTree(root);
  }
}

const snapshotFixtureRoot = realpathSync(mkdtempSync(
  join(tmpdir(), "cheng-current-source-snapshot-mutation-"),
));
let snapshotDirectories: string[] = [];
try {
  const workspacePathRoot = join(snapshotFixtureRoot, "workspace");
  const snapshotPathRoot = join(snapshotFixtureRoot, "snapshot");
  const manifestPath = join(snapshotFixtureRoot, "snapshot.manifest.txt");
  mkdirSync(workspacePathRoot);
  mkdirSync(snapshotPathRoot);
  const workspaceRoot = realpathSync(workspacePathRoot);
  const snapshotRoot = realpathSync(snapshotPathRoot);
  const relativePaths = [
    "bootstrap/cheng_cold.c",
    "docs/cheng-formal-spec.md",
    "src/core/lang/parser.cheng",
    "src/core/tooling/backend_driver_dispatch_min.cheng",
    "src/core/tooling/compiler_parser_receipt.cheng",
  ].sort((left, right) =>
    Buffer.compare(Buffer.from(left), Buffer.from(right)));
  const rows = relativePaths.map((relativePath, index) => {
    const bytes = Buffer.from(`current-source-${index}\n`);
    const workspacePath = join(workspaceRoot, relativePath);
    const snapshotPath = join(snapshotRoot, relativePath);
    mkdirSync(dirname(workspacePath), {recursive: true});
    mkdirSync(dirname(snapshotPath), {recursive: true});
    writeFileSync(workspacePath, bytes);
    writeFileSync(snapshotPath, bytes);
    chmodSync(snapshotPath, 0o400);
    const stat = lstatSync(snapshotPath, {bigint: true});
    return {
      relativePath,
      bytes,
      sha256: sha256(bytes),
      stat,
    };
  });
  const directories = new Set<string>([snapshotRoot]);
  for (const row of rows) {
    let current = dirname(join(snapshotRoot, row.relativePath));
    while (current.startsWith(snapshotRoot) && current !== dirname(snapshotRoot)) {
      directories.add(current);
      if (current === snapshotRoot) break;
      current = dirname(current);
    }
  }
  for (const directory of [...directories].sort(
    (left, right) => right.length - left.length,
  )) {
    chmodSync(directory, 0o500);
  }
  snapshotDirectories = [...directories];
  const closureParts: Buffer[] = [
    frame32(Buffer.from("cheng.private_source_snapshot")),
    (() => {
      const count = Buffer.allocUnsafe(4);
      count.writeUInt32BE(rows.length);
      return count;
    })(),
  ];
  for (const row of rows) {
    closureParts.push(
      frame32(Buffer.from(row.relativePath)),
      frame32(Buffer.from("compiler_source")),
      Buffer.from(row.sha256, "hex"),
      frame64(row.bytes.length),
    );
  }
  const lines = [
    "schema=cheng.private_source_snapshot",
    "status=frozen",
    `workspace_root=${workspaceRoot}`,
    `snapshot_root=${snapshotRoot}`,
    `entry_count=${rows.length}`,
    `compiler_source_count=${rows.length}`,
    `closure_sha256=${sha256(Buffer.concat(closureParts))}`,
  ];
  rows.forEach((row, index) => {
    lines.push(
      `entry.${index}.relative=${row.relativePath}`,
      `entry.${index}.role=compiler_source`,
      `entry.${index}.sha256=${row.sha256}`,
      `entry.${index}.bytes=${row.bytes.length}`,
      `entry.${index}.device=${row.stat.dev}`,
      `entry.${index}.inode=${row.stat.ino}`,
      `entry.${index}.mode=400`,
      `entry.${index}.mtime_ns=${row.stat.mtimeNs}`,
      `entry.${index}.ctime_ns=${row.stat.ctimeNs}`,
    );
  });
  writeFileSync(manifestPath, lines.join("\n") + "\n", {mode: 0o400});
  const frozen = validateFrozenCurrentSourceSnapshotClosure(
    manifestPath,
    workspaceRoot,
    snapshotRoot,
  );
  assert.equal(frozen.entryCount, rows.length);
  writeFileSync(
    join(workspaceRoot, "src/core/lang/parser.cheng"),
    "source-drift\n",
  );
  assert.throws(
    () => validateFrozenCurrentSourceSnapshotClosure(
      manifestPath,
      workspaceRoot,
      snapshotRoot,
    ),
    /source_snapshot_workspace_drift:src\/core\/lang\/parser\.cheng/,
  );
} finally {
  for (const directory of snapshotDirectories.sort(
    (left, right) => left.length - right.length,
  )) {
    chmodSync(directory, 0o700);
  }
  rmSync(snapshotFixtureRoot, {recursive: true, force: true});
}

const hardRed: CurrentParserReceiptIngressReport = {
  schema: CHENG_CURRENT_PARSER_RECEIPT_INGRESS_SCHEMA,
  status: "HARD_RED",
  reason: "receipt_deleted",
  officialCurrentBuildBindingPath: "/tmp/current-official-binding.kv",
  officialCurrentBuildBindingSha256: "",
  sourceSnapshotManifestPath: "",
  sourceSnapshotManifestSha256: "",
  sourceSnapshotClosureSha256: "",
  officialDriverPath: "",
  officialDriverSha256: "",
  harnessManifestPath: "/tmp/parser-production-receipt-harness.json",
  harnessManifestSha256: "",
  productionCount: CHENG_CURRENT_PARSER_RECEIPT_PRODUCTION_COUNT,
  requiredObligationCount: CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT,
  witnessedObligationCount: 0,
  missingObligationCount: CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT,
  receiptCount: 0,
  admittedMapSha256: "",
};
assert.equal(
  (parseUniqueCurrentJson(
    serializeCurrentParserReceiptIngressReport(hardRed),
    "current_ingress_report",
  ) as {status: string}).status,
  "HARD_RED",
);
assert.throws(
  () => validateCurrentParserReceiptIngressReport({
    ...hardRed,
    witnessedObligationCount: 1,
    missingObligationCount:
      CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT - 1,
  }),
  /hard_red_must_not_witness/,
);
assert.throws(
  () => parseUniqueCurrentJson(
    JSON.stringify({...hardRed, compatibilityReader: false}),
    "current_ingress_report",
  ),
  /forbidden_compatibility_key/,
);

const unavailable = await admitCurrentParserReceipts({
  officialCurrentBuildBindingPath: "/tmp/current-official-binding.kv",
  harnessManifestPath: "/tmp/parser-production-receipt-harness.json",
});
assert.equal(unavailable.report.status, "HARD_RED");
assert.equal(unavailable.report.witnessedObligationCount, 0);
assert.equal(
  unavailable.report.missingObligationCount,
  CHENG_CURRENT_PARSER_RECEIPT_REQUIRED_COUNT,
);
assert.equal(unavailable.admittedMapJson, undefined);

console.log(
  "item25 current parser receipt ingress: PASS " +
  "binding/private-root/manifest/driver/source drift hard-red " +
  `cold_scratch_mutations=${coldScratchMutations.length}`,
);
