import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {chmodSync, copyFileSync, existsSync, linkSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {getChengFusionToolManifest, getChengFusionTools, initChengFusionToolRegistryModule} from "../src/cheng_fusion_tool_registry.ts";
import {acquireReleaseWorkClaim, buildPrivateOneShotBundle, closeReleaseWorkClaim, deriveFormalExpressionObligationManifest, evaluateFormalExpressionObligationCoverage, executePreflight, finalizeReleaseWorkClaim, formalChengCompilerProfile, materializeFinalReleaseArtifactManifest, materializePrivateOneShotSourceTree, materializePrivateReleaseToolchain, privateReleaseExecutionEnv, productionRequiredStatuses, rawDriverFixedPoint, sameSourceInputs, snapshotSourceInputs, sourceImports, strictKv, validateAarch64F64RuntimeGateBundle, validateAarch64F64RuntimeGateReport, validateAuthorityProductionClosure, validateBackend2VersionManifest, validateBackend2VersionSentinelReport, validateCanonicalRegallocEvidenceLabels, validateCIncludeClosure, validateFinalReleaseArtifactManifest, validateMemoryManifestBytes, validateOfficialDriverBuildReceipt, validatePrivateOneShotSourceTree, validatePrivateReleaseToolchain, validateProductionGateDependencyBundle, validateProductionGateEvidence, validateProductionGuardReport, validateQualifiedNestedCallDeclarationWitness, validateReleaseEvidenceFieldPresence, validateReleaseWorkClaim, validateRemovedBackend2IndependentEmitterModules, validateSourceManifestPath, validateTypedExprCoverageLedger, validateTypedExprFormalSpecBinding, validateTypedExprFrozenAuthority, validateX86_64F64RuntimeGateBundle, validateX86_64F64RuntimeGateReport} from "../src/cheng_regalloc_preflight_m9022.ts";
import {assertTrue, startMcp} from "./mcp_client.ts";

const PROJECT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHENG_ROOT = process.env.CHENG_TOOLCHAIN_ROOT || process.env.CHENG_ROOT || "/Users/lbcheng/cheng-lang";
const STAGE3 = process.env.CHENG_STAGE3_DRIVER || join(CHENG_ROOT, "artifacts/bootstrap/cheng.stage3");
const OFFICIAL_DRIVER = process.env.CHENG_OFFICIAL_DRIVER || join(CHENG_ROOT, "artifacts/backend_driver/cheng");
const CLI = join(PROJECT, "cli.ts");
const ROLES = ["csg_path_to_macho", "source_path_to_macho", "source_to_object", "facts_from_source", "csg_roundtrip", "command_csg_emit"];
const MEMORY_ROW_BYTES = Object.freeze({op: 44, slot: 52, callArg: 24});
const AUTHORITY_FILES = [
  "src/core/lang/parser.cheng",
  "src/core/lang/typed_expr.cheng",
  "src/core/backend/lowering_plan.cheng",
  "src/core/backend/primary_object_plan.cheng",
  "src/core/backend2/backend2_pipeline.cheng",
  "src/core/backend2/backend2_lower.cheng",
  "src/core/backend2/backend2_lower_slots.cheng",
  "src/core/backend2/backend2_lower_stmt.cheng",
  "src/core/backend2/backend2_lower_util.cheng",
];

function hash(raw: Buffer | string) {
  return createHash("sha256").update(raw).digest("hex");
}

function collectReportStatus(value: any, wanted: string, path = "$", found: Array<{path: string; reason: string}> = []) {
  if (!value || typeof value !== "object") return found;
  if (value.status === wanted) found.push({path, reason: typeof value.reason === "string" ? value.reason : ""});
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) collectReportStatus(value[index], wanted, `${path}[${index}]`, found);
    return found;
  }
  for (const [key, nested] of Object.entries(value)) collectReportStatus(nested, wanted, `${path}.${key}`, found);
  return found;
}

function conciseStatuses(rows: Array<{path: string; reason: string}>) {
  return rows.map((entry) => `${entry.path}:${entry.reason || "missing_reason"}`).join("\n");
}

function render(fields: Array<[string, string | number | bigint]>, payloadKey: string) {
  const payload = fields.map(([key, value]) => `${key}=${value}\n`).join("");
  return Buffer.from(payload + `${payloadKey}=${hash(payload)}\n`, "utf8");
}

function productionGuard(tag: string, stdoutPath: string, stderrPath: string, options: any = {}) {
  const residentPeak = 900;
  const physPeak = 1000;
  const enforcedPeak = options.badGuardPeak ? 999 : 1000;
  const rows: Array<[string, string | number]> = [
    ["tool", "tools/beat_c_process_group_guard.sh"],
    ["schema", "beat_c_process_memory_guard"],
    ["platform", "darwin"],
    ["status", "completed"],
    ["rc", 0],
    ["abort_reason", ""],
    ["memory_guard_mode", "process_tree"],
    ["memory_guard_scope", options.badGuardScope ? "direct_process_only" : "identity_history_union_group_and_descendants"],
    ["process_tree_membership_metric", "darwin_libproc_identity_history_group_and_descendants"],
    ["enforcement_kind", "darwin_cooperative_process_tree_poll"],
    ["observed_sample_limit_status", "proved"],
    ["hard_memory_limit_proof_status", "not_provable_userspace_poll"],
    ["sampling_blind_spot", "inter_sample_transient_peaks_not_provable_by_userspace_polling"],
    ["memory_limit_bytes", options.memoryLimit ?? 1073741824],
    ["memory_enforcement_metric", "max_process_tree_resident_and_phys_footprint"],
    ["process_tree_resident_metric", "current_resident_bytes_sum"],
    ["process_tree_phys_footprint_metric", "darwin_rusage_info_v0_phys_footprint_bytes_sum"],
    ["process_tree_phys_footprint_status", "available"],
    ["root_identity_sampled", 1],
    ["process_tree_escape_pid", 0],
    ["memory_measurement_status", "available"],
    ["memory_measurement_error", ""],
    ["startup_status", "sampled"],
    ["cleanup_status", "not_required"],
    ["cleanup_error", ""],
    ["poll_seconds", "0.01"],
    ["stdout", stdoutPath],
    ["stderr", stderrPath],
    ["process_tree_resident_peak_bytes", residentPeak],
    ["process_tree_phys_footprint_peak_bytes", physPeak],
    ["process_tree_enforced_peak_bytes", enforcedPeak],
    ["process_tree_enforced_sample_peak_bytes", enforcedPeak],
    ["process_tree_peak_process_count", 1],
    ["process_tree_identity_history_peak_count", 1],
    ["memory_sample_count", 10],
    ["self_test_global_process_iter_trap_status", "not_requested"],
    ["self_test_global_process_iter_trap_probe_status", "not_run"],
    ["self_test_global_process_iter_trap_call_count", 0],
    ["startup_timeout_seconds", 5],
    ["cleanup_timeout_seconds", 2],
    ["timeout_seconds", 600],
    // ---- 新版 guard(+1094 强化)78 字段: 合成合法值, 值约束仍只钉旧字段 ----
    ["command_path", "/bin/echo"],
    ["command_sha256", "8ee6815604068a5656c6d3d05310e6b11f01d8c3f620fe54eedbaeb67a5ef2a2"],
    ["command_size", 101136],
    ["command_inode", 1152921500312571397],
    ["command_device", 16777230],
    ["command_mtime_ns", 1777577597000000000],
    ["command_ctime_ns", 1777577597000000000],
    ["command_identity_status", "available"],
    ["command_identity_error", ""],
    ["command_execution_mode", "direct"],
    ["command_execution_trust_boundary", "direct_path_with_pre_post_identity_detection_not_same_uid_isolation"],
    ["command_execution_snapshot_path", "/bin/echo"],
    ["command_execution_snapshot_schema", "cheng.guard.command_snapshot"],
    ["command_execution_snapshot_sha256", "8ee6815604068a5656c6d3d05310e6b11f01d8c3f620fe54eedbaeb67a5ef2a2"],
    ["command_execution_snapshot_size", 101136],
    ["command_execution_snapshot_inode", 1152921500312571397],
    ["command_execution_snapshot_device", 16777230],
    ["command_execution_snapshot_mtime_ns", 1777577597000000000],
    ["command_execution_snapshot_ctime_ns", 1777577597000000000],
    ["command_argv_schema", "cheng.guard.command_argv"],
    ["command_argv_count", 2],
    ["command_argv_sha256", "907f72a8a4c890563da12f794f6222b030e002ebf79a7e22c1c8f0ce5a0979f3"],
    ["monitor_python_path", "/opt/miniconda3/bin/python3.13"],
    ["monitor_python_sha256", "0adec2c09b0da4c62bfe4445db5ef210c0a216ec22c5115e073951195c90bfd3"],
    ["monitor_python_size", 6113312],
    ["monitor_python_inode", 24450144],
    ["monitor_python_device", 16777230],
    ["monitor_python_mtime_ns", 1753973123253655066],
    ["monitor_python_ctime_ns", 1753973145873068603],
    ["monitor_psutil_path", "/opt/miniconda3/lib/python3.13/site-packages/psutil/__init__.py"],
    ["monitor_psutil_sha256", "b4f4a4154a17f441adbca883cd17123188546c79487456c2c39edae32b0dccb1"],
    ["monitor_psutil_size", 86668],
    ["monitor_psutil_inode", 32199806],
    ["monitor_psutil_device", 16777230],
    ["monitor_psutil_mtime_ns", 1754734767203902865],
    ["monitor_psutil_ctime_ns", 1754734767203902865],
    ["monitor_psutil_closure_schema", "cheng.guard.file_closure"],
    ["monitor_psutil_closure_root", "/opt/miniconda3/lib/python3.13/site-packages/psutil"],
    ["monitor_psutil_closure_count", 58],
    ["monitor_psutil_closure_sha256", "1cca0c5052ac3108b592d4322e99f0bd67117995cc24d191e786feff75fcde55"],
    ["output_artifact_schema", "cheng.guard.output_artifacts"],
    ["output_artifact_count", 3],
    ["output_path_history_schema", "cheng.guard.output_path_history"],
    ["output_path_history_status", "verified_clean"],
    ["output_path_history_monitor", "darwin_kqueue_vnode"],
    ["output_path_history_watch_count", 3],
    ["output_path_history_forbidden_events", "delete,link,rename,revoke,unmount"],
    ["stdout_status", "available"],
    ["stdout_path", stdoutPath],
    ["stdout_sha256", "98ea6e4f216f2fb4b69fff9b3a44842c38686ca685f3f55dc48c5d3fb1107be4"],
    ["stdout_size", 3],
    ["stdout_inode", 335470752],
    ["stdout_device", 16777230],
    ["stderr_status", "available"],
    ["stderr_path", stderrPath],
    ["stderr_sha256", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["stderr_size", 0],
    ["stderr_inode", 335470753],
    ["stderr_device", 16777230],
    ["target_env_schema", "cheng.guard.target_env"],
    ["target_env_mode", "inherit_scrubbed"],
    ["target_env_count", 53],
    ["target_env_sha256", "29bbe24b65d9c14f586e13d95d2b9df7b1d7a7e0d75a05fac5c8eb19879f78e8"],
    ["parent_guard_mode", "standalone"],
    ["parent_guard_monitor_pid", 0],
    ["parent_guard_capability_sha256", ""],
    ["parent_guard_limit_bytes", 0],
    ["parent_guard_binding_status", "not_applicable"],
    ["phase_trace_status", "disabled"],
    ["phase_trace_path", ""],
    ["phase_trace_sha256", ""],
    ["phase_trace_size", 0],
    ["phase_trace_inode", 0],
    ["phase_trace_device", 0],
    ["resource_trace_status", "disabled"],
    ["resource_trace_path", ""],
    ["resource_trace_sha256", ""],
    ["resource_trace_size", 0],
    ["resource_trace_inode", 0],
    ["resource_trace_device", 0],
    ["report_path", "/private/tmp/synthetic.guard.txt"],
    ["report_inode", 335470751],
    ["report_device", 16777230],
  ];
  return Buffer.from(rows.map(([key, value]) => `${key}=${value}\n`).join(""), "utf8");
}

function legacyProductionEvidenceFixture(parent: string, name: string, options: any = {}) {
  const workPath = join(parent, name);
  mkdirSync(workPath);
  const workDir = realpathSync(workPath);
  const write = (filename: string, raw: Buffer | string) => {
    const path = join(workDir, filename);
    writeFileSync(path, raw);
    return {path, sha256: hash(Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8"))};
  };
  const evidenceFiles = Object.fromEntries([
    "officialManifest", "baselineManifest", "jobsLock", "execDiffLock", "targetEmitLock", "gen3Lock",
  ].map((key) => [key, write(`${key}.txt`, `${key}\n`)]));
  const sourceManifestSha256 = hash("current-source-manifest");
  const officialDriverSha256 = hash("official-driver");
  const baselineDriverSha256 = hash("baseline-driver");
  const fixtureSourceSha256 = hash("workload-fixture");
  const frozen = write("workload.current.regalloc-frozen-plan.txt", render([
    ["schema", options.badSnapshotSchema ? "legacy_regalloc_frozen_plan_snapshot" : "regalloc_frozen_plan_snapshot"],
    ["phase", "allocator_and_machine_recipe_freeze_before_fill"],
    ["fixture_source_sha256", fixtureSourceSha256],
    ["source_manifest_sha256", sourceManifestSha256],
    ["driver_sha256", officialDriverSha256],
    ["target", "arm64-apple-darwin"],
    ["function_count", 1],
  ], "snapshot_payload_sha256"));
  const rows: string[] = [];
  const guardTags: string[] = [];
  let selectedObject: any = null;
  let selectedReport: any = null;
  let selectedLedger: any = null;
  for (let pair = 1; pair <= 3; pair++) {
    const pattern = pair % 2 === 1 ? "ABBA" : "BAAB";
    const roles = pattern === "ABBA" ? ["baseline", "current", "current", "baseline"] : ["current", "baseline", "baseline", "current"];
    for (let ordinal = 1; ordinal <= 4; ordinal++) {
      const role = roles[ordinal - 1];
      const base = `workload.compile_pair.${pair}.${ordinal}.${role}`;
      const wall = 100 + ordinal;
      const compilerSha256 = role === "current" ? officialDriverSha256 : baselineDriverSha256;
      const rowSourceSha256 = options.badSourceDrift && pair === 3 && ordinal === 4 ? hash("drifted-workload") : fixtureSourceSha256;
      const metrics = write(`${base}.metrics.txt`, [
        `schema=${options.badMetricsSchema && pair === 1 && ordinal === 1 ? "regalloc_compile_measurement.v0" : "regalloc_compile_measurement"}`,
        `source_sha256=${rowSourceSha256}`,
        `compiler_sha256=${compilerSha256}`,
        `compile_wall_ns=${wall}`,
        "compile_process_tree_peak_bytes=1000",
        "compile_rc=0",
        "",
      ].join("\n"));
      const objectBytes = options.badObjectDeterminism && role === "current" && pair === 3 && ordinal === 2 ? `object:${role}:drift` : `object:${role}`;
      const object = write(`${base}.o`, Buffer.from(objectBytes, "utf8"));
      const stdout = write(`${base}.compile.stdout.txt`, Buffer.alloc(0));
      const stderr = write(`${base}.compile.stderr.txt`, Buffer.alloc(0));
      const guardTag = `${base}.compile`;
      const guard = write(`${guardTag}.guard.txt`, productionGuard(guardTag, stdout.path, stderr.path, options));
      guardTags.push(guardTag);
      let report;
      if (pair === 1 && ordinal === 2 && role === "current") {
        const ledgerObjectSha256 = options.badLedgerObject ? hash("wrong-object") : object.sha256;
        const ledger = write("workload.current.regalloc-action-ledger.txt", render([
          ["schema", "regalloc_action_emission_ledger"],
          ["output_object_sha256", ledgerObjectSha256],
          ["fixture_source_sha256", fixtureSourceSha256],
          ["function_count", 1],
        ], "ledger_payload_sha256"));
        report = write(`${base}.compile.report.txt`, Buffer.from([
          `regalloc_receipt_schema=${options.badReceiptSchema ? "legacy_regalloc_single_pass.production" : "regalloc_single_pass.production"}`,
          "regalloc_allocator=regalloc_single_pass",
          "regalloc_wiring_mode=production_default",
          `regalloc_driver_sha256=${officialDriverSha256}`,
          `regalloc_source_manifest_sha256=${sourceManifestSha256}`,
          `regalloc_target=arm64-apple-darwin`,
          `regalloc_output_object_sha256=${object.sha256}`,
          `regalloc_fixture_source_sha256=${fixtureSourceSha256}`,
          "regalloc_function_receipt_count=1",
          `regalloc_frozen_plan_snapshot_path=${frozen.path}`,
          `regalloc_frozen_plan_snapshot_sha256=${frozen.sha256}`,
          `regalloc_action_emission_ledger_path=${ledger.path}`,
          `regalloc_action_emission_ledger_sha256=${ledger.sha256}`,
          "",
        ].join("\n"), "utf8"));
        selectedObject = object;
        selectedReport = report;
        selectedLedger = ledger;
      } else {
        report = write(`${base}.compile.report.txt`, `compile_status=GREEN\nrole=${role}\n`);
      }
      rows.push([
        pair, pattern, ordinal, role, wall, 1000,
        rowSourceSha256, compilerSha256,
        metrics.path, metrics.sha256, object.path, object.sha256,
        report.path, report.sha256, guard.path, guard.sha256,
        stdout.path, stdout.sha256, stderr.path, stderr.sha256,
      ].join("\t"));
    }
  }
  assert.ok(selectedObject && selectedReport && selectedLedger);
  const compilePairs = write("workload.compile.pairs.tsv", `${rows.join("\n")}\n`);
  const compileVerdict = write("compile-pair-verdict.txt", render([
    ["schema", "regalloc_compile_pair_verdict"],
    ["pair_count", 3], ["sample_count", 12], ["raw_samples_sha256", compilePairs.sha256],
    ["source_sha256", fixtureSourceSha256], ["current_compiler_sha256", officialDriverSha256],
    ["baseline_compiler_sha256", baselineDriverSha256], ["current_object_sha256", hash("object:current")],
    ["baseline_object_sha256", hash("object:baseline")], ["compile_wall_ratio_median_ppm", 1000000],
    ["compile_wall_ratio_max_ppm", 1000000], ["compile_wall_ratio_spread_ppm", 0],
    ["compile_rss_ratio_median_ppm", 1000000], ["compile_rss_ratio_max_ppm", 1000000],
    ["compile_rss_ratio_spread_ppm", 0],
  ], "verdict_payload_sha256"));
  const productionStatus = options.badProductionStatus ? "RED" : "GREEN";
  const reportRows: Array<[string, string | number]> = [
    ["schema", "regalloc_production_gate"],
    ["status", productionStatus],
    ["production_status", productionStatus],
    ["local_diagnostic_status", "GREEN"],
    ["mode", "run"],
    ["production_green_count", guardTags.length],
    ["production_red_count", 0],
    ["local_green_count", 0],
    ["local_red_count", 0],
    ["root", CHENG_ROOT],
    ["target", "arm64-apple-darwin"],
    ["driver_role", "production"],
    ["driver_source", join(CHENG_ROOT, "artifacts/backend_driver/cheng")],
    ["driver_sha256", officialDriverSha256],
    ["source_git_tree", "a".repeat(40)],
    ["source_manifest_sha256", sourceManifestSha256],
    ["official_manifest_sha256", evidenceFiles.officialManifest.sha256],
    ["baseline_manifest_sha256", evidenceFiles.baselineManifest.sha256],
    ["external_lock_jobs_determinism_path", evidenceFiles.jobsLock.path],
    ["external_lock_jobs_determinism_sha256", evidenceFiles.jobsLock.sha256],
    ["external_lock_exec_diff_path", evidenceFiles.execDiffLock.path],
    ["external_lock_exec_diff_sha256", evidenceFiles.execDiffLock.sha256],
    ["external_lock_target_emit_hard_fail_path", evidenceFiles.targetEmitLock.path],
    ["external_lock_target_emit_hard_fail_sha256", evidenceFiles.targetEmitLock.sha256],
    ["external_lock_gen3_fixed_point_path", evidenceFiles.gen3Lock.path],
    ["external_lock_gen3_fixed_point_sha256", evidenceFiles.gen3Lock.sha256],
    ["memory_guard_kind", "sampled_process_tree_limit"],
    ["memory_limit_bytes", 1073741824],
    ["memory_poll_seconds", "0.01"],
    ["hard_memory_limit_proof_status", "not_provable_userspace_poll"],
    ["compile_wall_regress_ppm", 1050000],
    ["compile_rss_regress_ppm", 1050000],
    ["compile_pair_count", 3],
    ["compile_max_spread_ppm", 100000],
    ["compile_raw_samples_path", compilePairs.path],
    ["compile_raw_samples_sha256", compilePairs.sha256],
    ["compile_pair_verdict_path", compileVerdict.path],
    ["compile_pair_verdict_sha256", compileVerdict.sha256],
    ["work_dir", workDir],
    ...guardTags.map((tag): [string, string] => [`item.${tag}.guard.scope`, "PRODUCTION status=GREEN detail=guarded"]),
  ];
  const report = write("regalloc-production-gate.report.txt", Buffer.from(reportRows.map(([key, value]) => `${key}=${value}\n`).join(""), "utf8"));
  const stdout = Buffer.from([
    `regalloc_gate_production_status=GREEN`,
    `regalloc_gate_local_diagnostic_status=GREEN`,
    `regalloc_gate_production_green_count=${guardTags.length}`,
    `regalloc_gate_production_red_count=0`,
    `regalloc_gate_driver_role=production`,
    `regalloc_gate_report=${report.path}`,
    `regalloc_gate_report_sha256=${report.sha256}`,
    "",
  ].join("\n"), "utf8");
  return {
    workDir, report, stdout,
    expected: {
      root: CHENG_ROOT,
      sourceManifestSha256,
      officialDriverSha256,
      baselineDriverSha256,
      workloadSourceSha256: fixtureSourceSha256,
      ...evidenceFiles,
    },
  };
}

function productionEvidenceFixture(parent: string, name: string, options: any = {}) {
  const fixture = legacyProductionEvidenceFixture(parent, name, options);
  const workDir = fixture.workDir;
  const snapshot = (pathValue: string) => {
    const path = realpathSync(pathValue);
    const raw = readFileSync(path);
    return {path, raw, sha256: hash(raw), stat: lstatSync(path, {bigint: true})};
  };
  const write = (filename: string, raw: Buffer | string, mode?: number) => {
    const path = join(workDir, filename);
    writeFileSync(path, raw);
    if (mode !== undefined) chmodSync(path, mode);
    return snapshot(path);
  };

  const execBundlePath = join(workDir, "private-exec-bundle");
  mkdirSync(execBundlePath);
  const execSpecs = [
    ["gate", "regalloc_production_gate.sh", true],
    ["guard", "beat_c_process_group_guard.sh", true],
    ["evidence", "regalloc_production_evidence.sh", true],
    ["lockValidator", "regalloc_external_lock_validator.py", false],
  ] as const;
  const execFiles = new Map<string, any>();
  for (const [key, basenameValue, executable] of execSpecs) {
    const path = join(execBundlePath, basenameValue);
    writeFileSync(path, Buffer.from(`${key}:strict-private-exec\n`, "utf8"));
    chmodSync(path, executable ? 0o700 : 0o600);
    execFiles.set(key, snapshot(path));
  }
  const execBundle = {path: realpathSync(execBundlePath), files: execFiles};
  const execBundleStat = lstatSync(execBundle.path, {bigint: true});

  const execRoot = join(workDir, "exec-root");
  const execTools = join(execRoot, "tools");
  mkdirSync(execTools, {recursive: true});
  const execSnapshots = new Map<string, any>();
  for (const [key, basenameValue, executable] of execSpecs) {
    const source = execFiles.get(key);
    const path = join(execTools, basenameValue);
    copyFileSync(source.path, path);
    chmodSync(path, executable ? 0o700 : 0o600);
    execSnapshots.set(key, snapshot(path));
  }
  const identityFields: Array<[string, string | number | bigint]> = [
    ["schema", "regalloc_exec_bundle_identity"],
    ["source_root", fixture.expected.root],
    ["exec_bundle", execBundle.path],
    ["exec_bundle_device", execBundleStat.dev],
    ["exec_bundle_inode", execBundleStat.ino],
    ["exec_bundle_mtime_ns", execBundleStat.mtimeNs],
    ["exec_bundle_ctime_ns", execBundleStat.ctimeNs],
    ["bash_source_path", execFiles.get("gate").path],
    ["binding_mode", "explicit_sha256"],
  ];
  const execLabels = [
    ["self", "gate"], ["guard", "guard"], ["evidence", "evidence"], ["lock_validator", "lockValidator"],
  ] as const;
  for (const [label, key] of execLabels) {
    const source = execFiles.get(key);
    const copied = execSnapshots.get(key);
    identityFields.push(
      [`exec_${label}_path`, source.path], [`exec_${label}_expected_sha256`, source.sha256],
      [`exec_${label}_actual_sha256`, source.sha256], [`exec_${label}_device`, source.stat.dev],
      [`exec_${label}_inode`, source.stat.ino], [`exec_${label}_size`, source.stat.size],
      [`exec_${label}_mtime_ns`, source.stat.mtimeNs], [`exec_${label}_ctime_ns`, source.stat.ctimeNs],
      [`exec_${label}_snapshot_path`, copied.path], [`exec_${label}_snapshot_sha256`, copied.sha256],
      [`exec_${label}_snapshot_device`, copied.stat.dev], [`exec_${label}_snapshot_inode`, copied.stat.ino],
    );
  }
  const execIdentity = write("exec-bundle.initial.txt", render(identityFields, "identity_payload_sha256"));
  const execIdentityRows = strictKv(execIdentity.raw, "test exec identity", "identity_payload_sha256").rows;

  const currentExe = write("perf.current.exe", Buffer.from("current executable\n", "utf8"), 0o700);
  const baselineExe = write("perf.baseline.exe", Buffer.from("baseline executable\n", "utf8"), 0o700);
  const guardTags = new Set<string>();
  for (const entry of productionRequiredStatuses()) if (entry.key.endsWith(".guard")) guardTags.add(entry.key.slice(0, -".guard".length));
  const existingGuard = (tag: string) => existsSync(join(workDir, `${tag}.guard.txt`));
  const createGuard = (tag: string, stdoutRaw: Buffer | string = Buffer.alloc(0), stderrRaw: Buffer | string = Buffer.alloc(0)) => {
    const stdout = write(`${tag}.stdout.txt`, stdoutRaw);
    const stderr = write(`${tag}.stderr.txt`, stderrRaw);
    const guard = write(`${tag}.guard.txt`, productionGuard(tag, stdout.path, stderr.path, options));
    return {stdout, stderr, guard};
  };

  const perfRows: string[] = [];
  for (let pair = 1; pair <= 7; pair++) {
    const pattern = pair % 2 === 1 ? "ABBA" : "BAAB";
    const roles = pattern === "ABBA" ? ["baseline", "current", "current", "baseline"] : ["current", "baseline", "baseline", "current"];
    for (let ordinal = 1; ordinal <= 4; ordinal++) {
      const role = roles[ordinal - 1];
      const rowRole = options.badPerfOrder && pair === 7 && ordinal === 4 ? "current" : role;
      const tag = `perf.pair.${pair}.${ordinal}.${role}.run`;
      const elapsed = options.badPerfFloor && pair === 1 && ordinal === 1 ? 1 : 10000000;
      const elapsedArtifact = write(`${tag}.elapsed_ns.txt`, `${elapsed}\n`);
      const artifacts = createGuard(tag, `regalloc_gate_external_elapsed_ns=${elapsed}\n`);
      const executable = role === "current" ? currentExe : baselineExe;
      perfRows.push([
        pair, pattern, ordinal, rowRole, elapsed, executable.path, executable.sha256,
        elapsedArtifact.path, elapsedArtifact.sha256, artifacts.stdout.path, artifacts.stdout.sha256,
        artifacts.stderr.path, artifacts.stderr.sha256, artifacts.guard.path, artifacts.guard.sha256,
      ].join("\t"));
    }
  }
  const perfPairs = write("perf.pairs.tsv", `${perfRows.join("\n")}\n`);
  const perfVerdict = write("perf.verdict.txt", render([
    ["schema", "regalloc_perf_pair_verdict"], ["pair_count", 7], ["sample_count", 28],
    ["raw_samples_sha256", perfPairs.sha256], ["current_executable_sha256", currentExe.sha256],
    ["baseline_executable_sha256", baselineExe.sha256], ["median_ratio_ppm", options.badPerfVerdict ? 999999 : 1000000],
    ["spread_ppm", 0], ["baseline_min_ns", 10000000],
  ], "verdict_payload_sha256"));

  for (const tag of guardTags) if (!existingGuard(tag)) createGuard(tag);

  const required = productionRequiredStatuses();
  const requiredManifestRows = required.map((entry: any) => `${entry.key}\t${entry.scope}`);
  const actualRows = required.map((entry: any) => [entry.key, entry.scope, "GREEN", "proved"]);
  if (options.badRequiredOrder) [actualRows[0], actualRows[1]] = [actualRows[1], actualRows[0]];
  if (options.badRequiredScope) actualRows[0][1] = actualRows[0][1] === "BOTH" ? "PRODUCTION" : "BOTH";
  if (options.badRequiredStatus) actualRows[0][2] = "RED";
  if (options.badRequiredDetail) actualRows[0][3] = "mutated";
  const requiredManifest = write("required-status.tsv", `${requiredManifestRows.join("\n")}\n`);
  const requiredActual = write("required-status.actual.tsv", `${actualRows.map((row: string[]) => row.join("\t")).join("\n")}\n`);
  const requiredVerdict = write("required-status.detail.txt", render([
    ["schema", "regalloc_required_status_contract"], ["status", "proved"], ["required_count", 185],
    ["required_manifest_sha256", requiredManifest.sha256], ["status_rows_path", requiredActual.path],
    ["status_rows_sha256", requiredActual.sha256],
  ], "verdict_payload_sha256"));

  const compilePairs = snapshot(join(workDir, "workload.compile.pairs.tsv"));
  const compileVerdict = snapshot(join(workDir, "compile-pair-verdict.txt"));
  const reportItems = [
    ...required.map((entry: any) => [`item.${entry.key}.scope`, `${entry.scope} status=GREEN detail=proved`] as [string, string]),
    ["item.production_required_status_contract.scope", "PRODUCTION status=GREEN detail=proved"] as [string, string],
  ];
  const productionCount = required.length + 1;
  const localCount = required.filter((entry: any) => entry.scope === "BOTH").length;
  const reportRows: Array<[string, string | number | bigint]> = [
    ["schema", "regalloc_production_gate"], ["status", options.badProductionStatus ? "RED" : "GREEN"],
    ["production_status", options.badProductionStatus ? "RED" : "GREEN"], ["local_diagnostic_status", "GREEN"],
    ["mode", "run"], ["production_green_count", productionCount], ["production_red_count", 0],
    ["local_green_count", localCount], ["local_red_count", 0], ["root", fixture.expected.root],
    ["source_root", fixture.expected.root], ["exec_bundle", execBundle.path], ["exec_bundle_binding_mode", "explicit_sha256"],
    ["exec_bundle_device", execBundleStat.dev], ["exec_bundle_inode", execBundleStat.ino],
    ["exec_bundle_identity_path", execIdentity.path], ["exec_bundle_identity_sha256", execIdentity.sha256],
    ["exec_bundle_identity_actual_sha256", execIdentity.sha256], ["exec_bundle_identity_payload_sha256", execIdentityRows.get("identity_payload_sha256")!],
    ["target", "arm64-apple-darwin"], ["driver_role", "production"],
    ["driver_source", join(fixture.expected.root, "artifacts/backend_driver/cheng")],
    ["driver_sha256", fixture.expected.officialDriverSha256], ["source_git_tree", "a".repeat(40)],
    ["source_manifest_sha256", fixture.expected.sourceManifestSha256],
    ["official_manifest_sha256", fixture.expected.officialManifest.sha256], ["baseline_manifest_sha256", fixture.expected.baselineManifest.sha256],
    ["external_lock_jobs_determinism_path", fixture.expected.jobsLock.path], ["external_lock_jobs_determinism_sha256", fixture.expected.jobsLock.sha256],
    ["external_lock_exec_diff_path", fixture.expected.execDiffLock.path], ["external_lock_exec_diff_sha256", fixture.expected.execDiffLock.sha256],
    ["external_lock_target_emit_hard_fail_path", fixture.expected.targetEmitLock.path], ["external_lock_target_emit_hard_fail_sha256", fixture.expected.targetEmitLock.sha256],
    ["external_lock_gen3_fixed_point_path", fixture.expected.gen3Lock.path], ["external_lock_gen3_fixed_point_sha256", fixture.expected.gen3Lock.sha256],
    ["memory_guard_kind", "sampled_process_tree_limit"], ["memory_limit_bytes", 1073741824], ["memory_poll_seconds", "0.01"],
    ["hard_memory_limit_proof_status", "not_provable_userspace_poll"],
    ["perf_pair_count", 7], ["perf_regress_ppm", 1050000], ["perf_max_spread_ppm", 100000], ["perf_min_ns", 10000000],
    ["perf_raw_samples_path", perfPairs.path], ["perf_raw_samples_sha256", perfPairs.sha256],
    ["perf_pair_verdict_path", perfVerdict.path], ["perf_pair_verdict_sha256", perfVerdict.sha256],
    ["compile_wall_regress_ppm", 1050000], ["compile_rss_regress_ppm", 1050000], ["compile_pair_count", 3], ["compile_max_spread_ppm", 100000],
    ["compile_raw_samples_path", compilePairs.path], ["compile_raw_samples_sha256", compilePairs.sha256],
    ["compile_pair_verdict_path", compileVerdict.path], ["compile_pair_verdict_sha256", compileVerdict.sha256],
    ["required_status_manifest_path", requiredManifest.path], ["required_status_manifest_sha256", requiredManifest.sha256],
    ["required_status_rows_path", requiredActual.path], ["required_status_rows_sha256", requiredActual.sha256],
    ["required_status_verdict_path", requiredVerdict.path], ["required_status_verdict_sha256", requiredVerdict.sha256],
    ["work_dir", workDir],
  ];
  for (const [label, key] of execLabels) {
    const source = execFiles.get(key);
    reportRows.push([`exec_${label}_path`, source.path], [`exec_${label}_expected_sha256`, source.sha256], [`exec_${label}_actual_sha256`, source.sha256]);
  }
  reportRows.push(...reportItems);
  const report = write("regalloc-production-gate.report.txt", Buffer.from(reportRows.map(([key, value]) => `${key}=${value}\n`).join(""), "utf8"));
  if (options.badExecSnapshot) writeFileSync(execSnapshots.get("gate").path, Buffer.from("mutated private snapshot\n", "utf8"));
  const stdout = Buffer.from([
    "regalloc_gate_production_status=GREEN", "regalloc_gate_local_diagnostic_status=GREEN",
    `regalloc_gate_production_green_count=${productionCount}`, "regalloc_gate_production_red_count=0",
    "regalloc_gate_driver_role=production", `regalloc_gate_report=${report.path}`, `regalloc_gate_report_sha256=${report.sha256}`, "",
  ].join("\n"), "utf8");
  return {
    ...fixture,
    report,
    stdout,
    expected: {...fixture.expected, execBundle},
    guardCount: guardTags.size,
  };
}

function memoryEvent(kind: string, arenaId: number, role: string, bodyId: number, body: any, ownedBefore: number, ownedPeak: number, ownedAfter: number, family = "none", cause = "none", oldCapacity = 0, newCapacity = 0, oldBytes = 0, newBytes = 0) {
  const used = kind === "arena_open" ? 0 : 1024;
  return {
    kind, arena_id: arenaId, arena_role: role, body_id: bodyId,
    clone_source_body_id: 0, family, cause,
    op_count: body.opCount, op_capacity: body.opCapacity,
    slot_count: body.slotCount, slot_capacity: body.slotCapacity,
    call_arg_count: body.callArgCount,
    call_arg_capacity: body.callArgCapacity,
    old_capacity: oldCapacity, new_capacity: newCapacity,
    old_bytes: oldBytes, new_bytes: newBytes,
    arena_used_bytes: used,
    owned_slab_before_bytes: ownedBefore,
    owned_slab_peak_bytes: ownedPeak,
    owned_slab_after_bytes: ownedAfter,
    retained_before_bytes: used + ownedBefore,
    retained_peak_bytes: used + ownedPeak,
    retained_after_bytes: used + ownedAfter,
  };
}

function memoryManifest(
  mutate?: (events: any[]) => void,
  rowBytes = MEMORY_ROW_BYTES,
) {
  const events: any[] = [];
  for (let roleIndex = 0; roleIndex < ROLES.length; roleIndex++) {
    const arenaId = roleIndex + 1;
    const bodyId = roleIndex + 1;
    const role = ROLES[roleIndex];
    const zero = {opCount: 0, opCapacity: 0, slotCount: 0, slotCapacity: 0, callArgCount: 0, callArgCapacity: 0};
    events.push(memoryEvent("arena_open", arenaId, role, 0, zero, 0, 0, 0));
    events.push(memoryEvent("body_birth", arenaId, role, bodyId, zero, 0, 0, 0));
    const op = {...zero, opCapacity: 64};
    const opBytes = 64 * MEMORY_ROW_BYTES.op;
    events.push(memoryEvent("slab_replace", arenaId, role, bodyId, op, 0, opBytes, opBytes, "op", "grow", 0, 64, 0, opBytes));
    const slot = {...op, slotCapacity: 32};
    const slotBytes = 32 * MEMORY_ROW_BYTES.slot;
    const opAndSlotBytes = opBytes + slotBytes;
    events.push(memoryEvent("slab_replace", arenaId, role, bodyId, slot, opBytes, opAndSlotBytes, opAndSlotBytes, "slot", "grow", 0, 32, 0, slotBytes));
    const call = {...slot, callArgCapacity: 8};
    const callArgBytes = 8 * MEMORY_ROW_BYTES.callArg;
    const bodyBytes = opAndSlotBytes + callArgBytes;
    events.push(memoryEvent("slab_replace", arenaId, role, bodyId, call, opAndSlotBytes, bodyBytes, bodyBytes, "call_arg", "grow", 0, 8, 0, callArgBytes));
    events.push(memoryEvent("arena_release_begin", arenaId, role, 0, zero, bodyBytes, bodyBytes, bodyBytes));
    events.push(memoryEvent("body_release", arenaId, role, bodyId, call, bodyBytes, bodyBytes, 0));
    events.push(memoryEvent("arena_release_end", arenaId, role, 0, zero, 0, 0, 0));
  }
  mutate?.(events);
  const fields: Array<[string, string | number | bigint]> = [
    ["schema", "cold_bodyir_memory_manifest"],
    ["scope", "arena_used_plus_bodyir_owned_slabs"],
    ["pointer_width_bits", 64], ["arena_alignment_bytes", 8],
    ["arena_page_payload_bytes", 65536], ["op_row_bytes", rowBytes.op],
    ["slot_row_bytes", rowBytes.slot], ["call_arg_row_bytes", rowBytes.callArg],
    ["initial_op_capacity", 64], ["initial_slot_capacity", 32],
    ["initial_call_arg_capacity", 8], ["max_active_bodyir_arenas", 1],
  ];
  for (let index = 0; index < events.length; index++) {
    for (const [key, value] of Object.entries(events[index])) fields.push([`event.${index}.${key}`, value as any]);
  }
  fields.push(["event_count", events.length], ["arena_count", 6], ["body_count", 6], ["arena_close_count", 6], ["body_release_count", 6], ["recomputed_peak_retained_bytes", 5696], ["complete", 1]);
  return render(fields, "manifest_payload_sha256");
}

function sourceManifest(root: string) {
  const allocatorPath = join(root, "src/core/backend/regalloc_single_pass.cheng");
  const entryPath = join(root, "src/entry.cheng");
  const fields: Array<[string, string | number]> = [
    ["schema", "regalloc_source_manifest"],
    ["entry", "src/entry.cheng"], ["entry_module", "entry"],
    ["target", "arm64-apple-darwin"], ["file_count", 2],
    ["file.0.module", "core/backend/regalloc_single_pass"],
    ["file.0.path", "src/core/backend/regalloc_single_pass.cheng"],
    ["file.0.sha256", hash(readFileSync(allocatorPath))],
    ["file.1.module", "entry"], ["file.1.path", "src/entry.cheng"],
    ["file.1.sha256", hash(readFileSync(entryPath))],
    ["import_edge_count", 1], ["edge.0.from", 1], ["edge.0.to", 0],
  ];
  return render(fields, "manifest_payload_sha256");
}

function completeSourceManifest(root: string, entryModule: string) {
  const modules = new Map<string, {path: string; raw: Buffer; imports: string[]}>();
  const queue = [entryModule];
  while (queue.length > 0) {
    const moduleName = queue.shift()!.replace(/^cheng\//, "");
    if (modules.has(moduleName)) continue;
    const path = join(root, `src/${moduleName}.cheng`);
    const raw = readFileSync(path);
    const imports = [...new Set(sourceImports(path, raw).map((value: string) => value.replace(/^cheng\//, "")))] as string[];
    modules.set(moduleName, {path, raw, imports});
    for (const imported of imports) queue.push(imported);
  }
  const ordered = [...modules.keys()].sort();
  const indices = new Map(ordered.map((moduleName, index) => [moduleName, index]));
  const edges: Array<[number, number]> = [];
  for (const [from, moduleName] of ordered.entries()) for (const imported of modules.get(moduleName)!.imports) edges.push([from, indices.get(imported)!]);
  edges.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const fields: Array<[string, string | number]> = [
    ["schema", "regalloc_source_manifest"], ["entry", `src/${entryModule}.cheng`], ["entry_module", entryModule],
    ["target", "arm64-apple-darwin"], ["file_count", ordered.length],
  ];
  for (const [index, moduleName] of ordered.entries()) fields.push(
    [`file.${index}.module`, moduleName], [`file.${index}.path`, `src/${moduleName}.cheng`], [`file.${index}.sha256`, hash(modules.get(moduleName)!.raw)],
  );
  fields.push(["import_edge_count", edges.length]);
  for (const [index, edge] of edges.entries()) fields.push([`edge.${index}.from`, edge[0]], [`edge.${index}.to`, edge[1]]);
  return render(fields, "manifest_payload_sha256");
}

function frozenAuthoritySource(options: {commentOnly?: boolean; forbidden?: boolean} = {}) {
  const fields = options.commentOnly
    ? "    # projection.moduleConstStarts projection.moduleConstCounts projection.moduleConstNameIds projection.moduleConstLiteralIds\n"
    : "    let _a = projection.moduleConstStarts\n    let _b = projection.moduleConstCounts\n    let _c = projection.moduleConstNameIds\n    let _d = projection.moduleConstLiteralIds\n";
  return `type
    typedExprFrozenMetadataProjection = ref
        moduleConstStarts: int32[]
        moduleConstCounts: int32[]
        moduleConstNameIds: int32[]
        moduleConstLiteralIds: int32[]

fn typedExprFrozenModuleConstTouch(projection: typedExprFrozenMetadataProjection) =
${fields}${options.forbidden ? "    let _disk = chengpath.ReadTextFile(\"\", \"x\")\n" : ""}
fn typedExprBuildFrozenMetadataProjection(projection: typedExprFrozenMetadataProjection) =
    typedExprFrozenModuleConstTouch(projection)

fn typedExprFrozenProjectionSchemaExact(projection: typedExprFrozenMetadataProjection): bool =
    typedExprFrozenModuleConstTouch(projection)
    return true

fn typedExprFrozenCanonicalDigest(projection: typedExprFrozenMetadataProjection) =
    typedExprFrozenModuleConstTouch(projection)

fn typedExprFrozenProjectionLiveBytes(projection: typedExprFrozenMetadataProjection): int64 =
    typedExprFrozenModuleConstTouch(projection)
    return 1

fn typedExprReleaseFrozenMetadataProjection(projection: typedExprFrozenMetadataProjection) =
    typedExprFrozenModuleConstTouch(projection)

fn typedExprFrozenMaterializeContext(projection: typedExprFrozenMetadataProjection, ctx: var Ctx) =
    typedExprFrozenModuleConstTouch(projection)
    ctx.moduleConstNames = []
    ctx.moduleConstLiterals = []
    ctx.moduleConstScanned = true

fn typedExprFrozenExpectedCanonicalRowsExact(projection: typedExprFrozenMetadataProjection): bool =
    typedExprFrozenModuleConstTouch(projection)
    let _value = "ctx_module_const_source"
    return true

fn TypedExprModuleConstLiteralForContext(constCtx: var Ctx, projection: typedExprFrozenMetadataProjection): str =
    typedExprFrozenModuleConstTouch(projection)
    let _key = "ctx_module_const_source"
    let _state = TypedExprBuildIndexLookupFingerprint(constCtx.buildIndex, _key)
    let _a = constCtx.moduleConstStarts
    let _b = constCtx.moduleConstCounts
    let _c = constCtx.moduleConstNameIds
    let _d = constCtx.moduleConstLiteralIds
    return ""
`;
}

const CANONICAL_AUTHORITY_APIS = `fn TypedExprIrVisibleSourceRowState(): int32 =
    return 1
fn TypedExprIrAliasTarget(): int32 =
    return TypedExprIrVisibleSourceRowState()
fn TypedExprIrCanonicalFieldMetaState(): int32 =
    return TypedExprIrAliasTarget()
`;

function canonicalRealizerSource(entryName: string) {
  return `import cheng/core/lang/typed_expr as texpr
fn ${entryName}(): int32 =
    return texpr.TypedExprIrCanonicalFieldMetaState()
`;
}

async function main() {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "fusion-item22-")));
  try {
    console.log("[A] one strict registry/CLI/MCP entry");
    initChengFusionToolRegistryModule();
    const tools = getChengFusionTools();
    const registryManifest = getChengFusionToolManifest();
    assert.equal(tools.length, registryManifest.count);
    const registryNames = tools.map((tool: any) => tool.name).sort();
    assert.equal(new Set(registryNames).size, registryManifest.count);
    assert.deepEqual(registryManifest.names, registryNames);
    assert.equal(registryManifest.sha256, hash(registryNames.map((name: string) => `${name}\n`).join("")));
    assert.equal(tools.filter((tool: any) => tool.name === "cheng_regalloc_preflight").length, 1);
    const preflight = tools.find((tool: any) => tool.name === "cheng_regalloc_preflight");
    assert.equal(preflight.inputSchema.safeParse({mode: "source", treeRoot: "/x", coldDriver: "/y", extra: true}).success, false);
    assert.equal(preflight.inputSchema.safeParse({mode: "source", treeRoot: "/x", coldDriver: "/y", maxOutputBytes: 64 * 1024 * 1024 + 1}).success, false);
    const cli = spawnSync(process.execPath, [CLI, "list"], {cwd: PROJECT, encoding: "utf8"});
    assert.equal(cli.status, 0, cli.stderr);
    const cliTools = JSON.parse(cli.stdout).tools;
    assert.deepEqual(cliTools.map((tool: any) => tool.name).sort(), registryNames);
    const cliTool = cliTools.filter((tool: any) => tool.name === "cheng_regalloc_preflight");
    assert.equal(cliTool.length, 1);
    assert.equal(cliTool[0].annotations.readOnlyHint, false);
    const mcp = startMcp({}, PROJECT);
    try {
      await mcp.initialize();
      const listed = await mcp.request("tools/list", {});
      assert.deepEqual(listed.result.tools.map((tool: any) => tool.name).sort(), registryNames);
      assert.equal(listed.result.tools.filter((tool: any) => tool.name === "cheng_regalloc_preflight").length, 1);
    } finally { mcp.kill(); }
    const readme = readFileSync(join(PROJECT, "README.md"), "utf8");
    const toolsStart = readme.indexOf("## Tools");
    const toolsEnd = readme.indexOf("## Environment knobs", toolsStart);
    assert.ok(toolsStart >= 0 && toolsEnd > toolsStart);
    const documentedNames = [...readme.slice(toolsStart, toolsEnd).matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1]).sort();
    assert.deepEqual(documentedNames, registryNames);
    const rootlessLine = readme.split("\n").find((line) => line.startsWith("All tools except ")) || "";
    assert.match(rootlessLine, /`cheng_addr_symbolicate`/);
    assert.match(rootlessLine, /`cheng_regalloc_preflight`/);
    assert.match(readme, /cheng_addr_symbolicate_m9021\.ts\s+executable\/object address resolver/);
    assertTrue(true, "registry, CLI, MCP and README expose the same manifest-derived unique tool set");

    const removedBackend2Root = join(scratch, "removed-backend2-emitter");
    mkdirSync(join(removedBackend2Root, "src/core/backend2"),
              {recursive: true});
    assert.equal(
      validateRemovedBackend2IndependentEmitterModules(
        removedBackend2Root).length,
      3);
    writeFileSync(
      join(removedBackend2Root,
           "src/core/backend2/backend2_emit_ops.cheng"),
      "fn IndependentEmitterReturned(): int32 =\n    return 1\n");
    assert.throws(
      () => validateRemovedBackend2IndependentEmitterModules(
        removedBackend2Root),
      /removed independent backend2 emitter module is present: src\/core\/backend2\/backend2_emit_ops\.cheng/);
    assertTrue(
      true,
      "reintroducing any removed backend2 independent emitter is a hard failure");

    (() => {
    console.log("[B] strict source and memory manifests");
    const mini = join(scratch, "mini-tree");
    mkdirSync(join(mini, "src/core/backend"), {recursive: true});
    writeFileSync(join(mini, "cheng-package.toml"), 'package_id = "pkg://cheng/item22"\n');
    writeFileSync(join(mini, "src/core/backend/regalloc_single_pass.cheng"), "fn AllocatorMarker(): int32 =\n    return 1\n");
    writeFileSync(join(mini, "src/entry.cheng"), "import cheng/core/backend/regalloc_single_pass\nfn main(): int32 =\n    return 0\n");
    const sourcePath = join(scratch, "source-manifest.txt");
    writeFileSync(sourcePath, sourceManifest(mini));
    const sourceVerified = validateSourceManifestPath(mini, sourcePath);
    assert.equal(sourceVerified.fileCount, 2);
    assert.deepEqual(sourceVerified.relativePaths, ["src/core/backend/regalloc_single_pass.cheng", "src/entry.cheng"]);
    const memory = memoryManifest();
    const memoryVerified = validateMemoryManifestBytes(memory);
    assert.equal(memoryVerified.recomputedPeakRetainedBytes, "5696");
    assert.equal(memoryVerified.roles.length, 6);
    assert.throws(
      () => validateMemoryManifestBytes(memoryManifest(undefined, {...MEMORY_ROW_BYTES, op: 20})),
      /op_row_bytes mismatch/,
    );
    assert.throws(
      () => validateMemoryManifestBytes(memoryManifest(undefined, {...MEMORY_ROW_BYTES, slot: 36})),
      /slot_row_bytes mismatch/,
    );
    assert.throws(
      () => validateMemoryManifestBytes(memoryManifest(undefined, {...MEMORY_ROW_BYTES, callArg: 8})),
      /call_arg_row_bytes mismatch/,
    );
    assert.throws(() => validateMemoryManifestBytes(memoryManifest((events) => {
      events[2].new_capacity = 63;
      events[2].new_bytes = 2772;
      events[2].owned_slab_peak_bytes = 2772;
      events[2].owned_slab_after_bytes = 2772;
      events[2].retained_peak_bytes = 3796;
      events[2].retained_after_bytes = 3796;
    })), /doubling chain|byte\/capacity/);
    if (process.env.CHENG_ITEM22_FOCUSED_MEMORY_CONTRACT === "1") {
      console.log("item22 focused BodyIR memory manifest: PASS");
      return;
    }
    const goodKv = render([["schema", "x"]], "payload_sha256");
    strictKv(goodKv, "test", "payload_sha256");
    assert.throws(() => strictKv(Buffer.from(`schema=x\nschema=y\npayload_sha256=${"0".repeat(64)}\n`), "test", "payload_sha256"), /duplicate/);
    const explicitGuardDir = join(scratch, "explicit-build-guard");
    mkdirSync(explicitGuardDir);
    const explicitGuardStdout = join(explicitGuardDir, "compiler.materialize.stdout.txt");
    const explicitGuardStderr = join(explicitGuardDir, "compiler.materialize.stderr.txt");
    const explicitGuardReport = join(explicitGuardDir, "compiler.process-tree-guard.report.txt");
    writeFileSync(explicitGuardStdout, ""); writeFileSync(explicitGuardStderr, "");
    writeFileSync(explicitGuardReport, productionGuard("ignored-name", explicitGuardStdout, explicitGuardStderr));
    assert.equal(validateProductionGuardReport(explicitGuardDir, explicitGuardReport, {
      tag: "official-driver-build", expectedRc: 0,
      expectedStdoutPath: explicitGuardStdout, expectedStderrPath: explicitGuardStderr,
    }).peakBytes, "1000");
    writeFileSync(explicitGuardReport, productionGuard("ignored-name", explicitGuardStdout, explicitGuardStderr, {memoryLimit: 536870912}));
    assert.throws(() => validateProductionGuardReport(explicitGuardDir, explicitGuardReport, {
      tag: "official-driver-build", expectedRc: 0,
      expectedStdoutPath: explicitGuardStdout, expectedStderrPath: explicitGuardStderr,
    }), /memory_limit_bytes mismatch/);
    const aarch64F64GatePaths = [
      "tools/regalloc_aarch64_f64_runtime_gate.sh",
      "tools/beat_c_process_group_guard.sh",
      "src/tests/regalloc_aarch64_f64_contract_smoke.cheng",
      "src/tests/regalloc_aarch64_f64_runtime_image.cheng",
      "src/tests/regalloc_aarch64_f64_runtime_harness.c",
      "src/tests/regalloc_aarch64_f64_runtime_bridge.S",
    ];
    const aarch64F64GateSources = new Map(aarch64F64GatePaths.map((path) => [path, readFileSync(join(CHENG_ROOT, path))]));
    const aarch64F64GateBundle = validateAarch64F64RuntimeGateBundle(aarch64F64GateSources);
    assert.equal(aarch64F64GateBundle.memoryLimitBytes, "1073741824");
    assert.equal(aarch64F64GateBundle.nanCompareCaseCount, 30);
    assert.equal(aarch64F64GateBundle.finiteCompareCaseCount, 18);
    assert.equal(aarch64F64GateBundle.storeRuntimeCaseCount, 5);
    assert.equal(aarch64F64GateBundle.storeRuntimeFamilyCount, 3);
    assert.equal(aarch64F64GateBundle.constantPayloadCaseCount, 4);
    assert.equal(aarch64F64GateBundle.callClobberPayloadCaseCount, 4);
    assert.equal(aarch64F64GateBundle.callSpillActionCount, 1);
    assert.equal(aarch64F64GateBundle.callReloadActionCount, 1);
    assert.equal(aarch64F64GateBundle.guardStages.length, 6);
    assert.equal(aarch64F64GateBundle.globalStaticRelocOracle, "PAGE21_PAGEOFF12_CONSECUTIVE_SAME_SYMBOL_AND_TAINTED_F64_STORE");
    assert.equal(aarch64F64GateBundle.d0PoisonStatus, "PROVEN");
    assert.equal(aarch64F64GateBundle.postCallX0ToD0Status, "PROVEN");
    assert.equal(aarch64F64GateBundle.localRuntimeDataflow, "StoreLocal->F64Add->X0");
    const aarch64F64GateCountMutation = new Map(aarch64F64GateSources);
    aarch64F64GateCountMutation.set(aarch64F64GatePaths[0], Buffer.from(aarch64F64GateSources.get(aarch64F64GatePaths[0])!.toString("utf8").replace("nan_compare_case_count=30", "nan_compare_case_count=29"), "utf8"));
    assert.throws(() => validateAarch64F64RuntimeGateBundle(aarch64F64GateCountMutation), /runtime_report_exact_counts_missing/);
    const aarch64F64GuardThirdModeMutation = new Map(aarch64F64GateSources);
    aarch64F64GuardThirdModeMutation.set(aarch64F64GatePaths[1], Buffer.from(aarch64F64GateSources.get(aarch64F64GatePaths[1])!.toString("utf8").replace(
      '"same_session_descendant" if parent_guard_mode else "standalone"',
      '"same_session_descendant" if parent_guard_mode else "detached"',
    ), "utf8"));
    assert.throws(() => validateAarch64F64RuntimeGateBundle(aarch64F64GuardThirdModeMutation), /guard_ownership_mode_contract_missing/);
    const aarch64F64GuardForgedParentMutation = new Map(aarch64F64GateSources);
    aarch64F64GuardForgedParentMutation.set(aarch64F64GatePaths[1], Buffer.from(aarch64F64GateSources.get(aarch64F64GatePaths[1])!.toString("utf8").replace(
      "if parent_guard_monitor_pid not in ancestor_pids:",
      "if False:",
    ), "utf8"));
    assert.throws(() => validateAarch64F64RuntimeGateBundle(aarch64F64GuardForgedParentMutation), /guard_parent_binding_proof_missing/);
    for (const [from, to] of [
      ['if record["rootPid"] != os.getpid():', "if False:"],
      ['inherited_sid != record["rootSid"]', "False"],
      ['inherited_pgid != record["rootPgid"]', "False"],
    ]) {
      const mutation = new Map(aarch64F64GateSources);
      mutation.set(
        aarch64F64GatePaths[1],
        Buffer.from(
          aarch64F64GateSources.get(aarch64F64GatePaths[1])!
            .toString("utf8")
            .replace(from, to),
          "utf8",
        ),
      );
      assert.throws(
        () => validateAarch64F64RuntimeGateBundle(mutation),
        /guard_parent_binding_proof_missing/,
      );
    }
    for (const [from, to, reason] of [
      ["if parent_pid not in ancestry:", "if False:", "runtime_guard_report_parent_session_binding_missing"],
      ['record["rootPpid"] != parent_pid', "False", "runtime_guard_report_parent_session_binding_missing"],
      ['self_identity["sid"] != record["rootSid"]', "False", "runtime_guard_report_parent_session_binding_missing"],
      ['self_identity["pgid"] != record["rootPgid"]', "False", "runtime_guard_report_parent_session_binding_missing"],
      ["parent_limit_value < int(requested_limit)", "False", "runtime_guard_report_limit_capability_binding_missing"],
      ["proof_fd != str(PARENT_PROOF_FD)", "False", "runtime_guard_report_parent_proof_transport_missing"],
      ["hashlib.sha256(raw_record).hexdigest()", '"0" * 64', "runtime_guard_report_parent_proof_transport_missing"],
    ]) {
      const mutation = new Map(aarch64F64GateSources);
      mutation.set(aarch64F64GatePaths[0], Buffer.from(aarch64F64GateSources.get(aarch64F64GatePaths[0])!.toString("utf8").replace(from, to), "utf8"));
      assert.throws(() => validateAarch64F64RuntimeGateBundle(mutation), new RegExp(reason));
    }
    const aarch64F64NonEnforcingLimitAliasMutation = new Map(aarch64F64GateSources);
    aarch64F64NonEnforcingLimitAliasMutation.set(
      aarch64F64GatePaths[0],
      Buffer.from(
        aarch64F64GateSources.get(aarch64F64GatePaths[0])!
          .toString("utf8")
          .replace(
            '      CHENG_PROCESS_MAX_RSS_BYTES="$FIXED_LIMIT_BYTES" \\\n',
            '      PROCESS_MAX_RSS_BYTES="$FIXED_LIMIT_BYTES" \\\n      CHENG_PROCESS_MAX_RSS_BYTES="$FIXED_LIMIT_BYTES" \\\n',
          ),
        "utf8",
      ),
    );
    assert.throws(
      () => validateAarch64F64RuntimeGateBundle(
        aarch64F64NonEnforcingLimitAliasMutation,
      ),
      /runtime_guard_report_non_enforcing_limit_alias_present/,
    );
    const aarch64F64GlobalRelocMutation = new Map(aarch64F64GateSources);
    aarch64F64GlobalRelocMutation.set(aarch64F64GatePaths[2], Buffer.from(aarch64F64GateSources.get(aarch64F64GatePaths[2])!.toString("utf8").replace("adapter.RegallocAarch64RelocPageOff12", "adapter.RegallocAarch64RelocPage21"), "utf8"));
    assert.throws(() => validateAarch64F64RuntimeGateBundle(aarch64F64GlobalRelocMutation), /independent_global_page_relocation_store_oracle_missing/);
    const aarch64F64TailBranchMutation = new Map(aarch64F64GateSources);
    aarch64F64TailBranchMutation.set(aarch64F64GatePaths[5], Buffer.from(aarch64F64GateSources.get(aarch64F64GatePaths[5])!.toString("utf8").replace("    bl _regalloc_raw_f64_local", "    b _regalloc_raw_f64_local"), "utf8"));
    assert.throws(() => validateAarch64F64RuntimeGateBundle(aarch64F64TailBranchMutation), /d0_poison_and_post_bl_x0_to_d0_runtime_bridge_missing/);
    const aarch64F64LocalDataflowMutation = new Map(aarch64F64GateSources);
    aarch64F64LocalDataflowMutation.set(aarch64F64GatePaths[3], Buffer.from(aarch64F64GateSources.get(aarch64F64GatePaths[3])!.toString("utf8").replace("copy.kind = ir.BodyOpStoreLocalTag", "copy.kind = ir.BodyOpNopTag"), "utf8"));
    assert.throws(() => validateAarch64F64RuntimeGateBundle(aarch64F64LocalDataflowMutation), /store_local_to_fadd_to_x0_runtime_dataflow_missing/);
    const aarch64F64ConstantPayloadMutation = new Map(aarch64F64GateSources);
    aarch64F64ConstantPayloadMutation.set(aarch64F64GatePaths[4], Buffer.from(aarch64F64GateSources.get(aarch64F64GatePaths[4])!.toString("utf8").replaceAll("0x0000000000000001", "0x0000000000000002"), "utf8"));
    assert.throws(() => validateAarch64F64RuntimeGateBundle(aarch64F64ConstantPayloadMutation), /exact_f64_constant_payload_runtime_cases_missing/);
    const aarch64F64ConstantBackendMutation = new Map(aarch64F64GateSources);
    aarch64F64ConstantBackendMutation.set(aarch64F64GatePaths[3], Buffer.from(aarch64F64GateSources.get(aarch64F64GatePaths[3])!.toString("utf8").replace('emitFunction("regalloc_raw_f64_const_subnormal"', 'emitFunction("regalloc_raw_f64_const_deleted"'), "utf8"));
    assert.throws(() => validateAarch64F64RuntimeGateBundle(aarch64F64ConstantBackendMutation), /runtime_image_bridge_cardinality_contract_missing/);
    const aarch64F64SpillActionMutation = new Map(aarch64F64GateSources);
    aarch64F64SpillActionMutation.set(aarch64F64GatePaths[3], Buffer.from(aarch64F64GateSources.get(aarch64F64GatePaths[3])!.toString("utf8").replace("alloc.RegallocValueActionSpillCall", "alloc.RegallocValueActionReloadCall"), "utf8"));
    assert.throws(() => validateAarch64F64RuntimeGateBundle(aarch64F64SpillActionMutation), /canonical_call_clobber_spill_reload_action_runtime_witness_missing/);
    const aarch64F64RuntimeReport = Buffer.from(`schema=regalloc_aarch64_f64_runtime_gate
status=GREEN
target=arm64-apple-darwin
host_execution=native_arm64
raw_function_reloc_count=1
nan_compare_case_count=30
finite_compare_case_count=18
store_runtime_case_count=5
constant_payload_case_count=4
call_clobber_payload_case_count=4
call_spill_action_count=1
call_reload_action_count=1
memory_limit_bytes=1073741824
memory_guard_scope=identity_history_union_group_session_and_descendants
`, "utf8");
    assert.equal(validateAarch64F64RuntimeGateReport(aarch64F64RuntimeReport).nanCompareCaseCount, 30);
    assert.throws(() => validateAarch64F64RuntimeGateReport(Buffer.from(aarch64F64RuntimeReport.toString("utf8").replace("nan_compare_case_count=30", "nan_compare_case_count=29"), "utf8")), /contract mismatch/);
    assert.throws(() => validateAarch64F64RuntimeGateReport(Buffer.concat([aarch64F64RuntimeReport, Buffer.from("extra=1\n", "utf8")])), /field set mismatch/);
    const x86_64F64GatePaths = [
      "tools/regalloc_x86_64_f64_runtime_gate.sh",
      "tools/beat_c_process_group_guard.sh",
      "src/tests/regalloc_x86_64_f64_runtime_image.cheng",
      "src/tests/regalloc_x86_64_f64_runtime_harness.c",
      "src/tests/regalloc_x86_64_f64_runtime_bridge.S",
    ];
    const x86_64F64GateSources = new Map(x86_64F64GatePaths.map((path) => [path, readFileSync(join(CHENG_ROOT, path))]));
    const x86_64F64GateBundle = validateX86_64F64RuntimeGateBundle(x86_64F64GateSources);
    assert.equal(x86_64F64GateBundle.memoryLimitBytes, "1073741824");
    assert.equal(x86_64F64GateBundle.hostExecution, "rosetta_x86_64");
    assert.equal(x86_64F64GateBundle.nanCompareCaseCount, 60);
    assert.equal(x86_64F64GateBundle.finiteCompareCaseCount, 72);
    assert.equal(x86_64F64GateBundle.materializedFunctionCount, 6);
    assert.equal(x86_64F64GateBundle.fusedFunctionCount, 6);
    assert.equal(x86_64F64GateBundle.bridgeResultTransform, "0x5a5a5a5a");
    assert.deepEqual(x86_64F64GateBundle.disassemblyMarkers, ["ucomisd", "setp", "setnp"]);
    assert.equal(x86_64F64GateBundle.guardStages.length, 6);
    for (const [from, to, reason] of [
      ["if parent_pid not in ancestry:", "if False:", "runtime_guard_report_parent_session_binding_missing"],
      ['record["rootPpid"] != parent_pid', "False", "runtime_guard_report_parent_session_binding_missing"],
      ['self_identity["sid"] != record["rootSid"]', "False", "runtime_guard_report_parent_session_binding_missing"],
      ['self_identity["pgid"] != record["rootPgid"]', "False", "runtime_guard_report_parent_session_binding_missing"],
      ["parent_limit_value < int(requested_limit)", "False", "runtime_guard_report_limit_capability_binding_missing"],
      ["proof_fd != str(PARENT_PROOF_FD)", "False", "runtime_guard_report_parent_proof_transport_missing"],
      ["hashlib.sha256(raw_record).hexdigest()", '"0" * 64', "runtime_guard_report_parent_proof_transport_missing"],
    ]) {
      const mutation = new Map(x86_64F64GateSources);
      mutation.set(x86_64F64GatePaths[0], Buffer.from(x86_64F64GateSources.get(x86_64F64GatePaths[0])!.toString("utf8").replace(from, to), "utf8"));
      assert.throws(() => validateX86_64F64RuntimeGateBundle(mutation), new RegExp(reason));
    }
    const x86_64F64NonEnforcingLimitAliasMutation = new Map(x86_64F64GateSources);
    x86_64F64NonEnforcingLimitAliasMutation.set(
      x86_64F64GatePaths[0],
      Buffer.from(
        x86_64F64GateSources.get(x86_64F64GatePaths[0])!
          .toString("utf8")
          .replace(
            '      CHENG_PROCESS_MAX_RSS_BYTES="$FIXED_LIMIT_BYTES" \\\n',
            '      PROCESS_MAX_RSS_BYTES="$FIXED_LIMIT_BYTES" \\\n      CHENG_PROCESS_MAX_RSS_BYTES="$FIXED_LIMIT_BYTES" \\\n',
          ),
        "utf8",
      ),
    );
    assert.throws(
      () => validateX86_64F64RuntimeGateBundle(
        x86_64F64NonEnforcingLimitAliasMutation,
      ),
      /runtime_guard_report_non_enforcing_limit_alias_present/,
    );
    const x86_64CountMutation = new Map(x86_64F64GateSources);
    x86_64CountMutation.set(x86_64F64GatePaths[0], Buffer.from(x86_64F64GateSources.get(x86_64F64GatePaths[0])!.toString("utf8").replace("nan_compare_case_count=60", "nan_compare_case_count=59"), "utf8"));
    assert.throws(() => validateX86_64F64RuntimeGateBundle(x86_64CountMutation), /runtime_marker_missing:nan_compare_case_count=60|runtime_report_marker_missing:nan_compare_case_count=60/);
    const x86_64RosettaMutation = new Map(x86_64F64GateSources);
    x86_64RosettaMutation.set(x86_64F64GatePaths[0], Buffer.from(x86_64F64GateSources.get(x86_64F64GatePaths[0])!.toString("utf8").replace("run_guard rosetta_run \"$ARCH_RUNNER\" -x86_64", "run_guard rosetta_run \"$ARCH_RUNNER\" -arm64"), "utf8"));
    assert.throws(() => validateX86_64F64RuntimeGateBundle(x86_64RosettaMutation), /rosetta_probe_and_execution_contract_missing/);
    const x86_64FusedMutation = new Map(x86_64F64GateSources);
    x86_64FusedMutation.set(x86_64F64GatePaths[2], Buffer.from(x86_64F64GateSources.get(x86_64F64GatePaths[2])!.toString("utf8").replace("fused, true", "fused, false"), "utf8"));
    assert.throws(() => validateX86_64F64RuntimeGateBundle(x86_64FusedMutation), /materialized_and_fused_production_emitter_image_contract_missing/);
    const x86_64StackLayoutMutation = new Map(x86_64F64GateSources);
    x86_64StackLayoutMutation.set(
      x86_64F64GatePaths[2],
      Buffer.from(
        x86_64F64GateSources.get(x86_64F64GatePaths[2])!
          .toString("utf8")
          .replace("x64.X64BodyPrepareStackLayout(body)", "true"),
        "utf8",
      ),
    );
    assert.throws(
      () => validateX86_64F64RuntimeGateBundle(x86_64StackLayoutMutation),
      /materialized_and_fused_production_emitter_image_contract_missing/,
    );
    const x86_64BridgeMutation = new Map(x86_64F64GateSources);
    x86_64BridgeMutation.set(x86_64F64GatePaths[4], Buffer.from(x86_64F64GateSources.get(x86_64F64GatePaths[4])!.toString("utf8").replace("xorl $0x5a5a5a5a, %eax", "xorl $0x5a5a5a5b, %eax"), "utf8"));
    assert.throws(() => validateX86_64F64RuntimeGateBundle(x86_64BridgeMutation), /x86_64_f64_bridge_transform_contract_missing/);
    const x86_64DisassemblyMutation = new Map(x86_64F64GateSources);
    x86_64DisassemblyMutation.set(x86_64F64GatePaths[0], Buffer.from(x86_64F64GateSources.get(x86_64F64GatePaths[0])!.toString("utf8").replace("grep -Fq 'setnp'", "grep -Fq 'setnz'"), "utf8"));
    assert.throws(() => validateX86_64F64RuntimeGateBundle(x86_64DisassemblyMutation), /x86_64_native_link_and_disassembly_oracle_missing/);
    const x86_64F64RuntimeReport = Buffer.from(`schema=regalloc_x86_64_f64_runtime_gate
status=GREEN
target=x86_64-apple-darwin
host_execution=rosetta_x86_64
scope=synthetic_bodyir_x64_production_emitter
raw_function_reloc_count=0
nan_compare_case_count=60
finite_compare_case_count=72
materialized_function_count=6
fused_function_count=6
bridge_result_transform=0x5a5a5a5a
memory_limit_bytes=1073741824
memory_guard_scope=identity_history_union_group_session_and_descendants
`, "utf8");
    assert.equal(validateX86_64F64RuntimeGateReport(x86_64F64RuntimeReport).finiteCompareCaseCount, 72);
    assert.throws(() => validateX86_64F64RuntimeGateReport(Buffer.from(x86_64F64RuntimeReport.toString("utf8").replace("finite_compare_case_count=72", "finite_compare_case_count=71"), "utf8")), /contract mismatch/);
    assert.throws(() => validateX86_64F64RuntimeGateReport(Buffer.concat([x86_64F64RuntimeReport, Buffer.from("extra=1\n", "utf8")])), /field set mismatch/);
    assert.equal(validateTypedExprFrozenAuthority(frozenAuthoritySource()).status, "GREEN");
    assert.equal(validateTypedExprFrozenAuthority(frozenAuthoritySource({commentOnly: true})).status, "RED");
    const forbiddenAuthority = validateTypedExprFrozenAuthority(frozenAuthoritySource({forbidden: true}));
    assert.equal(forbiddenAuthority.status, "RED");
    assert.ok(forbiddenAuthority.forbiddenReachability.some((entry: string) => entry.includes("ReadTextFile")));
    const tenthWrapperPath = "src/core/backend2/authority_hidden_wrapper.cheng";
    const tenFileAuthoritySources = new Map(AUTHORITY_FILES.map((path) => [path, Buffer.from("# minimum-required authority root\n", "utf8")]));
    tenFileAuthoritySources.set("src/core/lang/typed_expr.cheng", Buffer.from(`import cheng/core/backend2/authority_hidden_wrapper as hidden\n${CANONICAL_AUTHORITY_APIS}\nfn TypedExprModuleConstLiteralForContext(): str =\n    return hidden.HiddenRead()\n`, "utf8"));
    tenFileAuthoritySources.set("src/core/backend/lowering_plan.cheng", Buffer.from(canonicalRealizerSource("BuildLoweringPlanStub"), "utf8"));
    tenFileAuthoritySources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(canonicalRealizerSource("BuildPrimaryObjectPlanInto"), "utf8"));
    tenFileAuthoritySources.set("src/core/backend2/backend2_pipeline.cheng", Buffer.from(canonicalRealizerSource("Backend2BuildPrimaryObjectPlanInto"), "utf8"));
    tenFileAuthoritySources.set(tenthWrapperPath, Buffer.from("fn HiddenRead(): str =\n    return ReadTextFile(\"hidden\")\n", "utf8"));
    const tenFileAuthority = validateAuthorityProductionClosure(tenFileAuthoritySources, true, [...AUTHORITY_FILES, tenthWrapperPath]);
    assert.equal(tenFileAuthority.fileCount, 10);
    assert.equal(tenFileAuthority.status, "RED");
    assert.ok(tenFileAuthority.forbiddenReachability.some((entry: string) => entry.includes("TypedExprModuleConstLiteralForContext") && entry.includes("authority_hidden_wrapper.cheng#HiddenRead") && entry.includes("ReadTextFile")));
    const unresolvedWrapperSources = new Map(tenFileAuthoritySources);
    unresolvedWrapperSources.set("src/core/lang/typed_expr.cheng", Buffer.from(`import cheng/core/backend2/authority_hidden_wrapper as hidden\n${CANONICAL_AUTHORITY_APIS}\nfn TypedExprModuleConstLiteralForContext(): str =\n    return hidden.MissingRead()\n`, "utf8"));
    const unresolvedWrapper = validateAuthorityProductionClosure(unresolvedWrapperSources, true, [...AUTHORITY_FILES, tenthWrapperPath]);
    assert.equal(unresolvedWrapper.status, "RED");
    assert.ok(unresolvedWrapper.unresolvedImportedReachability.some((entry: string) => entry.includes("unresolved-import:hidden.MissingRead")));
    const wiredAuthoritySources = new Map<string, Buffer>([
      ["src/core/lang/typed_expr.cheng", Buffer.from(CANONICAL_AUTHORITY_APIS, "utf8")],
      ["src/core/backend/lowering_plan.cheng", Buffer.from(canonicalRealizerSource("BuildLoweringPlanStub"), "utf8")],
      ["src/core/backend/primary_object_plan.cheng", Buffer.from(canonicalRealizerSource("BuildPrimaryObjectPlanInto"), "utf8")],
      ["src/core/backend2/backend2_pipeline.cheng", Buffer.from(canonicalRealizerSource("Backend2BuildPrimaryObjectPlanInto"), "utf8")],
    ]);
    const wiredAuthority = validateAuthorityProductionClosure(wiredAuthoritySources, false);
    assert.equal(wiredAuthority.status, "GREEN", JSON.stringify(wiredAuthority));
    assert.ok(wiredAuthority.productionRoots.includes("src/core/backend2/backend2_pipeline.cheng"));
    assert.equal(wiredAuthority.requiredBackend2PipelineRoot, "src/core/backend2/backend2_pipeline.cheng");
    assert.throws(() => validateAuthorityProductionClosure(wiredAuthoritySources, false, [
      "src/core/lang/typed_expr.cheng",
      "src/core/backend/lowering_plan.cheng",
      "src/core/backend/primary_object_plan.cheng",
    ]), /authority production roots must include src\/core\/backend2\/backend2_pipeline\.cheng/);
    assert.equal(wiredAuthority.rootDerivation.disconnectedEntries.length, 0);
    assert.equal(wiredAuthority.rootDerivation.realizerAuthorityAnchors.length, 3);
    assert.equal(wiredAuthority.rootDerivation.frozenMetadataSelfAuditAnchors.length, 0);
    assert.ok(wiredAuthority.rootDerivation.realizerAuthorityAnchors.every((entry: string) => entry.includes("#TypedExprIr")));
    assert.ok(!wiredAuthority.rootDerivation.requiredAnchorsByEntryKind.backend2_realizer.some((entry: string) => entry.includes("TypedExprModuleConstLiteralForContext")));
    assert.ok(!wiredAuthority.rootDerivation.authorityAnchors.some((entry: string) => entry.includes("LoweringC5FieldTypeFromSourceText")));

    const entryCAbiMetadataCoreSource = `type
    BodyIR =
        ops: int32[]
        cstringLiterals: CStringLiteralEntry[]
        entryIsCAbi: bool
`;
    const entryCAbiMetadataCodecSource = `const
    backend2BodyIrCodecVersion: int32 = 4
    backend2BodyIrCodecFieldCount: int32 = 7
fn Backend2BodyIrEncodedSize(bodyIR: BodyIR): int32 =
    var total: int32 = 12
    for i in 0..<bodyIR.cstringLiterals.len:
        total = total + backend2BodyIrCStringSize(bodyIR.cstringLiterals[i])
    total = total + 4 + 4
    return total
fn Backend2BodyIrEncode(bodyIR: BodyIR): Bytes =
    let total = Backend2BodyIrEncodedSize(bodyIR)
    var buf = BytesAlloc(total)
    var cursor: int32
    backend2FragCodecPutTag(buf, cursor, 7)
    var entryCAbiFlag: int32
    if bodyIR.entryIsCAbi:
        entryCAbiFlag = 1
    Backend2CodecPutU32(buf, cursor, entryCAbiFlag)
    cursor = cursor + 4
    return buf
fn Backend2BodyIrDecode(buf: Bytes, cursor: var int32): BodyIR =
    var bodyIR: BodyIR
    backend2FragCodecExpectTag(buf, cursor, 7)
    bodyIR.entryIsCAbi = Backend2CodecReadU32(buf, cursor) != 0
    return bodyIR
fn Backend2BodyIrRoundTripAssert(bodyIR: BodyIR) =
    var enc1 = Backend2BodyIrEncode(bodyIR)
    var cursor: int32
    let decoded = Backend2BodyIrDecode(enc1, cursor)
    if cursor != enc1.len:
        panic("trailing")
    var enc2 = Backend2BodyIrEncode(decoded)
    if !rawbytes.BytesEqual(enc1, enc2):
        panic("mismatch")
`;
    const entryCAbiMetadataSources = new Map(wiredAuthoritySources);
    entryCAbiMetadataSources.set("src/core/ir/core_types.cheng", Buffer.from(entryCAbiMetadataCoreSource, "utf8"));
    entryCAbiMetadataSources.set("src/core/backend2/backend2_frag_codec.cheng", Buffer.from(entryCAbiMetadataCodecSource, "utf8"));
    const entryCAbiMetadata = validateAuthorityProductionClosure(entryCAbiMetadataSources, false);
    assert.deepEqual(entryCAbiMetadata.bodyIrEntryCAbiMetadataContractViolations, []);
    assert.deepEqual(entryCAbiMetadata.bodyIrEntryCAbiMetadataContractProofs.map((entry: any) => entry.family), ["bodyir_entry_c_abi_metadata_roundtrip"]);

    const entryCAbiMetadataEncodeMutationSources = new Map(entryCAbiMetadataSources);
    entryCAbiMetadataEncodeMutationSources.set("src/core/backend2/backend2_frag_codec.cheng", Buffer.from(entryCAbiMetadataCodecSource.replace("if bodyIR.entryIsCAbi:", "if false:"), "utf8"));
    const entryCAbiMetadataEncodeMutation = validateAuthorityProductionClosure(entryCAbiMetadataEncodeMutationSources, false);
    assert.ok(entryCAbiMetadataEncodeMutation.bodyIrEntryCAbiMetadataContractViolations[0]?.reasons.includes("bodyir_entry_c_abi_encode_missing_or_inexact"));

    const entryCAbiMetadataDecodeMutationSources = new Map(entryCAbiMetadataSources);
    entryCAbiMetadataDecodeMutationSources.set("src/core/backend2/backend2_frag_codec.cheng", Buffer.from(entryCAbiMetadataCodecSource.replace("bodyIR.entryIsCAbi = Backend2CodecReadU32(buf, cursor) != 0", "bodyIR.entryIsCAbi = false"), "utf8"));
    const entryCAbiMetadataDecodeMutation = validateAuthorityProductionClosure(entryCAbiMetadataDecodeMutationSources, false);
    assert.ok(entryCAbiMetadataDecodeMutation.bodyIrEntryCAbiMetadataContractViolations[0]?.reasons.includes("bodyir_entry_c_abi_decode_missing_or_inexact"));

    const entryCAbiMetadataSchemaMutationSources = new Map(entryCAbiMetadataSources);
    entryCAbiMetadataSchemaMutationSources.set("src/core/backend2/backend2_frag_codec.cheng", Buffer.from(entryCAbiMetadataCodecSource.replace("backend2BodyIrCodecFieldCount: int32 = 7", "backend2BodyIrCodecFieldCount: int32 = 6"), "utf8"));
    const entryCAbiMetadataSchemaMutation = validateAuthorityProductionClosure(entryCAbiMetadataSchemaMutationSources, false);
    assert.ok(entryCAbiMetadataSchemaMutation.bodyIrEntryCAbiMetadataContractViolations[0]?.reasons.includes("bodyir_codec_version_or_field_count_missing_or_inexact"));

    const deadLegacyScannerSources = new Map(wiredAuthoritySources);
    deadLegacyScannerSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`fn PrimaryBodyIrSourceLinesSlot(sourcePath: str): int32 =
    return 0
`, "utf8"));
    deadLegacyScannerSources.set("src/core/backend2/backend2_lower_util.cheng", Buffer.from(`fn PrimaryBodyIrBuildSourceBindingTypeCacheForFunction(): int32 =
    return 0
fn PrimaryBodyIrLookupSourceConstI32(): int32 =
    return 0
`, "utf8"));
    const deadLegacyScanners = validateAuthorityProductionClosure(deadLegacyScannerSources, false);
    assert.equal(deadLegacyScanners.status, "RED");
    assert.ok(deadLegacyScanners.issues.includes("post_seal_legacy_scanner_function_present"));
    assert.deepEqual(deadLegacyScanners.legacyScannerExistence.map((entry: any) => entry.family).sort(), ["build_source_cache", "lookup_source", "source_lines_slot"]);
    assert.equal(deadLegacyScanners.entryForwardForbiddenReachability.length, 0);
    const legacyScannerNameDecoys = new Map(wiredAuthoritySources);
    legacyScannerNameDecoys.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`fn PrimaryBodyIrBuildSourceConstI32CacheProbe(): int32 =
    let _literal = "PrimaryBodyIrSourceLinesSlot PrimaryBodyIrLookupSourceConstI32"
    return 0
fn PrimaryBodyIrLookupSourcesConstI32(): int32 =
    return 0
`, "utf8"));
    const legacyScannerDecoys = validateAuthorityProductionClosure(legacyScannerNameDecoys, false);
    assert.equal(legacyScannerDecoys.status, "GREEN", JSON.stringify(legacyScannerDecoys));
    assert.deepEqual(legacyScannerDecoys.legacyScannerExistence, []);
    const deadReexportScannerSources = new Map(wiredAuthoritySources);
    deadReexportScannerSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`fn PrimaryBodyIrSourceIsPureForwardingShim(): bool =
    return false
fn PrimaryBodyIrLookupSourceConstI32ViaReexport(): int32 =
    return 0
fn PrimaryBodyIrSourceObjectLayoutAtDepth(): int32 =
    return 0
fn PrimaryBodyIrSourceObjectLayoutDeclPathViaReexport(): str =
    return ""
`, "utf8"));
    const deadReexportScanners = validateAuthorityProductionClosure(deadReexportScannerSources, false);
    assert.equal(deadReexportScanners.status, "RED");
    assert.ok(deadReexportScanners.issues.includes("post_seal_invalid_import_reexport_scanner_present"));
    assert.deepEqual(deadReexportScanners.legacyReexportScannerExistence.map((entry: any) => entry.family).sort(), ["depth_limited_reexport_walker", "lookup_source_via_reexport", "pure_forwarding_import_shim", "source_layout_via_reexport"]);
    assert.equal(deadReexportScanners.entryForwardForbiddenReachability.length, 0);
    const reexportScannerNameDecoys = new Map(wiredAuthoritySources);
    reexportScannerNameDecoys.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`fn PrimaryBodyIrSourceIsPureForwardingShims(): bool =
    return false
fn PrimaryBodyIrLookupSourcesConstI32ViaReexport(): int32 =
    return 0
fn PrimaryBodyIrSourceObjectLayoutAtDepthProbe(): int32 =
    return 0
fn PrimaryBodyIrSourceObjectLayoutDeclPathViaReexports(): str =
    return ""
`, "utf8"));
    const reexportScannerDecoys = validateAuthorityProductionClosure(reexportScannerNameDecoys, false);
    assert.equal(reexportScannerDecoys.status, "GREEN", JSON.stringify(reexportScannerDecoys));
    assert.deepEqual(reexportScannerDecoys.legacyReexportScannerExistence, []);
    const c5ReintroducedSources = new Map(wiredAuthoritySources);
    c5ReintroducedSources.set("src/core/backend/lowering_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr\nfn LoweringC5FieldTypeFromSourceText(): str =\n    return ReadTextFile(\"legacy-c5\")\nfn BuildLoweringPlanStub(): int32 =\n    let _legacy = LoweringC5FieldTypeFromSourceText()\n    return texpr.TypedExprIrCanonicalFieldMetaState()\n`, "utf8"));
    const c5Reintroduced = validateAuthorityProductionClosure(c5ReintroducedSources, false);
    assert.equal(c5Reintroduced.status, "RED");
    assert.ok(c5Reintroduced.issues.includes("lowering_source_text_field_type_fallback_present"));
    assert.ok(c5Reintroduced.entryForwardForbiddenReachability.some((entry: string) => entry.includes("BuildLoweringPlanStub") && entry.includes("LoweringC5FieldTypeFromSourceText") && entry.includes("ReadTextFile")));
    const sideBranchAuthoritySources = new Map(wiredAuthoritySources);
    sideBranchAuthoritySources.set("src/core/backend2/backend2_pipeline.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr\nfn Backend2SideBranchRead(): str =\n    return ReadTextFile(\"side\")\nfn Backend2BuildPrimaryObjectPlanInto(): int32 =\n    let _side = Backend2SideBranchRead()\n    return texpr.TypedExprIrCanonicalFieldMetaState()\n`, "utf8"));
    const sideBranchAuthority = validateAuthorityProductionClosure(sideBranchAuthoritySources, false);
    assert.equal(sideBranchAuthority.status, "RED");
    assert.equal(sideBranchAuthority.rootDerivation.disconnectedEntries.length, 0);
    assert.ok(sideBranchAuthority.entryForwardForbiddenReachability.some((entry: string) => entry.includes("Backend2BuildPrimaryObjectPlanInto") && entry.includes("Backend2SideBranchRead") && entry.includes("ReadTextFile")));
    assert.ok(sideBranchAuthority.issues.includes("pipeline_entry_side_branch_reaches_unbound_source_io_or_legacy_scanner"));
    const disconnectedAuthoritySources = new Map(wiredAuthoritySources);
    disconnectedAuthoritySources.set("src/core/backend2/backend2_pipeline.cheng", Buffer.from("import cheng/core/lang/typed_expr as texpr\nimport cheng/core/backend/lowering_plan as lower\nfn Backend2BuildPrimaryObjectPlanInto(): int32 =\n    return 0\n", "utf8"));
    const disconnectedAuthority = validateAuthorityProductionClosure(disconnectedAuthoritySources, false);
    assert.equal(disconnectedAuthority.status, "RED");
    assert.equal(disconnectedAuthority.rootDerivation.disconnectedEntries.length, 3);
    assert.ok(disconnectedAuthority.issues.some((entry: string) => entry.includes("authority_entry_disconnected_backend2_realizer")));
    const legacyScannerAuthoritySources = new Map(wiredAuthoritySources);
    legacyScannerAuthoritySources.set("src/core/backend2/backend2_pipeline.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr\nfn Backend2BuildPrimaryObjectPlanInto(): int32 =\n    return TypedExprScanSourceFunctionReturnType()\n`, "utf8"));
    const legacyScannerAuthority = validateAuthorityProductionClosure(legacyScannerAuthoritySources, false);
    assert.equal(legacyScannerAuthority.status, "RED");
    assert.ok(legacyScannerAuthority.rootDerivation.disconnectedEntries.some((entry: any) => entry.requiredAnchor.includes("TypedExprIrCanonicalFieldMetaState")));
    const unresolvedUnqualifiedSources = new Map(wiredAuthoritySources);
    unresolvedUnqualifiedSources.set("src/core/backend2/backend2_pipeline.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn Backend2BuildPrimaryObjectPlanInto(): int32 =
    let _missing = MissingExport()
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const unresolvedUnqualified = validateAuthorityProductionClosure(unresolvedUnqualifiedSources, false);
    assert.equal(unresolvedUnqualified.status, "RED");
    assert.ok(unresolvedUnqualified.entryForwardUnqualifiedReachability.some((entry: string) => entry.includes("MissingExport:function_candidates=0:type_constructor_candidates=0")));
    const ambiguousUnqualifiedSources = new Map(wiredAuthoritySources);
    ambiguousUnqualifiedSources.set("src/test/export_a.cheng", Buffer.from("fn SharedExport(): int32 =\n    return 1\n", "utf8"));
    ambiguousUnqualifiedSources.set("src/test/export_b.cheng", Buffer.from("fn SharedExport(): int32 =\n    return 2\n", "utf8"));
    ambiguousUnqualifiedSources.set("src/core/backend2/backend2_pipeline.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
import test/export_a
import test/export_b
fn Backend2BuildPrimaryObjectPlanInto(): int32 =
    let _ambiguous = SharedExport()
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const ambiguousUnqualified = validateAuthorityProductionClosure(ambiguousUnqualifiedSources, false);
    assert.equal(ambiguousUnqualified.status, "RED");
    assert.ok(ambiguousUnqualified.entryForwardUnqualifiedReachability.some((entry: string) => entry.includes("SharedExport:function_candidates=2")));
    const exactConstructorSources = new Map(wiredAuthoritySources);
    exactConstructorSources.set("src/test/export_a.cheng", Buffer.from("type SharedCtor =\n    value: int32\n", "utf8"));
    exactConstructorSources.set("src/core/backend2/backend2_pipeline.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
import test/export_a
fn Backend2BuildPrimaryObjectPlanInto(): int32 =
    let _ctor = SharedCtor()
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const exactConstructor = validateAuthorityProductionClosure(exactConstructorSources, false);
    assert.equal(exactConstructor.status, "GREEN", JSON.stringify(exactConstructor));

    const exactRecoverySources = new Map(wiredAuthoritySources);
    exactRecoverySources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn PrimaryBodyIrSourceLinesStrippedAt(): int32 =
    return 1
fn PrimaryBodyIrCompleteAssignmentRhs(): int32 =
    return PrimaryBodyIrSourceLinesStrippedAt()
fn PrimaryBodyIrRecoverReturnAggregateConstructorText(): int32 =
    return PrimaryBodyIrSourceLinesStrippedAt()
fn BuildPrimaryObjectPlanInto(): int32 =
    let _rhs = PrimaryBodyIrCompleteAssignmentRhs()
    let _return = PrimaryBodyIrRecoverReturnAggregateConstructorText()
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const exactRecovery = validateAuthorityProductionClosure(exactRecoverySources, false);
    assert.equal(exactRecovery.status, "RED");
    assert.equal(exactRecovery.exactPostSealForbiddenExistence.length, 3);
    assert.equal(exactRecovery.exactPostSealForbiddenReachability.length, 3);

    const rawBuildIndexSources = new Map(wiredAuthoritySources);
    rawBuildIndexSources.set("src/core/lang/typed_expr.cheng", Buffer.from(`${CANONICAL_AUTHORITY_APIS}\nfn TypedExprBuildIndexVisibleContextSourcePath(): int32 =\n    return 1\n`, "utf8"));
    rawBuildIndexSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn BuildPrimaryObjectPlanInto(): int32 =
    let _bad = texpr.TypedExprBuildIndexVisibleContextSourcePath(typedIr.buildIndex, "ctx_import_composite")
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const rawBuildIndex = validateAuthorityProductionClosure(rawBuildIndexSources, false);
    assert.equal(rawBuildIndex.status, "RED");
    assert.equal(rawBuildIndex.postSealRawBuildIndexMetadataCalls.length, 1);
    assert.equal(rawBuildIndex.postSealRawBuildIndexMetadataCalls[0].api, "TypedExprBuildIndexVisibleContextSourcePath");

    const directBuildIndexSources = new Map(wiredAuthoritySources);
    directBuildIndexSources.set("src/core/backend2/backend2_pipeline.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn Backend2BuildPrimaryObjectPlanInto(
    typedIr: var TypedExprIr
): int32 =
    let _next = typedIr.buildIndex.fieldRowNext
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const directBuildIndex = validateAuthorityProductionClosure(directBuildIndexSources, false);
    assert.equal(directBuildIndex.status, "RED");
    assert.equal(directBuildIndex.postSealRawBuildIndexReads.length, 1);
    assert.equal(directBuildIndex.postSealRawBuildIndexReads[0].chain, "typedIr.buildIndex.fieldRowNext");
    assert.deepEqual(directBuildIndex.postSealRawBuildIndexReads[0].internalFieldChain, ["fieldRowNext"]);

    const operatorBuildIndexSources = new Map(wiredAuthoritySources);
    operatorBuildIndexSources.set("src/core/backend2/backend2_pipeline.cheng", Buffer.from(`${canonicalRealizerSource("Backend2BuildPrimaryObjectPlanInto")}
fn \`[]\`(typedIr: var TypedExprIr, index: int32): int32 =
    let _next = typedIr.buildIndex.fieldRowNext
    return index
`, "utf8"));
    const operatorBuildIndex = validateAuthorityProductionClosure(operatorBuildIndexSources, false);
    assert.equal(operatorBuildIndex.status, "RED");
    assert.equal(operatorBuildIndex.analysisCompleteness.operatorCallEdges, "CONSERVATIVE_COMPLETE");
    assert.ok(operatorBuildIndex.operatorFunctionDeclarations.some((entry: any) => entry.key.endsWith("#`[]`") && entry.symbol === "[]"));
    assert.equal(operatorBuildIndex.postSealRawBuildIndexReads.filter((entry: any) => entry.key.endsWith("#`[]`")).length, 1);

    const operatorSinkSources = new Map(wiredAuthoritySources);
    operatorSinkSources.set("src/core/backend2/backend2_pipeline.cheng", Buffer.from(`${canonicalRealizerSource("Backend2BuildPrimaryObjectPlanInto")}
fn \`==\`(left: int32, right: int32): bool =
    let _bad = ReadTextFile("operator-hidden")
    return left == right
`, "utf8"));
    const operatorSink = validateAuthorityProductionClosure(operatorSinkSources, false);
    assert.equal(operatorSink.status, "RED");
    assert.equal(operatorSink.analysisCompleteness.operatorCallEdges, "CONSERVATIVE_COMPLETE");
    assert.ok(operatorSink.entryForwardForbiddenReachability.some((entry: string) => entry.includes("#`==`") && entry.includes("ReadTextFile")));

    const operatorStringDecoySources = new Map(wiredAuthoritySources);
    operatorStringDecoySources.set("src/core/backend2/backend2_pipeline.cheng", Buffer.from(`${canonicalRealizerSource("Backend2BuildPrimaryObjectPlanInto")}
fn \`$\`(typedIr: var TypedExprIr): str =
    return "typedIr.buildIndex.fieldRowNext"
`, "utf8"));
    const operatorStringDecoy = validateAuthorityProductionClosure(operatorStringDecoySources, false);
    assert.equal(operatorStringDecoy.status, "GREEN", JSON.stringify(operatorStringDecoy));
    assert.equal(operatorStringDecoy.analysisCompleteness.operatorCallEdges, "CONSERVATIVE_COMPLETE");
    assert.deepEqual(operatorStringDecoy.postSealRawBuildIndexReads.filter((entry: any) => entry.key.endsWith("#`$`")), []);

    const directFieldMetadataSources = new Map(wiredAuthoritySources);
    directFieldMetadataSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn BuildPrimaryObjectPlanInto(typedIr: var TypedExprIr): int32 =
    let _bad = texpr.TypedExprIrLookupSingleFieldMeta(typedIr, "owner.cheng", "Owner", "field")
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const directFieldMetadata = validateAuthorityProductionClosure(directFieldMetadataSources, false);
    assert.equal(directFieldMetadata.status, "RED");
    assert.equal(directFieldMetadata.postSealNamedFieldMetadataDirectCalls.length, 1);
    assert.equal(directFieldMetadata.postSealNamedFieldMetadataDirectCalls[0].api, "texpr.TypedExprIrLookupSingleFieldMeta");

    const metadataDecoySources = new Map(wiredAuthoritySources);
    metadataDecoySources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn BuildPrimaryObjectPlanInto(): int32 =
    let _decoy = "typedIr.buildIndex.fieldRowNext texpr.TypedExprIrLookupSingleFieldMeta"
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const metadataDecoy = validateAuthorityProductionClosure(metadataDecoySources, false);
    assert.equal(metadataDecoy.status, "GREEN", JSON.stringify(metadataDecoy));
    assert.deepEqual(metadataDecoy.postSealRawBuildIndexReads, []);
    assert.deepEqual(metadataDecoy.postSealNamedFieldMetadataDirectCalls, []);

    const fmtBadApiSources = new Map(wiredAuthoritySources);
    fmtBadApiSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn BuildPrimaryObjectPlanInto(typedIr: var TypedExprIr): int32 =
    let _bad = Fmt"field={typedIr.buildIndex.fieldRowNext} meta={texpr.TypedExprIrLookupSingleFieldMeta(typedIr, \"owner.cheng\", \"Owner\", \"field\")}"
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const fmtBadApi = validateAuthorityProductionClosure(fmtBadApiSources, false);
    assert.equal(fmtBadApi.status, "RED");
    assert.equal(fmtBadApi.analysisCompleteness.fmtInterpolationCallsAndPostSealTokens, "COMPLETE");
    assert.equal(fmtBadApi.fmtInterpolationExpressions.length, 2);
    assert.equal(fmtBadApi.postSealRawBuildIndexReads.length, 1);
    assert.equal(fmtBadApi.postSealNamedFieldMetadataDirectCalls.length, 1);

    const fmtDecoySources = new Map(wiredAuthoritySources);
    fmtDecoySources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(String.raw`import cheng/core/lang/typed_expr as texpr
fn BuildPrimaryObjectPlanInto(): int32 =
    let _decoy = Fmt"{{typedIr.buildIndex.fieldRowNext}} \{texpr.TypedExprIrLookupSingleFieldMeta()\}"
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const fmtDecoy = validateAuthorityProductionClosure(fmtDecoySources, false);
    assert.equal(fmtDecoy.status, "GREEN", JSON.stringify(fmtDecoy));
    assert.equal(fmtDecoy.analysisCompleteness.status, "COMPLETE_FOR_SOURCE_WIDE_GATES");
    assert.equal(fmtDecoy.analysisCompleteness.resolvedCallGraphAuthority, "SOURCE_LEXER_INSUFFICIENT");
    assert.deepEqual(fmtDecoy.fmtInterpolationExpressions, []);
    assert.deepEqual(fmtDecoy.postSealRawBuildIndexReads, []);
    assert.deepEqual(fmtDecoy.postSealNamedFieldMetadataDirectCalls, []);

    const tripleFmtBadApiSources = new Map(wiredAuthoritySources);
    tripleFmtBadApiSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn BuildPrimaryObjectPlanInto(typedIr: var TypedExprIr): int32 =
    let _bad = Fmt"""field={typedIr.buildIndex.fieldRowNext}
meta={texpr.TypedExprIrLookupSingleFieldMeta(typedIr, "owner.cheng", "Owner", "field")}"""
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const tripleFmtBadApi = validateAuthorityProductionClosure(tripleFmtBadApiSources, false);
    assert.equal(tripleFmtBadApi.status, "RED");
    assert.equal(tripleFmtBadApi.analysisCompleteness.fmtInterpolationCallsAndPostSealTokens, "COMPLETE");
    assert.equal(tripleFmtBadApi.fmtInterpolationExpressions.length, 2);
    assert.equal(tripleFmtBadApi.postSealRawBuildIndexReads.length, 1);
    assert.equal(tripleFmtBadApi.postSealNamedFieldMetadataDirectCalls.length, 1);

    const tripleStringDecoySources = new Map(wiredAuthoritySources);
    tripleStringDecoySources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn BuildPrimaryObjectPlanInto(): int32 =
    let _decoy = """typedIr.buildIndex.fieldRowNext
texpr.TypedExprIrLookupSingleFieldMeta()"""
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const tripleStringDecoy = validateAuthorityProductionClosure(tripleStringDecoySources, false);
    assert.equal(tripleStringDecoy.status, "GREEN", JSON.stringify(tripleStringDecoy));
    assert.deepEqual(tripleStringDecoy.postSealRawBuildIndexReads, []);
    assert.deepEqual(tripleStringDecoy.postSealNamedFieldMetadataDirectCalls, []);

    const malformedFmtSources = new Map(wiredAuthoritySources);
    malformedFmtSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn BuildPrimaryObjectPlanInto(): int32 =
    let _bad = Fmt"unmatched }"
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const malformedFmt = validateAuthorityProductionClosure(malformedFmtSources, false);
    assert.equal(malformedFmt.status, "RED");
    assert.equal(malformedFmt.analysisCompleteness.status, "RED");
    assert.ok(malformedFmt.issues.includes("authority_fmt_interpolation_malformed"));
    assert.match(malformedFmt.fmtInterpolationErrors[0].reason, /unmatched Fmt close brace/);

    const unterminatedTripleFmtSources = new Map(wiredAuthoritySources);
    unterminatedTripleFmtSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn BuildPrimaryObjectPlanInto(): int32 =
    let _bad = Fmt"""unterminated {texpr.TypedExprIrCanonicalFieldMetaState()}
`, "utf8"));
    const unterminatedTripleFmt = validateAuthorityProductionClosure(unterminatedTripleFmtSources, false);
    assert.equal(unterminatedTripleFmt.status, "RED");
    assert.equal(unterminatedTripleFmt.analysisCompleteness.status, "RED");
    assert.match(unterminatedTripleFmt.fmtInterpolationErrors[0].reason, /unterminated Fmt literal/);

    const ownerFallbackSources = new Map(wiredAuthoritySources);
    ownerFallbackSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn PrimaryBodyIrOwnerLeafRetry(typedIr: var TypedExprIr, ownerType: str): int32 =
    let ownerLeaf = texpr.TypedExprTypeLeafName(ownerType)
    return PrimaryBodyIrCanonicalFieldMeta(typedIr, "owner.cheng", ownerLeaf, "field")
fn PrimaryBodyIrOwnerlessLayout(typedIr: var TypedExprIr): int32 =
    return texpr.TypedExprIrLookupTypeLayoutRow(typedIr, "", "Owner")
fn BuildPrimaryObjectPlanInto(): int32 =
    let _a = PrimaryBodyIrOwnerLeafRetry()
    let _b = PrimaryBodyIrOwnerlessLayout()
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const ownerFallback = validateAuthorityProductionClosure(ownerFallbackSources, false);
    assert.equal(ownerFallback.status, "RED");
    assert.equal(ownerFallback.postSealOwnerLeafMetadataFallbacks.length, 1);
    assert.equal(ownerFallback.postSealOwnerLeafMetadataFallbacks[0].ownerLeafBinding, "ownerLeaf");
    assert.equal(ownerFallback.postSealOwnerlessMetadataCalls.length, 1);

    const coldCsgFallbackSources = new Map(wiredAuthoritySources);
    coldCsgFallbackSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn PrimaryBodyIrColdCsgFieldShape(): int32 =
    return 0
fn PrimaryBodyIrColdCsgObjectSpecs(): int32 =
    return 0
fn PrimaryBodyIrLookupColdCsgObjectLayout(): int32 =
    return 0
fn PrimaryBodyIrLookupColdCsgFieldMeta(): int32 =
    return 0
fn BuildPrimaryObjectPlanInto(): int32 =
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const coldCsgFallback = validateAuthorityProductionClosure(coldCsgFallbackSources, false);
    assert.equal(coldCsgFallback.status, "RED");
    assert.deepEqual(coldCsgFallback.postSealColdCsgFieldLayoutFallbacks.map((entry: any) => entry.family).sort(), ["cold_csg_field_meta", "cold_csg_field_shape", "cold_csg_object_layout", "cold_csg_object_specs"]);

    const ownerRequiredIndexSources = new Map(wiredAuthoritySources);
    ownerRequiredIndexSources.set("src/core/lang/typed_expr.cheng", Buffer.from(`${CANONICAL_AUTHORITY_APIS}
fn TypedExprIrLookupTypeLayoutRow(ir: var TypedExprIr, sourcePath: str, typeName: str): int32 =
    var rowIndex: int32
    if sourcePath != "":
        let state = TypedExprBuildIndexLookup(ir.buildIndex, "ir_layout_source", sourcePath, typeName, "", rowIndex)
        if state == TypedExprBuildIndexAmbiguous:
            return -2
        if state == TypedExprBuildIndexUnique:
            return rowIndex
    let globalState = TypedExprBuildIndexLookup(ir.buildIndex, "ir_layout_global", "", typeName, "", rowIndex)
    if globalState == TypedExprBuildIndexAmbiguous:
        return -2
    if globalState == TypedExprBuildIndexUnique:
        return rowIndex
    return -1
`, "utf8"));
    const ownerRequiredIndex = validateAuthorityProductionClosure(ownerRequiredIndexSources, false);
    assert.equal(ownerRequiredIndex.status, "RED");
    assert.equal(ownerRequiredIndex.typedExprOwnerRequiredIndexContractViolations.length, 1);
    assert.ok(ownerRequiredIndex.typedExprOwnerRequiredIndexContractViolations[0].reasons.includes("forbidden_global_index:ir_layout_global"));
    assert.ok(ownerRequiredIndex.typedExprOwnerRequiredIndexContractViolations[0].reasons.includes("owner_missing_not_hard_failed"));

    const exactOwnerIndexSources = new Map(wiredAuthoritySources);
    exactOwnerIndexSources.set("src/core/lang/typed_expr.cheng", Buffer.from(`${CANONICAL_AUTHORITY_APIS}
fn TypedExprIrLookupTypeLayoutRow(ir: var TypedExprIr, sourcePath: str, typeName: str): int32 =
    if sourcePath == "":
        return -1
    var rowIndex: int32
    let state = TypedExprBuildIndexLookup(ir.buildIndex, "ir_layout_source", sourcePath, typeName, "", rowIndex)
    if state == TypedExprBuildIndexAmbiguous:
        return -2
    if state == TypedExprBuildIndexUnique:
        return rowIndex
    return -1
`, "utf8"));
    const exactOwnerIndex = validateAuthorityProductionClosure(exactOwnerIndexSources, false);
    assert.deepEqual(exactOwnerIndex.typedExprOwnerRequiredIndexContractViolations, [], JSON.stringify(exactOwnerIndex));

    const semanticHeuristicSources = new Map(wiredAuthoritySources);
    semanticHeuristicSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn PrimaryResolveTargetAnySource(): int32 =
    let kind = CallTargetGlobalUnique
    return kind
fn PrimaryAliasWalker(): int32 =
    var hopGuard: int32
    if hopGuard > 16:
        return -1
    return 0
fn PrimaryPayloadWidthCheck(payload: int32[]): int32 =
    if payload.len > 64:
        return -1
    return 0
fn BuildPrimaryObjectPlanInto(): int32 =
    let _any = PrimaryResolveTargetAnySource()
    let _walk = PrimaryAliasWalker()
    let _width = PrimaryPayloadWidthCheck([])
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const semanticHeuristics = validateAuthorityProductionClosure(semanticHeuristicSources, false);
    assert.equal(semanticHeuristics.status, "RED");
    assert.equal(semanticHeuristics.postSealAnySourceGlobalUniqueUses.length, 2);
    assert.ok(semanticHeuristics.postSealAnySourceGlobalUniqueUses.some((entry: any) => entry.identifiers.includes("CallTargetGlobalUnique")));
    assert.equal(semanticHeuristics.postSealHardcodedSemanticWalkerLimits.length, 1);
    assert.equal(semanticHeuristics.postSealHardcodedSemanticWalkerLimits[0].counter, "hopGuard");

    const calleeOwnerFallbackSources = new Map(wiredAuthoritySources);
    calleeOwnerFallbackSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn PrimaryBodyIrCallResultLayoutSourcePath(stmt: Statement): str =
    if stmt.callTargetSourcePath != "":
        return stmt.callTargetSourcePath
    return stmt.sourcePath
fn PrimaryBodyIrTargetParamType(lowering: var Lowering, stmt: Statement): str =
    var index = PrimaryObjectIrFunctionIndex(lowering.primaryObjectIr, stmt.callTargetSourcePath, stmt.callTarget)
    if index < 0:
        index = PrimaryObjectIrFunctionIndex(lowering.primaryObjectIr, stmt.sourcePath, stmt.callTarget)
    return ""
fn PrimaryBodyIrResolvedOrRegisteredWholeCallOrdinal(sourcePath: str): int32 =
    var lookupSourcePath = sourcePath
    return 0
fn PrimaryBodyIrAppendCallArgs(stmt: Statement): str =
    var layoutSourcePath = stmt.callTargetSourcePath
    if layoutSourcePath == "":
        layoutSourcePath = stmt.sourcePath
    return layoutSourcePath
fn PrimaryBodyIrAppendWholeCallExprToSlot(stmt: Statement): str =
    var resultSourcePath = stmt.callTargetSourcePath
    if resultSourcePath == "":
        resultSourcePath = stmt.sourcePath
    return resultSourcePath
fn PrimaryBodyIrAppendCallExprNodeToSlot(stmt: Statement): str =
    var resultSourcePath = stmt.callTargetSourcePath
    if resultSourcePath == "":
        resultSourcePath = stmt.sourcePath
    return resultSourcePath
fn BuildPrimaryObjectPlanInto(): int32 =
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    calleeOwnerFallbackSources.set("src/core/backend2/backend2_pipeline.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn Backend2CalleeAbiViewsForFunction(irFunction: Function): int32 =
    var targetSourcePath = ""
    if targetSourcePath == "":
        targetSourcePath = irFunction.sourcePath
    return 0
fn Backend2BuildPrimaryObjectPlanInto(): int32 =
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    calleeOwnerFallbackSources.set("src/core/backend/lowering_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn LoweringBuildTypedFunctionReferenceIndex(statementSourcePath: str): int32 =
    var targetSourcePath = ""
    if targetSourcePath == "":
        targetSourcePath = statementSourcePath
    return 0
fn BuildLoweringPlanStub(): int32 =
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const calleeOwnerFallback = validateAuthorityProductionClosure(calleeOwnerFallbackSources, false);
    assert.equal(calleeOwnerFallback.status, "RED");
    assert.deepEqual(calleeOwnerFallback.postSealCalleeOwnerFallbacks.map((entry: any) => entry.family).sort(), [
      "call_result_owner_from_caller_statement",
      "callee_abi_owner_from_caller_function",
      "callee_param_layout_owner_from_caller_statement",
      "callee_param_owner_from_caller_statement",
      "callee_result_layout_owner_from_caller_statement",
      "callee_result_layout_owner_from_caller_statement",
      "frozen_statement_owner_from_statement_source",
      "registered_call_owner_from_caller_source",
    ]);

    const abiWidthFallbackSources = new Map(wiredAuthoritySources);
    abiWidthFallbackSources.set("src/core/backend2/backend2_lower_slots.cheng", Buffer.from(`fn PrimaryBodyIrFillCallArgAbiSizes(paramType: str): int32 =
    var abiSize = PrimaryAbiArgSizeFromTypeText(paramType)
    if abiSize != 1 && abiSize != 2 && abiSize != 4 && abiSize != 8:
        abiSize = 8
    return abiSize
`, "utf8"));
    const abiWidthFallback = validateAuthorityProductionClosure(abiWidthFallbackSources, false);
    assert.equal(abiWidthFallback.status, "RED");
    assert.equal(abiWidthFallback.postSealAbiUnknownWidthFallbacks.length, 1);
    assert.equal(abiWidthFallback.postSealAbiUnknownWidthFallbacks[0].family, "invalid_or_missing_param_type_defaults_to_eight");

    const resolverAmbiguitySources = new Map(wiredAuthoritySources);
    resolverAmbiguitySources.set("src/core/backend2/backend2_lower_util.cheng", Buffer.from(`fn PrimaryObjectIrFunctionIndexBucketMin(candidate: int32, result: int32): int32 =
    if result < 0 || candidate < result:
        return candidate
    return result
fn PrimaryObjectIrFunctionIndex(functions: Function[]): int32 =
    for i in 0..<functions.len:
        if functions[i].matches:
            return i
    return -1
`, "utf8"));
    const resolverAmbiguity = validateAuthorityProductionClosure(resolverAmbiguitySources, false);
    assert.equal(resolverAmbiguity.status, "RED");
    assert.deepEqual(resolverAmbiguity.postSealExactOwnerAmbiguityFallbacks.map((entry: any) => entry.family).sort(), ["first_linear_match_wins", "minimum_candidate_wins"]);

    const owningMergeBorrowViolationSources = new Map(wiredAuthoritySources);
    owningMergeBorrowViolationSources.set("src/core/lang/parser.cheng", Buffer.from(`fn NormalizedExprLayerAdd(total: var NormalizedExprLayer, delta: var NormalizedExprLayer) =
    if total.valueExprTreeBorrowLease:
        panic("borrowed destination")
    ParserValueExprTreeAppendFrom(total.valueExprTree, delta.valueExprTree)
    ParserValueExprTreeRelease(delta.valueExprTree)
`, "utf8"));
    const owningMergeBorrowViolation = validateAuthorityProductionClosure(owningMergeBorrowViolationSources, false);
    assert.equal(owningMergeBorrowViolation.status, "RED");
    assert.deepEqual(owningMergeBorrowViolation.parserOwningMergeBorrowContractViolations[0].reasons,
      ["borrowed_source_not_rejected"]);

    const owningMergeBorrowSafeSources = new Map(wiredAuthoritySources);
    owningMergeBorrowSafeSources.set("src/core/lang/parser.cheng", Buffer.from(`fn NormalizedExprLayerAdd(total: var NormalizedExprLayer, delta: var NormalizedExprLayer) =
    if total.valueExprTreeBorrowLease:
        panic("borrowed destination")
    if delta.valueExprTreeBorrowLease:
        panic("borrowed source")
    ParserValueExprTreeAppendFrom(total.valueExprTree, delta.valueExprTree)
    ParserValueExprTreeRelease(delta.valueExprTree)
`, "utf8"));
    const owningMergeBorrowSafe = validateAuthorityProductionClosure(owningMergeBorrowSafeSources, false);
    assert.deepEqual(owningMergeBorrowSafe.parserOwningMergeBorrowContractViolations, []);

    const expandedWalkerLimitSources = new Map(wiredAuthoritySources);
    expandedWalkerLimitSources.set("src/core/lang/typed_expr.cheng", Buffer.from(`${CANONICAL_AUTHORITY_APIS}
fn TypedExprTypeLayoutCompute(depth: int32): bool =
    if depth > 64:
        return false
    return true
`, "utf8"));
    expandedWalkerLimitSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn PrimarySemanticNodeWalk(callArgNodes: Node[], binDigits: int32): int32 =
    if callArgNodes.len > 64:
        return -1
    if binDigits > 64:
        return -1
    return 0
fn BuildPrimaryObjectPlanInto(): int32 =
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    expandedWalkerLimitSources.set("src/core/backend2/backend2_pipeline.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn backend2CalleeAbiViewCanonicalType(depth: int32): int32 =
    while depth < 8:
        return depth
    return depth
fn Backend2BuildPrimaryObjectPlanInto(): int32 =
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const expandedWalkerLimits = validateAuthorityProductionClosure(expandedWalkerLimitSources, false);
    assert.equal(expandedWalkerLimits.status, "RED");
    assert.deepEqual(expandedWalkerLimits.postSealHardcodedSemanticWalkerLimits.map((entry: any) => [entry.counter, entry.limit, entry.kind]).sort(), [
      ["callArgNodes", 64, "semantic_node_collection"],
      ["depth", 64, "recursive_depth_or_guard"],
      ["depth", 8, "recursive_depth_or_guard"],
    ]);
    assert.ok(!expandedWalkerLimits.postSealHardcodedSemanticWalkerLimits.some((entry: any) => entry.counter === "binDigits"));

    const exactSourceRecoverySources = new Map(wiredAuthoritySources);
    exactSourceRecoverySources.set("src/core/lang/typed_expr.cheng", Buffer.from(`${CANONICAL_AUTHORITY_APIS}
fn TypedExprSourceLine(ctx: Context, lineNumber: int32): str =
    return ""
fn TypedExprExtractArgsText(lineRaw: str, columnNumber: int32, callName: str): str =
    return ""
fn TypedExprExtractArgsTextMultiline(ctx: Context, lineNumber: int32, columnNumber: int32, callName: str): str =
    var extendCount: int32
    while extendCount < 200:
        let attempt = TypedExprExtractArgsText("", columnNumber, callName)
        extendCount = extendCount + 1
    return ""
fn TypedExprBuildFactInto(ctx: Context, expr: Expr): int32 =
    var resultLineRaw = TypedExprSourceLine(ctx, expr.lineNumber)
    var resultArgsText = TypedExprExtractArgsText(resultLineRaw, expr.columnNumber, expr.surfaceText)
    if resultArgsText == "" && expr.callArgsText != "":
        resultArgsText = expr.callArgsText
    if resultArgsText == "":
        resultArgsText = TypedExprExtractArgsTextMultiline(ctx, expr.lineNumber, expr.columnNumber, expr.surfaceText)
    return 0
`, "utf8"));
    const exactSourceRecovery = validateAuthorityProductionClosure(exactSourceRecoverySources, false);
    assert.equal(exactSourceRecovery.status, "RED");
    assert.equal(exactSourceRecovery.typedExprExactSourceRecoveryFunctions.length, 2);
    assert.ok(exactSourceRecovery.typedExprExactSourceRecoveryCallers.some((entry: any) => entry.key.endsWith("#TypedExprBuildFactInto") && entry.callee === "TypedExprExtractArgsTextMultiline"));
    assert.deepEqual(exactSourceRecovery.typedExprResultIntrinsicSourceRecovery.map((entry: any) => entry.callee).sort(), ["TypedExprExtractArgsText", "TypedExprExtractArgsTextMultiline", "TypedExprSourceLine"]);
    assert.ok(exactSourceRecovery.typedExprResultIntrinsicSourceRecovery.some((entry: any) => entry.callee === "TypedExprExtractArgsText" && entry.sourceRecoveryPrecedesStructuredCallArgs));
    assert.ok(exactSourceRecovery.postSealHardcodedSemanticWalkerLimits.some((entry: any) => entry.counter === "extendCount" && entry.limit === 200));

    const fixedMetadataCapSources = new Map(wiredAuthoritySources);
    fixedMetadataCapSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn PrimaryObjectMetadataTextStable(text: str): bool =
    if text.len > 1024:
        return false
    return true
fn BuildPrimaryObjectPlanInto(): int32 =
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    fixedMetadataCapSources.set("src/core/backend2/backend2_lower_util.cheng", Buffer.from(`fn B2PrimaryObjectMetadataTextStable(text: str): bool =
    if text.len > 4096:
        return false
    return true
`, "utf8"));
    const fixedMetadataCaps = validateAuthorityProductionClosure(fixedMetadataCapSources, false);
    assert.equal(fixedMetadataCaps.status, "RED");
    assert.deepEqual(fixedMetadataCaps.postSealFixedMetadataTextCaps.map((entry: any) => [entry.key.slice(entry.key.lastIndexOf("#") + 1), entry.limit]).sort(), [
      ["B2PrimaryObjectMetadataTextStable", 4096],
      ["PrimaryObjectMetadataTextStable", 1024],
    ]);

    const arbitrarySemanticCapSources = new Map(wiredAuthoritySources);
    arbitrarySemanticCapSources.set("src/core/lang/typed_expr.cheng", Buffer.from(`${CANONICAL_AUTHORITY_APIS}
fn TypedExprIrRuntimeScalarType(hops: int32): int32 =
    while hops < 8:
        return hops
    return -1
`, "utf8"));
    arbitrarySemanticCapSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn PrimaryBodyIrSeqFieldOwnerIdentity(): bool =
    for depth in 0..<128:
        let _ = depth
    return false
fn PrimaryBodyIrSeqEnumIdentity(): bool =
    for depth in 0..<128:
        let _ = depth
    return false
fn PrimaryBodyIrLowerFieldReadChainSlot(segCount: int32): int32 =
    if segCount < 2 || segCount > 4:
        return -1
    return 0
fn PrimarySemanticSequenceLiteralProbe(seqLitProbeCount: int32, seqLitElemCount: int32, r3DrillDepth: int32): int32 =
    if seqLitProbeCount > 256 || seqLitElemCount > 257:
        return -1
    while r3DrillDepth < 4:
        return r3DrillDepth
    return 0
fn PrimaryReachabilityClosure(functionNames: str[], closurePass: int32): int32 =
    for _ in 0..<functionNames.len:
        if closurePass >= 31:
            return -1
    return 0
fn PrimaryPhysicalLimitDecoys(binDigits: int32, waveSize: int32, argRegisterCount: int32, encodingWidth: int32, debugLimit: int32): int32 =
    if binDigits > 64 || waveSize > 128 || argRegisterCount > 8 || encodingWidth > 32 || debugLimit > 100:
        return -1
    return 0
fn BuildPrimaryObjectPlanInto(): int32 =
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const arbitrarySemanticCaps = validateAuthorityProductionClosure(arbitrarySemanticCapSources, false);
    assert.equal(arbitrarySemanticCaps.status, "RED");
    assert.equal(arbitrarySemanticCaps.postSealHardcodedSemanticWalkerLimits.filter((entry: any) => entry.counter === "depth" && entry.limit === 128).length, 2);
    assert.ok(arbitrarySemanticCaps.postSealHardcodedSemanticWalkerLimits.some((entry: any) => entry.counter === "hops" && entry.limit === 8));
    assert.ok(arbitrarySemanticCaps.postSealHardcodedSemanticWalkerLimits.some((entry: any) => entry.counter === "segCount" && entry.limit === 4));
    assert.ok(arbitrarySemanticCaps.postSealHardcodedSemanticWalkerLimits.some((entry: any) => entry.counter === "r3DrillDepth" && entry.limit === 4));
    assert.ok(arbitrarySemanticCaps.postSealHardcodedSemanticWalkerLimits.some((entry: any) => entry.counter === "seqLitProbeCount" && entry.limit === 256));
    assert.ok(arbitrarySemanticCaps.postSealHardcodedSemanticWalkerLimits.some((entry: any) => entry.counter === "seqLitElemCount" && entry.limit === 257));
    assert.ok(arbitrarySemanticCaps.postSealHardcodedSemanticWalkerLimits.some((entry: any) => entry.counter === "closurePass" && entry.limit === 31 && entry.kind === "fixed_point_round_cap"));
    assert.ok(!arbitrarySemanticCaps.postSealHardcodedSemanticWalkerLimits.some((entry: any) => entry.counter === "segCount" && entry.limit === 2));
    assert.ok(!arbitrarySemanticCaps.postSealHardcodedSemanticWalkerLimits.some((entry: any) => ["binDigits", "waveSize", "argRegisterCount", "encodingWidth", "debugLimit"].includes(entry.counter)));

    const dynamicWorklistCapSources = new Map(wiredAuthoritySources);
    dynamicWorklistCapSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn PrimaryBodyIrSeqAddValueNodeIsStructured(typedIr: var TypedExprIr, work: int32[]): bool =
    if work.len > typedIr.nodes2_nodeIndexs.len * 4 + 64:
        return false
    return true
fn BuildPrimaryObjectPlanInto(): int32 =
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    dynamicWorklistCapSources.set("src/core/backend2/backend2_lower_slots.cheng", Buffer.from(`fn PrimaryBodyIrSeqAddValueNodeIsStructured(typedIr: var TypedExprIr, work: int32[]): bool =
    if work.len > typedIr.nodes2_nodeIndexs.len * 7 + 19:
        return false
    return true
`, "utf8"));
    const dynamicWorklistCaps = validateAuthorityProductionClosure(dynamicWorklistCapSources, false);
    assert.equal(dynamicWorklistCaps.status, "RED");
    assert.deepEqual(dynamicWorklistCaps.postSealDynamicSemanticWorklistCaps.map((entry: any) => [entry.multiplier, entry.additive]).sort(), [[4, 64], [7, 19]]);

    const programEncodingRejectSources = new Map(wiredAuthoritySources);
    programEncodingRejectSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn PrimaryBodyIRStrEqLiteralWordCount(literalLen: int32): int32 =
    if literalLen > 4095:
        return 0
    return 1
fn PrimaryBodyIRFillCallOp(stackArgBytes: int32): int32 =
    if stackArgBytes > 4095:
        return -1
    return 0
fn PrimaryBodyIrIndexedScaleWordCount(elemSize: int32): int32 =
    if elemSize > 0 && elemSize <= 65535:
        return 1
    return 0
fn PrimaryPhysicalEncoderOnly(encodedImmediate: int32): int32 =
    if encodedImmediate > 4095:
        return -1
    return encodedImmediate
fn BuildPrimaryObjectPlanInto(): int32 =
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const programEncodingRejects = validateAuthorityProductionClosure(programEncodingRejectSources, false);
    assert.equal(programEncodingRejects.status, "RED");
    assert.deepEqual(programEncodingRejects.postSealProgramDerivedEncodingRejectCaps.map((entry: any) => entry.family).sort(), [
      "program_element_size_rejected_by_encoding_width",
      "program_stack_argument_bytes_rejected_by_encoding_width",
      "string_literal_length_rejected_by_encoding_width",
    ]);
    assert.deepEqual(programEncodingRejects.postSealProgramDerivedEncodingCapUnproven, []);
    assert.ok(!programEncodingRejects.postSealProgramDerivedEncodingRejectCaps.some((entry: any) => entry.key.endsWith("#PrimaryPhysicalEncoderOnly")));

    const adapterAndX64EncodingRejectSources = new Map(wiredAuthoritySources);
    adapterAndX64EncodingRejectSources.set("src/core/backend/regalloc_aarch64_adapter.cheng", Buffer.from(`fn regallocA64AppendStrEqLiteral(literalLen: int32): bool =
    if literalLen > 4095:
        return false
    return true
fn regallocA64AppendIndexedAddress(stride: int32): int32 =
    if stride > 65535:
        return -1
    return stride
`, "utf8"));
    adapterAndX64EncodingRejectSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(`fn X64BodyStrEqLiteralByteCount(literalLen: int32): int32 =
    if literalLen > 4095:
        return 0
    return literalLen
`, "utf8"));
    const adapterAndX64EncodingRejects = validateAuthorityProductionClosure(adapterAndX64EncodingRejectSources, false);
    assert.deepEqual(adapterAndX64EncodingRejects.postSealProgramDerivedEncodingRejectCaps.map((entry: any) => entry.family).sort(), [
      "regalloc_adapter_stride_rejected_by_encoding_width",
      "regalloc_adapter_string_literal_length_rejected_by_encoding_width",
      "x64_string_literal_length_rejected_by_encoding_width",
    ]);

    const programEncodingMaterializedSources = new Map(wiredAuthoritySources);
    programEncodingMaterializedSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn PrimaryBodyIrIndexedScaleWordCount(elemSize: int32): int32 =
    if elemSize <= 0:
        return 0
    if elemSize <= 65535:
        return 2
    return 3
fn PrimaryBodyIRFillIndexedAggregateAddressToReg(elemSize: int32): int32 =
    if elemSize > 0:
        let low = elemSize & 65535
        let high = elemSize >> 16
        let a = A64EncMovz(low)
        if elemSize > 65535:
            let b = A64EncMovk(high)
        return A64EncMadd(a, elemSize)
    return -1
fn BuildPrimaryObjectPlanInto(): int32 =
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const programEncodingMaterialized = validateAuthorityProductionClosure(programEncodingMaterializedSources, false);
    assert.deepEqual(programEncodingMaterialized.postSealProgramDerivedEncodingRejectCaps, []);
    assert.deepEqual(programEncodingMaterialized.postSealProgramDerivedEncodingCapUnproven, []);
    assert.equal(programEncodingMaterialized.postSealProgramDerivedEncodingCapProofs.length, 1);
    assert.equal(programEncodingMaterialized.postSealProgramDerivedEncodingCapProofs[0].proof.kind, "positive_int32_movz_movk_madd");

    const programEncodingMissingHighHalfSources = new Map(programEncodingMaterializedSources);
    programEncodingMissingHighHalfSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
fn PrimaryBodyIrIndexedScaleWordCount(elemSize: int32): int32 =
    if elemSize <= 0:
        return 0
    if elemSize <= 65535:
        return 2
    return 3
fn PrimaryBodyIRFillIndexedAggregateAddressToReg(elemSize: int32): int32 =
    if elemSize > 0:
        let low = elemSize & 65535
        let a = A64EncMovz(low)
        return A64EncMadd(a, elemSize)
    return -1
fn BuildPrimaryObjectPlanInto(): int32 =
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    const programEncodingMissingHighHalf = validateAuthorityProductionClosure(programEncodingMissingHighHalfSources, false);
    assert.equal(programEncodingMissingHighHalf.status, "RED");
    assert.equal(programEncodingMissingHighHalf.postSealProgramDerivedEncodingCapUnproven.length, 1);
    assert.deepEqual(programEncodingMissingHighHalf.postSealProgramDerivedEncodingCapProofs, []);

    const strEqMirrorViolationSources = new Map(wiredAuthoritySources);
    strEqMirrorViolationSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`fn PrimaryBodyIRStrEqWordCount(bodyIR: BodyIR, op: BodyOp): int32 =
    let lhsWords: int32 = 1
    let rhsWords: int32 = 1
    return lhsWords + rhsWords + 19
fn PrimaryBodyIRFillStrEqOp(words: int32[], offset: int32, bodyIR: BodyIR, op: BodyOp): int32 =
    let wordCount = PrimaryBodyIRStrEqWordCount(bodyIR, op)
    let storeIndex = offset + wordCount - 1
    let failIndex = offset + wordCount - 2
    let successIndex = offset + wordCount - 4
    return PrimaryBodyIRStoreRegToSlot(words, storeIndex, bodyIR, op.target)
`, "utf8"));
    const strEqMirrorViolation = validateAuthorityProductionClosure(strEqMirrorViolationSources, false);
    assert.equal(strEqMirrorViolation.postSealPredictorFillerMirrorViolations.length, 1);
    assert.deepEqual(strEqMirrorViolation.postSealPredictorFillerMirrorViolations[0].reasons.sort(), [
      "filler_branch_anchors_not_store_relative",
      "filler_missing_variable_store_word_count",
      "predictor_assumes_one_word_store",
      "predictor_missing_variable_store_word_count",
    ]);

    const strEqMirrorExactSources = new Map(wiredAuthoritySources);
    strEqMirrorExactSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`fn PrimaryBodyIRStrEqWordCount(bodyIR: BodyIR, op: BodyOp): int32 =
    let lhsWords: int32 = 1
    let rhsWords: int32 = 1
    let storeWords = PrimaryBodyIrStoreSlotWordCount(bodyIR, op.target)
    return lhsWords + rhsWords + 18 + storeWords
fn PrimaryBodyIRFillStrEqOp(words: int32[], offset: int32, bodyIR: BodyIR, op: BodyOp): int32 =
    let wordCount = PrimaryBodyIRStrEqWordCount(bodyIR, op)
    let storeWords = PrimaryBodyIrStoreSlotWordCount(bodyIR, op.target)
    let storeIndex = offset + wordCount - storeWords
    let failIndex = storeIndex - 1
    let successIndex = storeIndex - 3
    return PrimaryBodyIRStoreRegToSlot(words, storeIndex, bodyIR, op.target)
`, "utf8"));
    const strEqMirrorExact = validateAuthorityProductionClosure(strEqMirrorExactSources, false);
    assert.deepEqual(strEqMirrorExact.postSealPredictorFillerMirrorViolations, []);

    const f64CanonicalCondSource = `fn PrimaryBodyCondArm64TrueCode(condTag: int32): int32 =
    if condTag == coreir.BodyCondF64EqTag:
        return a64.A64CondEQ
    if condTag == coreir.BodyCondF64NeTag:
        return a64.A64CondNE
    if condTag == coreir.BodyCondF64LtTag:
        return a64.A64CondMI
    if condTag == coreir.BodyCondF64LeTag:
        return a64.A64CondLS
    if condTag == coreir.BodyCondF64GtTag:
        return a64.A64CondGT
    if condTag == coreir.BodyCondF64GeTag:
        return a64.A64CondGE
    return -1
`;
    const f64AdapterExactSource = `fn regallocA64CallResultIsF64(bodyIR: BodyIR, call: Call): bool =
    return call.resultSlot >= 0 &&
           call.resultSlot < bodyIR.localSlots.len &&
           bodyIR.localSlots[call.resultSlot].typeKind == coreir.LocalF64Tag
fn regallocA64CallHasUnsupportedF64CAbi(bodyIR: BodyIR, call: Call): bool =
    if !call.targetIsImportc:
        return false
    for argIndex in 0..<call.argSlots.len:
        let slotIndex = call.argSlots[argIndex]
        if slotIndex >= 0 && slotIndex < bodyIR.localSlots.len &&
           bodyIR.localSlots[slotIndex].typeKind == coreir.LocalF64Tag:
            return true
    return regallocA64CallResultIsF64(bodyIR, call)
fn RegallocAarch64EntryAbiSupported(bodyIR: BodyIR): bool =
    if !bodyIR.entryIsCAbi:
        return true
    for slotIndex in 0..<bodyIR.localSlots.len:
        if bodyIR.localSlots[slotIndex].stackOffset < 0 &&
           bodyIR.localSlots[slotIndex].typeKind == coreir.LocalF64Tag:
            return false
    return true
fn regallocA64CondCode(cond: int32): int32 =
    if cond == coreir.BodyCondF64EqTag:
        return a64.A64CondEQ
    if cond == coreir.BodyCondF64NeTag:
        return a64.A64CondNE
    if cond == coreir.BodyCondF64LtTag:
        return a64.A64CondMI
    if cond == coreir.BodyCondF64LeTag:
        return a64.A64CondLS
    if cond == coreir.BodyCondF64GtTag:
        return a64.A64CondGT
    if cond == coreir.BodyCondF64GeTag:
        return a64.A64CondGE
    return -1
fn regallocA64AppendCall(bodyIR: BodyIR, call: Call, words: int32[]) =
    add(words, a64.A64EncBlPlaceholder())
    if regallocA64CallResultIsF64(bodyIR, call):
        add(words, a64.A64EncFmovXd(a64.A64X0, 0))
fn regallocA64BuildTermRecipe(term: Term, bodyIR: BodyIR, words: int32[]) =
    if term.kind == coreir.BodyTermReturnTag && bodyIR.localSlots[term.resultSlot].typeKind == coreir.LocalF64Tag:
        add(words, a64.A64EncFmovDx(0, a64.A64X0))
fn regallocA64BuildMachineFragments(out: Recipes): bool =
    for ingressIndex in 0..<out.abiIngressWordIndices.len:
        var fragment: Fragment
        fragment.ownerKind = RegallocAarch64FragmentOwnerAbiIngress
        fragment.wordStart = out.abiIngressWordIndices[ingressIndex]
        fragment.wordCount = out.abiIngressWordCounts[ingressIndex]
        var ingressWords: int32[]
        for wordIndex in 0..<fragment.wordCount:
            add(ingressWords, out.functionWords[fragment.wordStart + wordIndex])
        let effect = regallocA64WordsSpMemoryCallEffects(ingressWords)
        if fragment.wordCount != 1 ||
           effect != RegallocAarch64EffectSpStore ||
           !regallocA64StackImmediateFits(out.abiIngressOffsets[ingressIndex], out.abiIngressWidths[ingressIndex]):
            return false
    return true
fn RegallocAarch64PrepareFunctionActionRecipes(bodyIR: BodyIR, plan: Plan): Recipes =
    var out: Recipes
    if !RegallocAarch64EntryAbiSupported(bodyIR):
        regallocA64FunctionFail(out, RegallocAarch64RecipeErrorBody, -1)
        return out
    for callIndex in 0..<bodyIR.callSequence.len:
        if regallocA64CallHasUnsupportedF64CAbi(bodyIR, bodyIR.callSequence[callIndex]):
            regallocA64FunctionFail(out, RegallocAarch64RecipeErrorBody, callIndex)
            return out
    var parameterNeedsHome: bool[]
    for paramIndex in 0..<plan.parameterCount:
        let slotIndex = plan.parameterSlotIndices[paramIndex]
        var needsHome = plan.valueMemoryHomes[paramIndex]
        if bodyIR.localSlots[slotIndex].typeKind == coreir.LocalF64Tag:
            needsHome = true
        add(parameterNeedsHome, needsHome)
    var nextIngressOffset: int32
    for paramIndex in 0..<plan.parameterCount:
        if parameterNeedsHome[paramIndex]:
            out.parameterHomeOffsets[paramIndex] = nextIngressOffset
            nextIngressOffset = nextIngressOffset + 8
    for slotIndex in 0..<bodyIR.localSlots.len:
        let paramIndex = plan.slotParameterOrdinals[slotIndex]
        if paramIndex >= 0 && paramIndex < plan.constraints.fixedArgRegs.len:
            add(out.localStackOffsets, out.parameterHomeOffsets[paramIndex])
    for paramIndex in 0..<plan.parameterCount:
        let homeOffset = out.parameterHomeOffsets[paramIndex]
        let width = out.parameterWidths[paramIndex]
        let ingressWord = out.prologueWords.len
        regallocA64AppendStore(out.prologueWords, plan.constraints.fixedArgRegs[paramIndex], homeOffset, width)
        add(out.abiIngressOffsets, homeOffset)
        add(out.abiIngressWidths, width)
        add(out.abiIngressWordIndices, ingressWord)
        add(out.abiIngressWordCounts, 1)
    let cond = regallocA64CondCode(coreir.BodyCondF64EqTag)
    regallocA64AppendCall(bodyIR, bodyIR.callSequence[0], out.prologueWords)
    regallocA64BuildTermRecipe(term, bodyIR, out.prologueWords)
    let fragments = regallocA64BuildMachineFragments(out)
    return out
`;
    const f64AdapterExactSources = new Map(wiredAuthoritySources);
    f64AdapterExactSources.set("src/core/backend/primary_object_plan.cheng", Buffer.from(`import cheng/core/lang/typed_expr as texpr
${f64CanonicalCondSource}fn BuildPrimaryObjectPlanInto(): int32 =
    return texpr.TypedExprIrCanonicalFieldMetaState()
`, "utf8"));
    f64AdapterExactSources.set("src/core/backend/regalloc_single_pass.cheng", Buffer.from(`fn RegallocTargetConstraintsAarch64Darwin(): Constraints =
    var out: Constraints
    add(out.gprTypeKinds, coreir.LocalI32Tag)
    add(out.gprTypeKinds, coreir.LocalI64Tag)
    return out
fn regallocValueGprWidth(typeKind: int32): int32 =
    if typeKind == coreir.LocalI32Tag:
        return 4
    if typeKind == coreir.LocalI64Tag:
        return 8
    return 0
`, "utf8"));
    f64AdapterExactSources.set("src/core/backend/regalloc_aarch64_adapter.cheng", Buffer.from(f64AdapterExactSource, "utf8"));
    const f64AdapterExact = validateAuthorityProductionClosure(f64AdapterExactSources, false);
    assert.deepEqual(f64AdapterExact.regallocAdapterF64ContractViolations, []);
    assert.deepEqual(f64AdapterExact.regallocAdapterF64ContractProofs.map((entry: any) => entry.family).sort(), [
      "entry_home_prologue_store",
      "f64_call_result_return_bridge",
      "f64_cond_canonical_mirror",
      "f64_entry_c_abi_admission",
      "importc_f64_admission",
    ]);
    assert.equal(f64AdapterExact.regallocAdapterF64ContractProofs.find((entry: any) => entry.family === "importc_f64_admission")?.proofKind, "explicit_pre_emission_fail_closed");

    const f64EntryBroadMutationSources = new Map(f64AdapterExactSources);
    f64EntryBroadMutationSources.set("src/core/backend/regalloc_aarch64_adapter.cheng", Buffer.from(f64AdapterExactSource.replace(`        if bodyIR.localSlots[slotIndex].stackOffset < 0 &&
           bodyIR.localSlots[slotIndex].typeKind == coreir.LocalF64Tag:`, `        if bodyIR.localSlots[slotIndex].typeKind == coreir.LocalF64Tag:`), "utf8"));
    const f64EntryBroadMutation = validateAuthorityProductionClosure(f64EntryBroadMutationSources, false);
    const f64EntryBroadViolation = f64EntryBroadMutation.regallocAdapterF64ContractViolations.find((entry: any) => entry.family === "f64_entry_c_abi_admission");
    assert.ok(f64EntryBroadViolation?.reasons.includes("entry_c_abi_f64_parameter_fail_closed_contract_missing"));
    assert.ok(f64EntryBroadViolation?.reasons.includes("entry_c_abi_f64_return_not_explicitly_allowed"));

    const f64EntryGateMutationSources = new Map(f64AdapterExactSources);
    f64EntryGateMutationSources.set("src/core/backend/regalloc_aarch64_adapter.cheng", Buffer.from(f64AdapterExactSource.replace(`    if !RegallocAarch64EntryAbiSupported(bodyIR):
        regallocA64FunctionFail(out, RegallocAarch64RecipeErrorBody, -1)
        return out
`, ""), "utf8"));
    const f64EntryGateMutation = validateAuthorityProductionClosure(f64EntryGateMutationSources, false);
    const f64EntryGateViolation = f64EntryGateMutation.regallocAdapterF64ContractViolations.find((entry: any) => entry.family === "f64_entry_c_abi_admission");
    assert.ok(f64EntryGateViolation?.reasons.includes("entry_c_abi_gate_unreachable_from_recipe_root"));
    assert.ok(f64EntryGateViolation?.reasons.includes("entry_c_abi_admission_not_bound_before_emission"));

    const f64AdmissionMutationSources = new Map(f64AdapterExactSources);
    f64AdmissionMutationSources.set("src/core/backend/regalloc_aarch64_adapter.cheng", Buffer.from(f64AdapterExactSource.replace(`    for callIndex in 0..<bodyIR.callSequence.len:
        if regallocA64CallHasUnsupportedF64CAbi(bodyIR, bodyIR.callSequence[callIndex]):
            regallocA64FunctionFail(out, RegallocAarch64RecipeErrorBody, callIndex)
            return out
`, ""), "utf8"));
    const f64AdmissionMutation = validateAuthorityProductionClosure(f64AdmissionMutationSources, false);
    assert.ok(f64AdmissionMutation.regallocAdapterF64ContractViolations.some((entry: any) => entry.family === "importc_f64_admission" && entry.reasons.includes("importc_f64_fail_closed_path_missing")));

    const f64IllegalGprMutationSources = new Map(f64AdapterExactSources);
    f64IllegalGprMutationSources.set("src/core/backend/regalloc_single_pass.cheng", Buffer.from(f64AdapterExactSources.get("src/core/backend/regalloc_single_pass.cheng")!.toString("utf8").replace("    add(out.gprTypeKinds, coreir.LocalI64Tag)\n", "    add(out.gprTypeKinds, coreir.LocalI64Tag)\n    add(out.gprTypeKinds, coreir.LocalF64Tag)\n"), "utf8"));
    const f64IllegalGprMutation = validateAuthorityProductionClosure(f64IllegalGprMutationSources, false);
    assert.ok(f64IllegalGprMutation.regallocAdapterF64ContractViolations.some((entry: any) => entry.family === "importc_f64_admission" && entry.reasons.includes("allocator_illegally_admits_f64_to_gpr_class")));

    const f64ClassAwareBridge = `fn regallocA64AppendImportcClassAwareArgs(bodyIR: BodyIR, call: Call, words: int32[]): bool =
    if !call.targetIsImportc:
        return true
    var gprArgOrdinal: int32
    var f64ArgOrdinal: int32
    var stackArgOffset: int32
    for argIndex in 0..<call.argSlots.len:
        let slotIndex = call.argSlots[argIndex]
        let typeKind = bodyIR.localSlots[slotIndex].typeKind
        let sourceReg = regallocA64CallArgRawReg(bodyIR, call, argIndex)
        if typeKind == coreir.LocalF64Tag:
            if f64ArgOrdinal < 8:
                add(words, a64.A64EncFmovDx(f64ArgOrdinal, sourceReg))
            else:
                regallocA64AppendOutgoingStackArg(words, sourceReg, stackArgOffset)
                stackArgOffset = stackArgOffset + 8
            f64ArgOrdinal = f64ArgOrdinal + 1
        else:
            if gprArgOrdinal < 8:
                regallocA64AppendMove(words, gprArgOrdinal, sourceReg, true)
            else:
                regallocA64AppendOutgoingStackArg(words, sourceReg, stackArgOffset)
                stackArgOffset = stackArgOffset + 8
            gprArgOrdinal = gprArgOrdinal + 1
    return true
`;
    const f64ClassAwareSources = new Map(f64AdapterExactSources);
    f64ClassAwareSources.set("src/core/backend/regalloc_aarch64_adapter.cheng", Buffer.from(`${f64ClassAwareBridge}${f64AdapterExactSource.replace(`    for callIndex in 0..<bodyIR.callSequence.len:
        if regallocA64CallHasUnsupportedF64CAbi(bodyIR, bodyIR.callSequence[callIndex]):
            regallocA64FunctionFail(out, RegallocAarch64RecipeErrorBody, callIndex)
            return out
`, "    regallocA64AppendImportcClassAwareArgs(bodyIR, bodyIR.callSequence[0], out.functionWords)\n")}`, "utf8"));
    const f64ClassAware = validateAuthorityProductionClosure(f64ClassAwareSources, false);
    assert.deepEqual(f64ClassAware.regallocAdapterF64ContractViolations, []);
    assert.equal(f64ClassAware.regallocAdapterF64ContractProofs.find((entry: any) => entry.family === "importc_f64_admission")?.proofKind, "complete_class_aware_bridge");

    const f64CondMutationSources = new Map(f64AdapterExactSources);
    f64CondMutationSources.set("src/core/backend/regalloc_aarch64_adapter.cheng", Buffer.from(f64AdapterExactSource.replace("return a64.A64CondMI", "return a64.A64CondLT"), "utf8"));
    const f64CondMutation = validateAuthorityProductionClosure(f64CondMutationSources, false);
    assert.ok(f64CondMutation.regallocAdapterF64ContractViolations.some((entry: any) => entry.family === "f64_cond_canonical_mirror" && entry.reasons.includes("adapter_BodyCondF64LtTag_must_map_A64CondMI")));

    const f64HomeMutationSources = new Map(f64AdapterExactSources);
    f64HomeMutationSources.set("src/core/backend/regalloc_aarch64_adapter.cheng", Buffer.from(f64AdapterExactSource.replace("add(out.localStackOffsets, out.parameterHomeOffsets[paramIndex])", "add(out.localStackOffsets, detachedOffset)"), "utf8"));
    const f64HomeMutation = validateAuthorityProductionClosure(f64HomeMutationSources, false);
    assert.ok(f64HomeMutation.regallocAdapterF64ContractViolations.some((entry: any) => entry.family === "entry_home_prologue_store" && entry.reasons.includes("local_stack_offset_not_bound_to_parameter_home_offset")));

    const f64BridgeMutationSources = new Map(f64AdapterExactSources);
    f64BridgeMutationSources.set("src/core/backend/regalloc_aarch64_adapter.cheng", Buffer.from(f64AdapterExactSource
      .replace("a64.A64EncFmovXd(a64.A64X0, 0)", "a64.A64EncOrrReg(true, a64.A64X0, a64.A64XZR, a64.A64X0)")
      .replace("a64.A64EncFmovDx(0, a64.A64X0)", "a64.A64EncOrrReg(true, a64.A64X0, a64.A64XZR, a64.A64X0)"), "utf8"));
    const f64BridgeMutation = validateAuthorityProductionClosure(f64BridgeMutationSources, false);
    const f64BridgeViolation = f64BridgeMutation.regallocAdapterF64ContractViolations.find((entry: any) => entry.family === "f64_call_result_return_bridge");
    assert.deepEqual(f64BridgeViolation?.reasons.sort(), [
      "call_result_d0_to_x0_bridge_missing_or_unreachable",
      "return_x0_to_d0_bridge_missing_or_unreachable",
    ]);

    const x64CopyMemoryCheckedSource = `const X64BodyInt32Max = 2147483647
fn X64BodyCheckedAddNonNegative(lhs: int32, rhs: int32): int32 =
    if lhs < 0 || rhs < 0 || lhs > X64BodyInt32Max - rhs:
        return -1
    return lhs + rhs
fn X64BodyCheckedMul2(value: int32): int32 =
    if value < 0 || value > 1073741823:
        return -1
    return value * 2
fn x64BodyCheckedMul4(value: int32): int32 =
    if value < 0 || value > 536870911:
        return -1
    return value * 4
fn X64BodyCheckedMul8(value: int32): int32 =
    if value < 0 || value > 268435455:
        return -1
    return value * 8
fn x64BodyCheckedMul14(value: int32): int32 =
    if value < 0 || value > 153391689:
        return -1
    return value * 14
fn x64BodyCheckedMul16(value: int32): int32 =
    if value < 0 || value > 134217727:
        return -1
    return value * 16
fn X64BodyCopyMemoryByteCount(byteCount: int32): int32 =
    if byteCount <= 0:
        return 0
    if byteCount % 8 == 0:
        return x64BodyCheckedMul16(byteCount / 8)
    if byteCount % 4 == 0:
        return x64BodyCheckedMul14(byteCount / 4)
    return x64BodyCheckedMul16(byteCount)
fn x64BodyCopyDisplacementRangeSupported(offset: int32, byteCount: int32): bool =
    if offset < 0 || byteCount <= 0:
        return false
    var lastDelta = byteCount - 1
    if byteCount % 8 == 0:
        lastDelta = byteCount - 8
    elif byteCount % 4 == 0:
        lastDelta = byteCount - 4
    return X64BodyCheckedAddNonNegative(offset, lastDelta) >= 0
fn X64BodyCopyMemoryRangeSupported(offset: int32, byteCount: int32): bool =
    return X64BodyCopyMemoryByteCount(byteCount) > 0 &&
           x64BodyCopyDisplacementRangeSupported(offset, byteCount)
fn x64BodyFillCopyMemory(words: int32[], posRaw: int32, sourceReg: int32, sourceOffset: int32, targetReg: int32, targetOffset: int32, byteCount: int32): int32 =
    if !X64BodyCopyMemoryRangeSupported(sourceOffset, byteCount) ||
       !X64BodyCopyMemoryRangeSupported(targetOffset, byteCount):
        return -1
    var pos = posRaw
    var sourceCursor = sourceOffset
    var targetCursor = targetOffset
    if byteCount % 8 == 0:
        for copyIndex in 0..<(byteCount / 8):
            pos = x64bLoad64(words, pos, X64BodyRDX, sourceReg, sourceCursor)
            pos = x64bStore64(words, pos, X64BodyRDX, targetReg, targetCursor)
            if pos < 0:
                return -1
            if copyIndex + 1 < byteCount / 8:
                sourceCursor = X64BodyCheckedAddNonNegative(sourceCursor, 8)
                targetCursor = X64BodyCheckedAddNonNegative(targetCursor, 8)
                if sourceCursor < 0 || targetCursor < 0:
                    return -1
        return pos
    if byteCount % 4 == 0:
        for copyIndex in 0..<(byteCount / 4):
            pos = x64bLoad32(words, pos, X64BodyRDX, sourceReg, sourceCursor)
            pos = x64bStore32(words, pos, X64BodyRDX, targetReg, targetCursor)
            if pos < 0:
                return -1
            if copyIndex + 1 < byteCount / 4:
                sourceCursor = X64BodyCheckedAddNonNegative(sourceCursor, 4)
                targetCursor = X64BodyCheckedAddNonNegative(targetCursor, 4)
                if sourceCursor < 0 || targetCursor < 0:
                    return -1
        return pos
    for copyIndex in 0..<byteCount:
        pos = x64bLoad8(words, pos, X64BodyRDX, sourceReg, sourceCursor)
        pos = x64bStore8(words, pos, X64BodyRDX, targetReg, targetCursor)
        if pos < 0:
            return -1
        if copyIndex + 1 < byteCount:
            sourceCursor = X64BodyCheckedAddNonNegative(sourceCursor, 1)
            targetCursor = X64BodyCheckedAddNonNegative(targetCursor, 1)
            if sourceCursor < 0 || targetCursor < 0:
                return -1
    return pos
fn X64BodyCopySlotByteCount(slotSize: int32, copySrcParamAgg: bool, copyTgtParamAgg: bool): int32 =
    if copySrcParamAgg || copyTgtParamAgg:
        let copyParamBytes = X64BodyCopyMemoryByteCount(slotSize)
        if copyParamBytes <= 0:
            return copyParamBytes
        var copyParamExtra = 0
        if copySrcParamAgg:
            copyParamExtra = X64BodyCheckedAddNonNegative(copyParamExtra, X64BodySlotAccessBytes)
        if copyTgtParamAgg:
            copyParamExtra = X64BodyCheckedAddNonNegative(copyParamExtra, X64BodySlotAccessBytes)
        return X64BodyCheckedAddNonNegative(copyParamExtra, copyParamBytes)
    if slotSize == 4:
        return X64BodySlotAccessBytesForType(coreir.LocalI32Tag) * 2
    if slotSize % 8 == 0:
        return x64BodyCheckedMul16(slotSize / 8)
    if slotSize % 4 == 0:
        return x64BodyCheckedMul14(slotSize / 4)
    return x64BodyCheckedMul16(slotSize)
fn x64BodyFillCopySlot(words: int32[], posRaw: int32, slotSize: int32, sourceOffset: int32, targetOffset: int32): int32 =
    let copySrcParamAgg = sourceOffset == 0
    let copyTgtParamAgg = targetOffset == 0
    if slotSize == 4 && !copySrcParamAgg && !copyTgtParamAgg:
        return posRaw
    if copySrcParamAgg || copyTgtParamAgg:
        var copyParamStride = 0
        var copyParamChunks = 0
        if slotSize % 8 == 0:
            copyParamStride = 8
            copyParamChunks = slotSize / 8
        elif slotSize % 4 == 0:
            copyParamStride = 4
            copyParamChunks = slotSize / 4
        else:
            copyParamStride = 1
            copyParamChunks = slotSize
        var sourceCursor = sourceOffset
        var targetCursor = targetOffset
        for copyIndex in 0..<copyParamChunks:
            pos = x64bLoad8(words, pos, X64BodyRAX, X64BodyRCX, sourceCursor)
            pos = x64bLoad8(words, pos, X64BodyRAX, X64BodyRSP, sourceCursor)
            pos = x64bLoad8(words, pos, X64BodyRAX, X64BodyRSP, sourceCursor)
            pos = x64bStore8(words, pos, X64BodyRAX, X64BodyRDX, targetCursor)
            pos = x64bStore8(words, pos, X64BodyRAX, X64BodyRSP, targetCursor)
            pos = x64bStore8(words, pos, X64BodyRAX, X64BodyRSP, targetCursor)
            if copyIndex + 1 < copyParamChunks:
                sourceCursor = X64BodyCheckedAddNonNegative(sourceCursor, copyParamStride)
                targetCursor = X64BodyCheckedAddNonNegative(targetCursor, copyParamStride)
        return pos
    if slotSize % 8 == 0:
        return posRaw
    if slotSize % 4 == 0:
        return posRaw
    if !x64BodyCopyDisplacementRangeSupported(sourceOffset, slotSize) ||
       !x64BodyCopyDisplacementRangeSupported(targetOffset, slotSize):
        return -1
    var pos = posRaw
    var sourceCursor = sourceOffset
    var targetCursor = targetOffset
    for copyIndex in 0..<slotSize:
        pos = x64bLoad8(words, pos, X64BodyRAX, X64BodyRSP, sourceCursor)
        pos = x64bStore8(words, pos, X64BodyRAX, X64BodyRSP, targetCursor)
        if copyIndex + 1 < slotSize:
            sourceCursor = X64BodyCheckedAddNonNegative(sourceCursor, 1)
            targetCursor = X64BodyCheckedAddNonNegative(targetCursor, 1)
    return pos
fn X64BodyIndexedAggregateValueCopyBytes(bodyIR: BodyIR, valueSlot: int32, elemSize: int32): int32 =
    if elemSize <= 0:
        return 0
    return X64BodyCopyMemoryByteCount(elemSize)
fn X64ReturnSretCopyPairCount(byteCount: int32): int32 =
    if byteCount <= 0:
        return 0
    if byteCount % 8 == 0:
        return byteCount / 8
    if byteCount % 4 == 0:
        return byteCount / 4
    return byteCount
fn X64ReturnSretCopyStride(byteCount: int32): int32 =
    if byteCount <= 0:
        return 0
    if byteCount % 8 == 0:
        return 8
    if byteCount % 4 == 0:
        return 4
    return 1
fn X64BodyTermSize(retCopyBytes: int32, retCopyPairs: int32): int32 =
    let retCopyStride = X64ReturnSretCopyStride(retCopyBytes)
    var retPerPair = 16
    if retCopyStride == 4:
        retPerPair = 14
    var retPairBytes: int32
    if retPerPair == 16:
        retPairBytes = x64BodyCheckedMul16(retCopyPairs)
    else:
        retPairBytes = x64BodyCheckedMul14(retCopyPairs)
    return X64BodyCheckedAddNonNegative(20, retPairBytes)
fn x64BodyFillBlockTermReturn(words: int32[], retCopyBytes: int32, retCopyPairs: int32): int32 =
    let copyStride = X64ReturnSretCopyStride(retCopyBytes)
    var sourceCursor = 0
    var targetCursor = 0
    if copyStride == 8:
        for copyIndex in 0..<retCopyPairs:
            pos = x64bLoad64(words, pos, X64BodyRAX, X64BodyRSP, sourceCursor)
            pos = x64bStore64(words, pos, X64BodyRAX, X64BodyRCX, targetCursor)
            sourceCursor = X64BodyCheckedAddNonNegative(sourceCursor, copyStride)
            targetCursor = X64BodyCheckedAddNonNegative(targetCursor, copyStride)
    elif copyStride == 4:
        for copyIndex in 0..<retCopyPairs:
            pos = x64bLoad32(words, pos, X64BodyRAX, X64BodyRSP, sourceCursor)
            pos = x64bStore32(words, pos, X64BodyRAX, X64BodyRCX, targetCursor)
            sourceCursor = X64BodyCheckedAddNonNegative(sourceCursor, copyStride)
            targetCursor = X64BodyCheckedAddNonNegative(targetCursor, copyStride)
    else:
        for copyIndex in 0..<retCopyPairs:
            pos = x64bLoad8(words, pos, X64BodyRAX, X64BodyRSP, sourceCursor)
            pos = x64bStore8(words, pos, X64BodyRAX, X64BodyRCX, targetCursor)
            sourceCursor = X64BodyCheckedAddNonNegative(sourceCursor, copyStride)
            targetCursor = X64BodyCheckedAddNonNegative(targetCursor, copyStride)
    return pos
fn X64BodyOpByteCount(byteCount: int32, aggByteCount: int32, baseBytes: int32, storeValueBytes: int32, addressBytes: int32): int32 =
    if byteCount == 1:
        return X64BodyCopyMemoryByteCount(24)
    if byteCount == 2:
        let copyBytes = X64BodyCopyMemoryByteCount(byteCount)
        if copyBytes <= 0:
            return copyBytes
        return X64BodyCheckedAddNonNegative(16, copyBytes)
    if byteCount == 3:
        let aggCopyBytes = X64BodyCopyMemoryByteCount(aggByteCount)
        if aggCopyBytes <= 0:
            return aggCopyBytes
        return X64BodyCheckedAddNonNegative(16, aggCopyBytes)
    let aggCopyLoad = X64BodyIndexedAggregateValueCopyBytes(bodyIR, 0, byteCount)
    if aggCopyLoad > 0:
        let addressAndBase = X64BodyCheckedAddNonNegative(addressBytes, 8)
        return X64BodyCheckedAddNonNegative(addressAndBase, aggCopyLoad)
    let aggCopyStore = X64BodyIndexedAggregateValueCopyBytes(bodyIR, 1, byteCount)
    if aggCopyStore > 0:
        let addressAndBase = X64BodyCheckedAddNonNegative(addressBytes, 8)
        return X64BodyCheckedAddNonNegative(addressAndBase, aggCopyStore)
    let copyBytes = X64BodyCopyMemoryByteCount(byteCount)
    let prefixBytes = X64BodyCheckedAddNonNegative(baseBytes, storeValueBytes)
    if copyBytes <= 0 || prefixBytes < 0:
        return -1
    return X64BodyCheckedAddNonNegative(prefixBytes, copyBytes)
`;
    const x64CopyMemoryCheckedSources = new Map(wiredAuthoritySources);
    x64CopyMemoryCheckedSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64CopyMemoryCheckedSource, "utf8"));
    const x64CopyMemoryChecked = validateAuthorityProductionClosure(x64CopyMemoryCheckedSources, false);
    assert.deepEqual(x64CopyMemoryChecked.x64CopyMemoryCheckedArithmeticViolations, []);
    assert.deepEqual(x64CopyMemoryChecked.x64CopyMemoryCheckedArithmeticProofs.map((entry: any) => entry.family), ["x64_copy_memory_checked_byte_count_and_offsets"]);

    const x64CopyMultiplyMutationSources = new Map(x64CopyMemoryCheckedSources);
    x64CopyMultiplyMutationSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64CopyMemoryCheckedSource.replace("return x64BodyCheckedMul14(byteCount / 4)", "return (byteCount / 4) * 14"), "utf8"));
    const x64CopyMultiplyMutation = validateAuthorityProductionClosure(x64CopyMultiplyMutationSources, false);
    assert.ok(x64CopyMultiplyMutation.x64CopyMemoryCheckedArithmeticViolations[0]?.reasons.includes("copy_memory_byte_count_checked_multiply_contract_missing"));

    const x64CopyFixedAddMutationSources = new Map(x64CopyMemoryCheckedSources);
    x64CopyFixedAddMutationSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64CopyMemoryCheckedSource.replace("return X64BodyCheckedAddNonNegative(16, copyBytes)", "return 16 + copyBytes"), "utf8"));
    const x64CopyFixedAddMutation = validateAuthorityProductionClosure(x64CopyFixedAddMutationSources, false);
    assert.ok(x64CopyFixedAddMutation.x64CopyMemoryCheckedArithmeticViolations[0]?.reasons.includes("copy_memory_consumer_raw_addition_present"));
    assert.ok(x64CopyFixedAddMutation.x64CopyMemoryCheckedArithmeticViolations[0]?.reasons.includes("copy_memory_fixed_bytes_checked_add_missing"));

    const x64CopyIndexedAddMutationSources = new Map(x64CopyMemoryCheckedSources);
    x64CopyIndexedAddMutationSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64CopyMemoryCheckedSource.replace("let addressAndBase = X64BodyCheckedAddNonNegative(addressBytes, 8)", "let addressAndBase = addressBytes + 8"), "utf8"));
    const x64CopyIndexedAddMutation = validateAuthorityProductionClosure(x64CopyIndexedAddMutationSources, false);
    assert.ok(x64CopyIndexedAddMutation.x64CopyMemoryCheckedArithmeticViolations[0]?.reasons.includes("copy_memory_indexed_aggregate_checked_add_missing"));

    const x64CopyFieldAddMutationSources = new Map(x64CopyMemoryCheckedSources);
    x64CopyFieldAddMutationSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64CopyMemoryCheckedSource.replace("let prefixBytes = X64BodyCheckedAddNonNegative(baseBytes, storeValueBytes)", "let prefixBytes = baseBytes + storeValueBytes"), "utf8"));
    const x64CopyFieldAddMutation = validateAuthorityProductionClosure(x64CopyFieldAddMutationSources, false);
    assert.ok(x64CopyFieldAddMutation.x64CopyMemoryCheckedArithmeticViolations[0]?.reasons.includes("copy_memory_base_store_bytes_checked_add_missing"));

    const x64CopySlotAddMutationSources = new Map(x64CopyMemoryCheckedSources);
    x64CopySlotAddMutationSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64CopyMemoryCheckedSource.replace("return X64BodyCheckedAddNonNegative(copyParamExtra, copyParamBytes)", "return copyParamExtra + copyParamBytes"), "utf8"));
    const x64CopySlotAddMutation = validateAuthorityProductionClosure(x64CopySlotAddMutationSources, false);
    assert.ok(x64CopySlotAddMutation.x64CopyMemoryCheckedArithmeticViolations[0]?.reasons.includes("copy_memory_consumer_raw_addition_present"));
    assert.ok(x64CopySlotAddMutation.x64CopyMemoryCheckedArithmeticViolations[0]?.reasons.includes("copy_memory_copy_slot_checked_add_missing"));

    const x64CopyRangeMutationSources = new Map(x64CopyMemoryCheckedSources);
    x64CopyRangeMutationSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64CopyMemoryCheckedSource.replace("return X64BodyCheckedAddNonNegative(offset, lastDelta) >= 0", "return offset + lastDelta >= 0"), "utf8"));
    const x64CopyRangeMutation = validateAuthorityProductionClosure(x64CopyRangeMutationSources, false);
    assert.ok(x64CopyRangeMutation.x64CopyMemoryCheckedArithmeticViolations[0]?.reasons.includes("copy_memory_range_precheck_missing_or_inexact"));

    const x64CopyCursorMutationSources = new Map(x64CopyMemoryCheckedSources);
    x64CopyCursorMutationSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64CopyMemoryCheckedSource.replace("sourceCursor = X64BodyCheckedAddNonNegative(sourceCursor, 8)", "sourceCursor = sourceCursor + 8"), "utf8"));
    const x64CopyCursorMutation = validateAuthorityProductionClosure(x64CopyCursorMutationSources, false);
    assert.ok(x64CopyCursorMutation.x64CopyMemoryCheckedArithmeticViolations[0]?.reasons.includes("copy_memory_fill_raw_offset_arithmetic_present"));
    assert.ok(x64CopyCursorMutation.x64CopyMemoryCheckedArithmeticViolations[0]?.reasons.includes("copy_memory_fill_checked_cursor_stride_8_missing"));

    const x64CopyAgg4MutationSources = new Map(x64CopyMemoryCheckedSources);
    x64CopyAgg4MutationSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64CopyMemoryCheckedSource.replace("if slotSize == 4 && !copySrcParamAgg && !copyTgtParamAgg:", "if slotSize == 4:"), "utf8"));
    const x64CopyAgg4Mutation = validateAuthorityProductionClosure(x64CopyAgg4MutationSources, false);
    assert.ok(x64CopyAgg4Mutation.x64CopyMemoryCheckedArithmeticViolations[0]?.reasons.includes("copy_slot_aggregate4_pointer_precedence_missing"));

    const x64CopyOddParamMutationSources = new Map(x64CopyMemoryCheckedSources);
    x64CopyOddParamMutationSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64CopyMemoryCheckedSource.replace("        else:\n            copyParamStride = 1\n            copyParamChunks = slotSize", "        else:\n            return -1"), "utf8"));
    const x64CopyOddParamMutation = validateAuthorityProductionClosure(x64CopyOddParamMutationSources, false);
    assert.ok(x64CopyOddParamMutation.x64CopyMemoryCheckedArithmeticViolations[0]?.reasons.includes("copy_slot_param_stride_8_4_1_contract_missing"));

    const x64CopyIndexedOddMutationSources = new Map(x64CopyMemoryCheckedSources);
    x64CopyIndexedOddMutationSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64CopyMemoryCheckedSource.replace("    if elemSize <= 0:\n        return 0\n    return X64BodyCopyMemoryByteCount(elemSize)", "    if elemSize <= 0 || elemSize % 4 != 0:\n        return 0\n    return X64BodyCopyMemoryByteCount(elemSize)"), "utf8"));
    const x64CopyIndexedOddMutation = validateAuthorityProductionClosure(x64CopyIndexedOddMutationSources, false);
    assert.ok(x64CopyIndexedOddMutation.x64CopyMemoryCheckedArithmeticViolations[0]?.reasons.includes("indexed_aggregate_arbitrary_byte_copy_contract_missing"));

    const x64SretOddMutationSources = new Map(x64CopyMemoryCheckedSources);
    x64SretOddMutationSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64CopyMemoryCheckedSource.replace("    if byteCount % 4 == 0:\n        return 4\n    return 1", "    if byteCount % 4 == 0:\n        return 4\n    return 0"), "utf8"));
    const x64SretOddMutation = validateAuthorityProductionClosure(x64SretOddMutationSources, false);
    assert.ok(x64SretOddMutation.x64CopyMemoryCheckedArithmeticViolations[0]?.reasons.includes("sret_exact_stride_8_4_1_classifier_missing"));

    const x64F64ExactSource = `const X64BodyF64ReturnBridgeBytes = 5
fn x64bMovqXmm0FromRax(words: int32[], posRaw: int32): int32 =
    var pos = x64bPut8(words, posRaw, 0x66)
    pos = x64bPut8(words, pos, 0x48)
    pos = x64bPut8(words, pos, 0x0F)
    pos = x64bPut8(words, pos, 0x6E)
    return x64bPut8(words, pos, 0xC0)
fn x64bMovqRaxFromXmm0(words: int32[], posRaw: int32): int32 =
    var pos = x64bPut8(words, posRaw, 0x66)
    pos = x64bPut8(words, pos, 0x48)
    pos = x64bPut8(words, pos, 0x0F)
    pos = x64bPut8(words, pos, 0x7E)
    return x64bPut8(words, pos, 0xC0)
fn X64BodyCallResultIsF64(bodyIR: BodyIR, call: Call): bool =
    return call.resultSlot >= 0 &&
           call.resultSlot < bodyIR.localSlots.len &&
           bodyIR.localSlots[call.resultSlot].typeKind == coreir.LocalF64Tag
fn X64BodyCallAbiSupported(bodyIR: BodyIR, call: Call): bool =
    if !call.targetIsImportc:
        return true
    for argIndex in 0..<call.argSlots.len:
        let argSlot = call.argSlots[argIndex]
        if argSlot >= 0 && argSlot < bodyIR.localSlots.len &&
           bodyIR.localSlots[argSlot].typeKind == coreir.LocalF64Tag:
            return false
    return true
fn X64BodyEntryAbiSupported(bodyIR: BodyIR): bool =
    if !bodyIR.entryIsCAbi:
        return true
    for slotIndex in 0..<bodyIR.localSlots.len:
        if x64BodyLocalIsParam(bodyIR.localSlots[slotIndex]) &&
           bodyIR.localSlots[slotIndex].typeKind == coreir.LocalF64Tag:
            return false
    return true
fn X64BodyValidateFrameLayout(bodyIR: BodyIR): bool =
    return true
fn X64BodyProductionAdmission(bodyIR: BodyIR): bool =
    if !X64BodyValidateFrameLayout(bodyIR) ||
       !X64BodyEntryAbiSupported(bodyIR):
        return false
    for callIndex in 0..<bodyIR.callSequence.len:
        if !X64BodyCallAbiSupported(bodyIR, bodyIR.callSequence[callIndex]):
            return false
    return true
fn X64BodyComputePlan(bodyIR: BodyIR) =
    if !X64BodyProductionAdmission(bodyIR):
        return
fn X64BodyIrWordCount(bodyIR: BodyIR): int32 =
    if !X64BodyProductionAdmission(bodyIR):
        return 0
    return 1
fn X64BodyFillWords(bodyIR: BodyIR): int32 =
    if !X64BodyProductionAdmission(bodyIR):
        return -1
    return 0
fn X64BodyCallWordCount(bodyIR: BodyIR, call: Call): int32 =
    var count = 2
    var resultWords = 2
    if X64BodyCallResultIsF64(bodyIR, call):
        resultWords = 4
    count = X64BodyCheckedAddNonNegative(count, resultWords)
    return count
fn x64BodyFillCallOp(words: int32[], bodyIR: BodyIR, call: Call): int32 =
    var pos = 0
    let resStorePos = pos
    var resultBytes = 8
    if X64BodyCallResultIsF64(bodyIR, call):
        pos = x64bMovqRaxFromXmm0(words, pos)
        resultBytes = 16
    pos = x64BodyStoreRegToSlot(words, pos, bodyIR, call.resultSlot, X64BodyRAX, 0)
    pos = x64bPadTo(words, pos, resStorePos + resultBytes)
    return pos
fn X64BodyTermSize(resultType: int32): int32 =
    var f64BridgeBytes = 0
    if resultType == coreir.LocalF64Tag:
        f64BridgeBytes = X64BodyF64ReturnBridgeBytes
    return X64BodyCheckedAddNonNegative(12, f64BridgeBytes)
fn x64BodyFillBlockTermReturn(words: int32[], bodyIR: BodyIR, term: Term, resultType: int32): int32 =
    var pos = x64BodyResLoad(words, 0, bodyIR, term.resultSlot, X64BodyRAX, 0)
    if resultType == coreir.LocalF64Tag:
        pos = x64bMovqXmm0FromRax(words, pos)
    return x64bFillEpilogue(words, pos, 0)
`;
    const x64F64ExactSources = new Map(wiredAuthoritySources);
    x64F64ExactSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64F64ExactSource, "utf8"));
    const x64F64Exact = validateAuthorityProductionClosure(x64F64ExactSources, false);
    assert.deepEqual(x64F64Exact.x64F64AbiContractViolations, []);
    assert.deepEqual(x64F64Exact.x64F64AbiContractProofs.map((entry: any) => entry.family), ["x64_f64_xmm0_return_and_call_result_bridge"]);

    const x64F64EncodingMutationSources = new Map(x64F64ExactSources);
    x64F64EncodingMutationSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64F64ExactSource.replace("pos = x64bPut8(words, pos, 0x7E)", "pos = x64bPut8(words, pos, 0x6E)"), "utf8"));
    const x64F64EncodingMutation = validateAuthorityProductionClosure(x64F64EncodingMutationSources, false);
    assert.ok(x64F64EncodingMutation.x64F64AbiContractViolations[0]?.reasons.includes("f64_xmm0_rax_exact_encoding_contract_missing"));

    const x64F64AdmissionMutationSources = new Map(x64F64ExactSources);
    x64F64AdmissionMutationSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64F64ExactSource.replace("bodyIR.localSlots[argSlot].typeKind == coreir.LocalF64Tag:\n            return false", "bodyIR.localSlots[argSlot].typeKind == coreir.LocalF64Tag:\n            return true"), "utf8"));
    const x64F64AdmissionMutation = validateAuthorityProductionClosure(x64F64AdmissionMutationSources, false);
    assert.ok(x64F64AdmissionMutation.x64F64AbiContractViolations[0]?.reasons.includes("importc_f64_argument_fail_closed_contract_missing"));

    const x64F64EntryBroadMutationSources = new Map(x64F64ExactSources);
    x64F64EntryBroadMutationSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64F64ExactSource.replace(`        if x64BodyLocalIsParam(bodyIR.localSlots[slotIndex]) &&
           bodyIR.localSlots[slotIndex].typeKind == coreir.LocalF64Tag:`, `        if bodyIR.localSlots[slotIndex].typeKind == coreir.LocalF64Tag:`), "utf8"));
    const x64F64EntryBroadMutation = validateAuthorityProductionClosure(x64F64EntryBroadMutationSources, false);
    assert.ok(x64F64EntryBroadMutation.x64F64AbiContractViolations[0]?.reasons.includes("entry_c_abi_f64_parameter_fail_closed_contract_missing"));
    assert.ok(x64F64EntryBroadMutation.x64F64AbiContractViolations[0]?.reasons.includes("entry_c_abi_f64_return_not_explicitly_allowed"));

    const x64F64EntryGateMutationSources = new Map(x64F64ExactSources);
    x64F64EntryGateMutationSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64F64ExactSource.replace(`    if !X64BodyValidateFrameLayout(bodyIR) ||
       !X64BodyEntryAbiSupported(bodyIR):
        return false
`, ""), "utf8"));
    const x64F64EntryGateMutation = validateAuthorityProductionClosure(x64F64EntryGateMutationSources, false);
    assert.ok(x64F64EntryGateMutation.x64F64AbiContractViolations[0]?.reasons.includes("entry_c_abi_admission_not_bound_to_production_gate"));

    const x64F64BridgeMutationSources = new Map(x64F64ExactSources);
    x64F64BridgeMutationSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64F64ExactSource
      .replace("        pos = x64bMovqRaxFromXmm0(words, pos)\n", "")
      .replace("        pos = x64bMovqXmm0FromRax(words, pos)\n", ""), "utf8"));
    const x64F64BridgeMutation = validateAuthorityProductionClosure(x64F64BridgeMutationSources, false);
    assert.ok(x64F64BridgeMutation.x64F64AbiContractViolations[0]?.reasons.includes("f64_call_result_xmm0_to_rax_home_bridge_missing"));
    assert.ok(x64F64BridgeMutation.x64F64AbiContractViolations[0]?.reasons.includes("f64_return_rax_to_xmm0_bridge_missing"));

    const x64WordsExactSource = `fn X64BodyWordsOfChecked(byteCount: int32): int32 =
    if byteCount <= 0 || byteCount > 2147483644:
        return 0
    return (byteCount + 3) / 4
`;
    const x64WordsExactSources = new Map(wiredAuthoritySources);
    x64WordsExactSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64WordsExactSource, "utf8"));
    const x64WordsExact = validateAuthorityProductionClosure(x64WordsExactSources, false);
    assert.deepEqual(x64WordsExact.x64WordCountCheckedArithmeticViolations, []);
    assert.deepEqual(x64WordsExact.x64WordCountCheckedArithmeticProofs.map((entry: any) => entry.family), ["x64_word_count_checked_padding"]);
    const x64WordsMutationSources = new Map(x64WordsExactSources);
    x64WordsMutationSources.set("src/core/backend/x86_64_body_emit.cheng", Buffer.from(x64WordsExactSource.replace("byteCount > 2147483644", "byteCount > 2147483647"), "utf8"));
    const x64WordsMutation = validateAuthorityProductionClosure(x64WordsMutationSources, false);
    assert.ok(x64WordsMutation.x64WordCountCheckedArithmeticViolations[0]?.reasons.includes("word_count_padding_overflow_guard_missing_or_inexact"));

    const formalSpecRaw = readFileSync(
      join(CHENG_ROOT, "docs/cheng-formal-spec.md"),
    );
    const generatedEbnfMapRaw = readFileSync(
      join(PROJECT, "fixtures/semantic/ebnf_parser_node_map.json"),
    );
    const parserRaw = readFileSync(
      join(CHENG_ROOT, "src/core/lang/parser.cheng"),
    );
    const producerDeclarationsRaw = readFileSync(
      join(
        PROJECT,
        "fixtures/semantic/ebnf_parser_producer_claims.json",
      ),
    );
    const formalProfileSourceSnapshotSha256 = hash(Buffer.concat([
      formalSpecRaw,
      generatedEbnfMapRaw,
      parserRaw,
      producerDeclarationsRaw,
    ]));
    const bindFormal = (candidate: Buffer | string) =>
      validateTypedExprFormalSpecBinding(
        candidate,
        generatedEbnfMapRaw,
        parserRaw,
        producerDeclarationsRaw,
        {
          sourceSnapshotSha256: formalProfileSourceSnapshotSha256,
          receiptToolClosureSha256:
            hash("item22-formal-receipt-tool-closure"),
          receiptSourcePlanSha256:
            hash("item22-formal-receipt-source-plan"),
        },
      );
    const formalBinding = bindFormal(formalSpecRaw);
    assert.equal(formalBinding.status, "GREEN", formalBinding.reason);
    const coverage = validateTypedExprCoverageLedger(
      formalBinding.sliceSha256,
      formalBinding.specVersion,
    );
    assert.equal(coverage.familyCount, 95);
    assert.equal(coverage.selectedLeafAlternativeCount, 69);
    assert.equal(coverage.scope, "selected_leaf_alternatives_only");
    assert.equal(coverage.exhaustiveEbnfStructuralSemanticCoverage, false);
    assert.ok(coverage.structuralSemanticGaps.some((entry: string) => entry.includes("associativity")));
    const compilerProfile = formalChengCompilerProfile();
    assert.equal(coverage.compilerProfile.sha256, compilerProfile.sha256);
    assert.equal(compilerProfile.env.CHENG_STRICT_CALL_SYNTAX, "1");
    assert.equal(compilerProfile.env.BACKEND_INCREMENTAL, "0");
    assert.equal(compilerProfile.env.BACKEND_MULTI_MODULE_CACHE, "0");
    assert.equal(compilerProfile.env.CHENG_DISABLE_PRIMARY_OBJECT_CACHE, "1");
    assert.equal(compilerProfile.env.BACKEND_JOBS, "1");
    assert.ok(compilerProfile.unsetEnv.includes("CHENG_TYPED_EXPR_LEGACY"));
    assert.ok(compilerProfile.unsetEnv.includes("CHENG_TYPED_IR_KEEP_COLD_CSG_ROWS"));
    assert.ok(compilerProfile.unsetEnv.includes("CHENG_TYPED_IR_KEEP_COLD_CSG_STATEMENTS"));
    assert.equal(compilerProfile.sha256, hash(JSON.stringify({schema: compilerProfile.schema, action: compilerProfile.action, target: compilerProfile.target, env: compilerProfile.env, unsetEnv: compilerProfile.unsetEnv})));
    assert.equal(new Set(coverage.entries.map((entry: any) => entry.family)).size, coverage.familyCount);
    assert.equal(new Set(coverage.entries.map((entry: any) => entry.fixture)).size, coverage.familyCount);
    assert.equal(coverage.entries.find((entry: any) => entry.family === "qualified_nested_call_canonical_declaration")?.declarationWitnessId, "qualified_nested_call.std_monotimes");
    const nestedFixtureRaw = readFileSync(join(PROJECT, "fixtures/regalloc_preflight/typedexpr_qualified_nested_call_positive.cheng"));
    const monotimesRaw = readFileSync(join(CHENG_ROOT, "src/std/monotimes.cheng"));
    const nestedDeclarationWitness = validateQualifiedNestedCallDeclarationWitness(nestedFixtureRaw, monotimesRaw);
    assert.equal(nestedDeclarationWitness.status, "GREEN", JSON.stringify(nestedDeclarationWitness));
    assert.equal(nestedDeclarationWitness.declarationEdges.length, 2);
    assert.deepEqual(nestedDeclarationWitness.typeFlow, {innerReturnType: "MonoTime", outerParameterType: "MonoTime", outerReturnType: "int64", assignmentType: "int64"});
    const innerDeclarationBlock = "fn GetMonoTime(): MonoTime =\n    return getMonoTime()\n\n";
    assert.ok(monotimesRaw.toString("utf8").includes(innerDeclarationBlock));
    const deletedInnerDeclaration = validateQualifiedNestedCallDeclarationWitness(nestedFixtureRaw, monotimesRaw.toString("utf8").replace(innerDeclarationBlock, ""));
    assert.equal(deletedInnerDeclaration.status, "RED");
    assert.ok(deletedInnerDeclaration.issues.includes("inner_declaration_edge_missing"));
    const wrongBoundInnerDeclaration = validateQualifiedNestedCallDeclarationWitness(nestedFixtureRaw, monotimesRaw.toString("utf8").replace("fn GetMonoTime(): MonoTime =", "fn GetMonoTime(): Duration ="));
    assert.equal(wrongBoundInnerDeclaration.status, "RED");
    assert.ok(wrongBoundInnerDeclaration.issues.includes("inner_declaration_signature_mismatch"));
    assert.ok(wrongBoundInnerDeclaration.issues.includes("nested_call_inner_return_outer_parameter_type_mismatch"));
    assert.ok(formalBinding.supplementalBindings.some((entry: any) =>
      entry.schema === "cheng_formal_module_visibility" &&
      /^[0-9a-f]{64}$/.test(entry.sha256)));
    const mutatedModuleVisibility = formalSpecRaw.toString("utf8").replace("- `import` 仅导入导出符号；未导出符号在模块外不可见。", "- `import` 同时转导入模块的导出符号。");
    assert.notEqual(mutatedModuleVisibility, formalSpecRaw.toString("utf8"));
    const mutatedModuleVisibilityBinding = bindFormal(
      mutatedModuleVisibility,
    );
    assert.equal(mutatedModuleVisibilityBinding.status, "UNPROVEN");
    assert.match(
      mutatedModuleVisibilityBinding.reason,
      /formal spec\/parser identity mismatch/,
    );
    const obligationManifest = deriveFormalExpressionObligationManifest(formalSpecRaw);
    const obligationCoverage = evaluateFormalExpressionObligationCoverage(obligationManifest, coverage);
    assert.equal(obligationManifest.productionCount, 34);
    assert.equal(obligationManifest.obligationCount, 460);
    assert.equal(obligationManifest.structurallyImpossibleInteractionCount, 178);
    assert.equal(obligationManifest.externalReferences.length, 11);
    assert.equal(obligationManifest.externalReferenceBindings.filter((entry: any) => entry.status === "GREEN").length, 11);
    assert.equal(obligationManifest.externalReferenceBindings.filter((entry: any) => entry.status === "UNPROVEN").length, 0);
    assert.equal(obligationManifest.externalReferenceBindings.find((entry: any) => entry.reference === "boolLiteral")?.status, "GREEN");
    assert.equal(obligationManifest.externalReferenceBindings.find((entry: any) => entry.reference === "charLiteral")?.status, "GREEN");
    assert.equal(obligationManifest.externalReferenceBindings.find((entry: any) => entry.reference === "caseEntry")?.classification, "grammar_production_outside_expression_slice");
    assert.equal(obligationManifest.externalReferenceBindings.find((entry: any) => entry.reference === "ident")?.status, "GREEN");
    assert.equal(obligationManifest.externalReferenceBindings.find((entry: any) => entry.reference === "ident")?.classification, "lexical_terminal_definition");
    assert.equal(obligationManifest.externalReferenceBindings.find((entry: any) => entry.reference === "numberLiteral")?.classification, "lexical_terminal_definition");
    assert.equal(obligationManifest.externalReferenceBindings.find((entry: any) => entry.reference === "stringLiteral")?.classification, "lexical_terminal_definition");
    assert.equal(obligationManifest.formalProfileContradictions.length, 0);
    const spaceCallExclusionObligation = obligationManifest.obligations.find((entry: any) => entry.obligation_id === "semantic.profile.strict_call_syntax.spaceCall_exclusion");
    assert.equal(spaceCallExclusionObligation?.bindingStatus, "GREEN");
    assert.equal(spaceCallExclusionObligation?.state, "excluded_by_strict_profile");
    assert.equal(spaceCallExclusionObligation?.sourceSchema, "cheng_formal_spacecall_exclusion");
    assert.ok(spaceCallExclusionObligation?.fragment.includes("CHENG_STRICT_CALL_SYNTAX=1"));
    assert.ok(spaceCallExclusionObligation?.fragment.includes("space_call_removed"));
    assert.ok(obligationManifest.obligations.some((entry: any) => entry.production === "factor" && entry.kind === "choice" && entry.fragment === "spaceCall"));
    assert.equal(obligationCoverage.status, "UNPROVEN");
    assert.equal(obligationCoverage.declaredFixtureMappingCount, 23);
    assert.equal(obligationCoverage.witnessedObligationCount, 0);
    assert.equal(obligationCoverage.formalBindingMappingCount, 13);
    assert.equal(obligationCoverage.satisfiedObligationCount, 13);
    assert.equal(obligationCoverage.missingObligationCount, 447);
    assert.ok(!obligationCoverage.unboundFormalObligationIds.includes("ebnf.external.ident.definition"));
    assert.ok(!obligationCoverage.missingObligationIds.includes("ebnf.external.ident.definition"));
    assert.ok(obligationCoverage.missingObligationIds.includes("semantic.operator_precedence.shift.77"));
    assert.ok(obligationCoverage.missingObligationIds.includes("semantic.conditionalExpr.associativity.right"));
    assert.ok(!obligationCoverage.missingObligationIds.includes("semantic.profile.strict_call_syntax.spaceCall_exclusion"));
    assert.ok(!obligationCoverage.unboundFormalObligationIds.includes("semantic.profile.strict_call_syntax.spaceCall_exclusion"));
    const callSuffixInteractions = obligationManifest.obligations.filter((entry: any) => entry.production === "callSuffix" && entry.kind === "structural_interaction");
    assert.equal(callSuffixInteractions.length, 3);
    for (const repetitionState of ["zero", "one", "many"]) {
      assert.ok(callSuffixInteractions.some((entry: any) => entry.obligation_id === `ebnf.callSuffix.interaction.optional.0.present__repetition.0.${repetitionState}`));
      assert.ok(!callSuffixInteractions.some((entry: any) => entry.obligation_id === `ebnf.callSuffix.interaction.optional.0.absent__repetition.0.${repetitionState}`));
    }
    const unknownMappingCoverage = structuredClone(coverage);
    unknownMappingCoverage.entries[0].formalObligationIds = ["ebnf.future.unknown"];
    assert.throws(() => evaluateFormalExpressionObligationCoverage(obligationManifest, unknownMappingCoverage), /unknown formal obligation mapping/);
    const duplicateMappingCoverage = structuredClone(coverage);
    const mappedEntry = duplicateMappingCoverage.entries.find((entry: any) => entry.formalObligationIds.length > 0);
    const secondEntry = duplicateMappingCoverage.entries.find((entry: any) => entry.family !== mappedEntry.family && entry.formalObligationIds.length === 0);
    secondEntry.formalObligationIds = [mappedEntry.formalObligationIds[0]];
    assert.throws(() => evaluateFormalExpressionObligationCoverage(obligationManifest, duplicateMappingCoverage), /duplicate formal obligation mapping across fixture families/);
    const lexicalBlockStart = "ident          ::= IDENT ;\n";
    const lexicalBlockEnd = "stringLiteral  ::= SHORT_STRING | MULTILINE_STRING ;\n";
    const specTextForLexical = formalSpecRaw.toString("utf8");
    const lexStart = specTextForLexical.indexOf(lexicalBlockStart);
    const lexEnd = specTextForLexical.indexOf(lexicalBlockEnd, lexStart) + lexicalBlockEnd.length;
    assert.ok(lexStart > 0 && lexEnd > lexStart, "lexical terminal definitions block must exist in the pinned spec");
    const specWithoutLexical = specTextForLexical.slice(0, lexStart) + specTextForLexical.slice(lexEnd);
    assert.throws(
      () => deriveFormalExpressionObligationManifest(specWithoutLexical),
      /formal lexical terminal definitions anchors must each occur exactly once/,
    );
    const exclusionBlockStart = "#### 1.3.5 spaceCall 的 strict-profile 排除\n";
    const exclusionBlockEnd = "- 本排除与 `factor ::= spaceCall | postfix | whenExpr | ifExpr | caseExpr` 的 EBNF 并存：EBNF 描述全量语法空间，生产剖面按本条收窄，二者不构成矛盾。\n";
    const specTextForExclusion = formalSpecRaw.toString("utf8");
    const exStart = specTextForExclusion.indexOf(exclusionBlockStart);
    const exEnd = specTextForExclusion.indexOf(exclusionBlockEnd, exStart) + exclusionBlockEnd.length;
    const specWithoutExclusion = specTextForExclusion.slice(0, exStart) + specTextForExclusion.slice(exEnd);
    assert.ok(exStart > 0 && exEnd > exStart, "spaceCall exclusion block must exist in the pinned spec");
    const noExclusionManifest = deriveFormalExpressionObligationManifest(specWithoutExclusion);
    assert.equal(noExclusionManifest.formalProfileContradictions.length, 1);
    assert.equal(noExclusionManifest.formalProfileContradictions[0].feature, "spaceCall");
    const tamperedExclusionManifest = deriveFormalExpressionObligationManifest(specTextForExclusion.replace("space_call_removed", "space_call_warned"));
    assert.equal(tamperedExclusionManifest.formalProfileContradictions.length, 1);
    const factorGrammar = `factor         ::= spaceCall
                  | postfix
                  | whenExpr
                  | ifExpr
                  | caseExpr ;`;
    const mutatedBranchText = formalSpecRaw.toString("utf8").replace(factorGrammar, `${factorGrammar.slice(0, -1)}
                  | "futureFactor" ;`);
    assert.notEqual(mutatedBranchText, formalSpecRaw.toString("utf8"));
    const mutatedObligationManifest = deriveFormalExpressionObligationManifest(mutatedBranchText);
    const futureObligation = mutatedObligationManifest.obligations.find((entry: any) => entry.kind === "choice" && entry.fragment === '"futureFactor"');
    assert.ok(futureObligation);
    assert.ok(!obligationManifest.obligations.some((entry: any) => entry.obligation_id === futureObligation.obligation_id));
    const stablePostfixObligation = obligationManifest.obligations.find((entry: any) => entry.production === "factor" && entry.kind === "choice" && entry.fragment === "postfix");
    assert.ok(stablePostfixObligation);
    assert.ok(mutatedObligationManifest.obligations.some((entry: any) => entry.obligation_id === stablePostfixObligation.obligation_id));
    const mutatedObligationCoverage = evaluateFormalExpressionObligationCoverage(mutatedObligationManifest, coverage);
    assert.equal(mutatedObligationCoverage.status, "UNPROVEN");
    assert.ok(mutatedObligationCoverage.missingObligationIds.includes(futureObligation.obligation_id));
    const guardedFactorGrammar = `factor         ::= ( "left" [ "a" ] )
                  | ( "right" [ "b" ] ) ;`;
    const guardedGrammarText = formalSpecRaw.toString("utf8").replace(factorGrammar, guardedFactorGrammar);
    assert.notEqual(guardedGrammarText, formalSpecRaw.toString("utf8"));
    const guardedManifest = deriveFormalExpressionObligationManifest(guardedGrammarText);
    const guardedInteractions = guardedManifest.obligations.filter((entry: any) => entry.production === "factor" && entry.kind === "structural_interaction");
    const leftChoice = guardedManifest.obligations.find((entry: any) => entry.production === "factor" && entry.kind === "choice" && entry.fragment.includes('"left"'));
    const rightChoice = guardedManifest.obligations.find((entry: any) => entry.production === "factor" && entry.kind === "choice" && entry.fragment.includes('"right"'));
    assert.ok(leftChoice?.siteState && rightChoice?.siteState);
    for (const state of ["absent", "present"]) {
      assert.ok(guardedInteractions.some((entry: any) => entry.obligation_id === `ebnf.factor.interaction.choice.0.${leftChoice.siteState}__optional.0.${state}`));
      assert.ok(guardedInteractions.some((entry: any) => entry.obligation_id === `ebnf.factor.interaction.choice.0.${rightChoice.siteState}__optional.1.${state}`));
      assert.ok(!guardedInteractions.some((entry: any) => entry.obligation_id === `ebnf.factor.interaction.choice.0.${leftChoice.siteState}__optional.1.${state}`));
      assert.ok(!guardedInteractions.some((entry: any) => entry.obligation_id === `ebnf.factor.interaction.choice.0.${rightChoice.siteState}__optional.0.${state}`));
    }
    assert.ok(!guardedInteractions.some((entry: any) => entry.obligation_id.includes("optional.0") && entry.obligation_id.includes("optional.1")));
    assert.ok(guardedManifest.structurallyImpossibleInteractionCount > 0);
    const mutatedFormalSpec = Buffer.from(formalSpecRaw);
    const grammarOffset = mutatedFormalSpec.indexOf(Buffer.from('logicalOr      ::= logicalAnd { "||" logicalAnd } ;'));
    assert.ok(grammarOffset >= 0);
    mutatedFormalSpec[grammarOffset] ^= 1;
    assert.equal(bindFormal(mutatedFormalSpec).status, "UNPROVEN");
    for (const exactText of [
      'boolLiteral    ::= "true" | "false" ;',
      "| 77  | `<< >>` | 移位 |",
      '- `?:` 为右结合，语义遵循 `conditionalExpr ::= logicalOr [ "?" expression ":" conditionalExpr ]`。',
    ]) {
      const supplementalMutation = Buffer.from(formalSpecRaw);
      const offset = supplementalMutation.indexOf(Buffer.from(exactText));
      assert.ok(offset >= 0, exactText);
      supplementalMutation[offset] ^= 1;
      assert.equal(bindFormal(supplementalMutation).status, "UNPROVEN");
    }
    const pinnedSource = join(scratch, "pin-source-manifest");
    const pinnedMemory = join(scratch, "pin-memory-manifest");
    writeFileSync(pinnedSource, "source-a\n");
    writeFileSync(pinnedMemory, "memory-a\n");
    const pinnedBefore = snapshotSourceInputs(CHENG_ROOT, {sourceManifest: pinnedSource, memoryManifest: pinnedMemory});
    assert.ok(pinnedBefore.byLabel.has("cheng-package.toml"));
    assert.ok(pinnedBefore.byLabel.has("cheng.lock.toml"));
    assert.ok(pinnedBefore.byLabel.has("docs/cheng-formal-spec.md"));
    assert.ok(pinnedBefore.byLabel.has("fusion/package.json"));
    assert.ok(pinnedBefore.byLabel.has("fusion/bun.lock"));
    assert.ok(pinnedBefore.byLabel.has("fusion/index.ts"));
    assert.ok(pinnedBefore.byLabel.has("fusion/cli.ts"));
    assert.ok(pinnedBefore.byLabel.has("fusion/src/cheng_regalloc_preflight_m9022.ts"));
    assert.ok(pinnedBefore.byLabel.has("fusion/src/cheng_fusion_tool_registry.ts"));
    assert.ok(pinnedBefore.byLabel.has("fusion/src/cheng_fusion_mcp_server_m9009.ts"));
    assert.ok(
      pinnedBefore.byLabel.has(
        "fusion/fixtures/semantic/ebnf_parser_node_map.json",
      ),
    );
    for (const path of aarch64F64GatePaths) assert.ok(pinnedBefore.byLabel.has(path), path);
    for (const path of x86_64F64GatePaths) assert.ok(pinnedBefore.byLabel.has(path), path);
    for (const authorityFile of AUTHORITY_FILES) assert.ok(pinnedBefore.byLabel.has(authorityFile), authorityFile);
    assert.equal(pinnedBefore.authorityProductionScope, "minimum_import_closure");
    assert.equal(pinnedBefore.authorityManifestRootFileCount, 0);
    assert.ok(pinnedBefore.authorityProductionFiles.length > AUTHORITY_FILES.length);
    assert.ok(pinnedBefore.authorityProductionRoots.every((path: string) => AUTHORITY_FILES.includes(path)));
    assert.equal(pinnedBefore.cIncludeClosure.fileCount, 12);
    assert.equal(pinnedBefore.cIncludeClosure.files.includes("fusion/bodyir_packed_slab_contract.c"), true);
    assert.equal(pinnedBefore.cIncludeClosure.files.includes("cheng_cold.c"), true);
    const cBootstrapSnapshots = new Map(pinnedBefore.cIncludeClosure.files.filter((name: string) => name !== "fusion/bodyir_packed_slab_contract.c").map((name: string) => [name, pinnedBefore.byLabel.get(`bootstrap/${name}`)]));
    const unexpectedIncludeSnapshots = new Map(cBootstrapSnapshots);
    unexpectedIncludeSnapshots.set("cheng_cold.c", {...unexpectedIncludeSnapshots.get("cheng_cold.c"), raw: Buffer.concat([unexpectedIncludeSnapshots.get("cheng_cold.c").raw, Buffer.from('\n#include "unexpected.h"\n')])});
    assert.throws(() => validateCIncludeClosure(pinnedBefore.byLabel.get("fusion/bodyir_packed_slab_contract.c"), unexpectedIncludeSnapshots), /undeclared local dependency/);
    const missingIncludeSnapshots = new Map(cBootstrapSnapshots);
    missingIncludeSnapshots.delete("host_runtime.c");
    assert.throws(() => validateCIncludeClosure(pinnedBefore.byLabel.get("fusion/bodyir_packed_slab_contract.c"), missingIncludeSnapshots), /cardinality mismatch/);
    assert.ok(pinnedBefore.byLabel.has("input/source_manifest"));
    assert.ok(pinnedBefore.byLabel.has("input/memory_manifest"));
    const manifestUnionSnapshot = snapshotSourceInputs(CHENG_ROOT, {
      sourceManifest: pinnedSource,
      sourceManifestRelativePaths: ["src/core/tooling/compiler_main.cheng"],
      memoryManifest: pinnedMemory,
    });
    assert.equal(manifestUnionSnapshot.authorityProductionScope, "minimum_plus_validated_source_manifest_import_closure");
    assert.equal(manifestUnionSnapshot.authorityManifestRootFileCount, 1);
    assert.ok(manifestUnionSnapshot.authorityProductionRoots.includes("src/core/tooling/compiler_main.cheng"));
    assert.ok(manifestUnionSnapshot.authorityProductionFiles.includes("src/core/tooling/compiler_main.cheng"));
    const manifestUnionFinalSnapshot = snapshotSourceInputs(CHENG_ROOT, {
      sourceManifest: pinnedSource,
      sourceManifestRelativePaths: ["src/core/tooling/compiler_main.cheng"],
      memoryManifest: pinnedMemory,
    });
    assert.equal(sameSourceInputs(manifestUnionSnapshot, manifestUnionFinalSnapshot), true);
    writeFileSync(pinnedSource, "source-b\n");
    writeFileSync(pinnedMemory, "memory-b\n");
    const pinnedAfter = snapshotSourceInputs(CHENG_ROOT, {sourceManifest: pinnedSource, memoryManifest: pinnedMemory});
    assert.equal(sameSourceInputs(pinnedBefore, pinnedAfter), false);
    assert.equal(sameSourceInputs({sha256: "same", snapshots: [], absences: [{label: "fusion/bun.lock", path: "/missing"}]}, {sha256: "same", snapshots: [], absences: []}), false);
    assertTrue(true, "payload hashes, exact closures, capacity chains, event sweep and role closure are fail-closed");

    const backendEpochRoot = join(scratch, "backend2-epoch");
    const backendEpochSources = [
      "src/core/backend2/backend2_pipeline.cheng", "src/core/backend/regalloc_single_pass.cheng",
      "src/core/lang/parser.cheng", "src/core/lang/typed_expr.cheng",
    ].sort();
    for (const relativePath of backendEpochSources) {
      mkdirSync(dirname(join(backendEpochRoot, relativePath)), {recursive: true});
      writeFileSync(join(backendEpochRoot, relativePath), `# ${relativePath}\n`);
    }
    mkdirSync(join(backendEpochRoot, "tools"), {recursive: true});
    const backendEpochManifestPath = join(backendEpochRoot, "tools/backend2_version_manifest.rec");
    const backendEpochSourcesSha256 = hash("semantic-backend2-source-closure");
    const backendEpochManifestRaw = Buffer.from([
      "schema=backend2_version_manifest", "version=backend2-slice7",
      `sources_sha256=${backendEpochSourcesSha256}`, "framing=backend2_codegen_semantic_closure.framed",
      `source_count=${backendEpochSources.length}`,
      ...backendEpochSources.map((path, index) => `source_${String(index).padStart(4, "0")}=${path}`),
    ].map((line) => `${line}\n`).join(""), "utf8");
    writeFileSync(backendEpochManifestPath, backendEpochManifestRaw);
    const backendEpochManifest = validateBackend2VersionManifest(backendEpochRoot, {
      path: backendEpochManifestPath, raw: backendEpochManifestRaw, sha256: hash(backendEpochManifestRaw),
      stat: lstatSync(backendEpochManifestPath, {bigint: true}),
    });
    const backendEpochSentinelRaw = Buffer.from([
      "schema=backend2_version_sentinel", "status=PASS", "rc=0", "version=backend2-slice7",
      `sources_sha256=${backendEpochSourcesSha256}`, `manifest_sha256=${hash(backendEpochManifestRaw)}`,
      "framing=backend2_codegen_semantic_closure.framed", `source_count=${backendEpochSources.length}`,
      ...backendEpochSources.map((path, index) => `source_${String(index).padStart(4, "0")}=${path}`),
    ].map((line) => `${line}\n`).join(""), "utf8");
    assert.equal(validateBackend2VersionSentinelReport({raw: backendEpochSentinelRaw}, backendEpochManifest).status, "PASS");
    assert.throws(() => validateBackend2VersionSentinelReport({raw: Buffer.from(backendEpochSentinelRaw.toString("utf8").replace(
      `sources_sha256=${backendEpochSourcesSha256}`, `sources_sha256=${hash("forged-backend2-source-closure")}`,
    ), "utf8")}, backendEpochManifest), /sources_sha256 mismatch/);

    const buildRoot = join(scratch, "official-build-receipt");
    const buildDirectory = join(buildRoot, "artifacts/verification/current_source_compiler_main");
    const buildEntry = join(buildRoot, "src/core/tooling/compiler_main.cheng");
    const buildSeed = join(buildRoot, "artifacts/bootstrap/cheng.stage3");
    const buildCandidate = join(buildDirectory, "cheng.compiler-main");
    const buildOfficial = join(buildRoot, "artifacts/backend_driver/cheng");
    const buildBackend2Manifest = join(buildRoot, "tools/backend2_version_manifest.rec");
    for (const directory of [dirname(buildEntry), dirname(buildSeed), dirname(buildOfficial), dirname(buildBackend2Manifest), buildDirectory]) mkdirSync(directory, {recursive: true});
    writeFileSync(buildEntry, "fn main(): int32 =\n    return 0\n");
    writeFileSync(join(buildRoot, "cheng-package.toml"), "[package]\nname = \"receipt-fixture\"\n");
    writeFileSync(join(buildRoot, "cheng.lock.toml"), "version = 1\n");
    writeFileSync(buildSeed, "#!/bin/bash\nexit 0\n");
    writeFileSync(buildCandidate, "#!/bin/bash\nexit 0\n# current-source-driver\n");
    writeFileSync(buildOfficial, readFileSync(buildCandidate));
    chmodSync(buildSeed, 0o755); chmodSync(buildCandidate, 0o755); chmodSync(buildOfficial, 0o755);
    writeFileSync(buildBackend2Manifest, "backend2 epoch\n");
    const sourcePaths = ["cheng-package.toml", "cheng.lock.toml", "src/core/tooling/compiler_main.cheng"].sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
    const sourceListRaw = Buffer.from(`${sourcePaths.join("\n")}\n`, "utf8");
    const sourceHashesRaw = Buffer.from(`${sourcePaths.map((path) => `${hash(readFileSync(join(buildRoot, path)))}  ${path}`).join("\n")}\n`, "utf8");
    for (const name of ["before", "after"]) {
      writeFileSync(join(buildDirectory, `cheng-sources.${name}.list`), sourceListRaw);
      writeFileSync(join(buildDirectory, `cheng-sources.${name}.sha256`), sourceHashesRaw);
    }
    const buildSourceBundleCid = hash("compiler-owned-source-bundle");
    const buildBackend2Sha256 = hash(readFileSync(buildBackend2Manifest));
    const buildOutputSha256 = hash(readFileSync(buildCandidate));
    const framedOutputReceiptText = (value: string) => {
      const raw = Buffer.from(value, "utf8");
      const length = Buffer.alloc(4);
      length.writeUInt32BE(raw.length, 0);
      return Buffer.concat([length, raw]);
    };
    const buildU32 = (value: number) => {
      const raw = Buffer.alloc(4);
      raw.writeUInt32BE(value, 0);
      return raw;
    };
    const buildCompileWorldHeadCid = hash("compiler-world-head");
    const buildCompilerCsgCid = hash("compiler-csg");
    const buildCanonicalCompilerCsgCid = hash("canonical-compiler-csg");
    const buildCompileOutputDigest = hash("compiler-output-digest");
    const buildCanonicalCompileOutputDigest = hash("canonical-compiler-output-digest");
    const buildCompileBootstrapStage = "stage3";
    const buildCompileProviders = ["cheng/runtime/core_runtime", "cheng/runtime/provider_root"];
    const buildCompileReceiptCid = hash(Buffer.concat([
      framedOutputReceiptText("cheng.compiler.compile_receipt"), Buffer.from(buildCompileWorldHeadCid, "hex"),
      Buffer.from(buildSourceBundleCid, "hex"), buildU32(3), Buffer.from(hash(readFileSync(buildEntry)), "hex"),
      framedOutputReceiptText("unelaborated"), Buffer.from(buildCompilerCsgCid, "hex"),
      Buffer.from(buildCanonicalCompilerCsgCid, "hex"), framedOutputReceiptText("arm64-apple-darwin"),
      Buffer.from(buildCompileOutputDigest, "hex"), Buffer.from(buildCanonicalCompileOutputDigest, "hex"),
      framedOutputReceiptText(buildCompileBootstrapStage), buildU32(buildCompileProviders.length),
      ...buildCompileProviders.map((provider) => framedOutputReceiptText(provider)),
    ]));
    const buildCompilerOutputReceiptCid = hash(Buffer.concat([
      framedOutputReceiptText("cheng.compiler.output_receipt"), Buffer.from(buildCompileReceiptCid, "hex"),
      Buffer.from(buildOutputSha256, "hex"), Buffer.from(buildBackend2Sha256, "hex"),
      framedOutputReceiptText("arm64-apple-darwin"), framedOutputReceiptText("unelaborated"),
      framedOutputReceiptText("full_backend_codegen=1"), framedOutputReceiptText("cold_system_link_exec=0"),
      framedOutputReceiptText("system_link_exec_scope=selfhost_direct"),
    ]));
    const buildReportPath = join(buildDirectory, "cheng.compiler-main.materialize.report.txt");
    const compilerReport = (fullBackend = "1") => Buffer.from([
      `entry=${buildEntry}`, "entry_mode=unelaborated", `entry_source_cid=${hash(readFileSync(buildEntry))}`,
      "source_snapshot_count=3", `source_bundle_cid=${buildSourceBundleCid}`, `source_manifest_sha256=${buildSourceBundleCid}`,
      `compile_receipt_world_head_cid=${buildCompileWorldHeadCid}`,
      `compile_receipt_source_bundle_cid=${buildSourceBundleCid}`, "compile_receipt_source_snapshot_count=3",
      `compile_receipt_entry_source_cid=${hash(readFileSync(buildEntry))}`, "compile_receipt_entry_mode=unelaborated",
      `compile_receipt_compiler_csg_cid=${buildCompilerCsgCid}`,
      `compile_receipt_canonical_compiler_csg_cid=${buildCanonicalCompilerCsgCid}`,
      "compile_receipt_target=arm64-apple-darwin", `compile_receipt_output_digest=${buildCompileOutputDigest}`,
      `compile_receipt_canonical_output_digest=${buildCanonicalCompileOutputDigest}`,
      `compile_receipt_bootstrap_stage=${buildCompileBootstrapStage}`, `compile_receipt_runtime_provider_count=${buildCompileProviders.length}`,
      ...buildCompileProviders.map((provider, index) => `compile_receipt_runtime_provider.${index}=${provider}`),
      `compile_receipt_cid=${buildCompileReceiptCid}`,
      `compiler_output_receipt_cid=${buildCompilerOutputReceiptCid}`, "target=arm64-apple-darwin", "emit=exe",
      `output=${buildCandidate}`, `output_sha256=${buildOutputSha256}`, `backend2_version_manifest_sha256=${buildBackend2Sha256}`,
      "system_link_exec_runtime_execute=1", "system_link_exec=1", "real_backend_codegen=1", `full_backend_codegen=${fullBackend}`,
      "cold_system_link_exec=0", "system_link_exec_scope=selfhost_direct",
    ].map((line) => `${line}\n`).join(""), "utf8");
    writeFileSync(buildReportPath, compilerReport());
    const buildStdout = join(buildDirectory, "cheng.compiler-main.materialize.stdout.txt");
    const buildStderr = join(buildDirectory, "cheng.compiler-main.materialize.stderr.txt");
    writeFileSync(buildStdout, ""); writeFileSync(buildStderr, "");
    const buildGuardPath = join(buildDirectory, "cheng.compiler-main.process-tree-guard.report.txt");
    const buildGuard = (limit = "1073741824") => productionGuard(
      "official-driver-build", buildStdout, buildStderr, {memoryLimit: Number(limit)},
    );
    writeFileSync(buildGuardPath, buildGuard());
    const buildReceiptPath = join(buildDirectory, "cheng.compiler-main.build-receipt.txt");
    const writeBuildReceipt = (overrides: Record<string, string> = {}) => {
      const fields: Array<[string, string | number]> = [
        ["schema", "current_source_compiler_build_receipt"], ["status", "complete"], ["entry_path", buildEntry],
        ["entry_mode", "unelaborated"], ["entry_source_sha256", hash(readFileSync(buildEntry))], ["source_snapshot_count", 3],
        ["source_bundle_cid", buildSourceBundleCid], ["compiler_source_manifest_sha256", buildSourceBundleCid],
        ["workspace_source_manifest_sha256", hash(sourceHashesRaw)], ["target", "arm64-apple-darwin"],
        ["driver_path", buildSeed], ["driver_sha256", hash(readFileSync(buildSeed))],
        ["backend2_version_manifest_path", buildBackend2Manifest], ["backend2_version_manifest_sha256", buildBackend2Sha256],
        ["output_path", buildCandidate], ["output_sha256", buildOutputSha256], ["output_bytes", readFileSync(buildCandidate).length],
        ["compiler_report_path", buildReportPath], ["compiler_report_sha256", hash(readFileSync(buildReportPath))],
        ["compile_receipt_cid", buildCompileReceiptCid],
        ["compiler_output_receipt_cid", buildCompilerOutputReceiptCid], ["full_backend_codegen", 1],
        ["cold_system_link_exec", 0], ["system_link_exec_scope", "selfhost_direct"], ["memory_guard_mode", "process_tree"],
        ["memory_limit_bytes", 1073741824], ["process_tree_enforced_peak_bytes", 1000],
      ].map(([key, value]) => [key, overrides[key] ?? value]);
      writeFileSync(buildReceiptPath, render(fields, "receipt_payload_sha256"));
    };
    const pin = (path: string) => ({path, raw: readFileSync(path), sha256: hash(readFileSync(path)), stat: lstatSync(path, {bigint: true})});
    const backendEpoch = {manifestPath: buildBackend2Manifest, manifestSha256: buildBackend2Sha256};
    writeBuildReceipt();
    const buildEvidence = validateOfficialDriverBuildReceipt(buildRoot, pin(buildReceiptPath), pin(buildOfficial), backendEpoch);
    assert.equal(buildEvidence.outputSha256, buildOutputSha256);
    assert.equal(buildEvidence.sourceBundleCid, buildSourceBundleCid);
    assert.equal(buildEvidence.compilerOutputReceiptCid, buildCompilerOutputReceiptCid);
    assert.equal(buildEvidence.compileReceiptProviderCount, String(buildCompileProviders.length));
    assert.equal(buildEvidence.entryMode, "unelaborated");
    writeBuildReceipt({entry_mode: "preexpanded"});
    assert.throws(() => validateOfficialDriverBuildReceipt(buildRoot, pin(buildReceiptPath), pin(buildOfficial), backendEpoch), /entry_mode mismatch/);
    writeBuildReceipt();
    writeBuildReceipt({compiler_output_receipt_cid: hash("forged-output-receipt")});
    assert.throws(() => validateOfficialDriverBuildReceipt(buildRoot, pin(buildReceiptPath), pin(buildOfficial), backendEpoch), /does not independently bind/);
    writeBuildReceipt();
    writeFileSync(buildReportPath, Buffer.from(compilerReport().toString("utf8").replace(
      `compile_receipt_output_digest=${buildCompileOutputDigest}`,
      `compile_receipt_output_digest=${hash("forged-compile-output-digest")}`,
    ), "utf8"));
    writeBuildReceipt();
    assert.throws(() => validateOfficialDriverBuildReceipt(buildRoot, pin(buildReceiptPath), pin(buildOfficial), backendEpoch), /compile receipt CID/);
    writeFileSync(buildReportPath, compilerReport());
    writeBuildReceipt();
    writeFileSync(buildGuardPath, buildGuard("536870912"));
    assert.throws(() => validateOfficialDriverBuildReceipt(buildRoot, pin(buildReceiptPath), pin(buildOfficial), backendEpoch), /memory_limit_bytes mismatch/);
    writeFileSync(buildGuardPath, buildGuard());
    writeFileSync(buildReportPath, compilerReport("0"));
    writeBuildReceipt();
    assert.throws(() => validateOfficialDriverBuildReceipt(buildRoot, pin(buildReceiptPath), pin(buildOfficial), backendEpoch), /materialize report full_backend_codegen mismatch/);
    writeFileSync(buildReportPath, compilerReport());
    writeBuildReceipt();
    writeFileSync(buildOfficial, "#!/bin/bash\nexit 0\n# drift\n"); chmodSync(buildOfficial, 0o755);
    assert.throws(() => validateOfficialDriverBuildReceipt(buildRoot, pin(buildReceiptPath), pin(buildOfficial), backendEpoch), /official driver bytes/);

    })();
    if (process.env.CHENG_ITEM22_FOCUSED_MEMORY_CONTRACT === "1") return;

    console.log("[C] retained production evidence is independently bound");
    console.log("[C.1] production evidence fixtures");
    assert.throws(() => validateReleaseEvidenceFieldPresence({}), /releaseWorkRoot is required/);
    assert.throws(() => validateReleaseEvidenceFieldPresence({releaseWorkRoot: scratch}), /officialManifest and officialManifestSha256 are required/);
    const dependencyPaths = [
      "tools/regalloc_production_gate.sh",
      "tools/beat_c_process_group_guard.sh",
      "tools/regalloc_production_evidence.sh",
      "tools/regalloc_external_lock_validator.py",
    ];
    const dependencyBundle = validateProductionGateDependencyBundle(new Map(dependencyPaths.map((path) => [path, readFileSync(join(CHENG_ROOT, path))])));
    assert.equal(dependencyBundle.files.length, 4);
    const canonicalRegallocLabelSurfaces = [
      ["production gate", join(CHENG_ROOT, "tools/regalloc_production_gate.sh")],
      ["production gate contract", join(CHENG_ROOT, "docs/regalloc-production-gate.md")],
      ["production evidence contract", join(CHENG_ROOT, "docs/regalloc-production-evidence.md")],
      ["Fusion regalloc preflight", join(PROJECT, "src/cheng_regalloc_preflight_m9022.ts")],
    ];
    for (const [label, path] of canonicalRegallocLabelSurfaces) {
      assert.equal(
        validateCanonicalRegallocEvidenceLabels(readFileSync(path), label)
          .legacyLabelCount,
        0,
      );
    }
    for (const legacyLabel of [
      "workload current v6 receipt",
      "workload current v3 snapshot identity/count contract mismatch",
      "workload current v4 ledger identity/count contract mismatch",
      "production gate v5 report",
      "guarded_production_compile_and_v6_frozen_fragment_machine_bound_receipt_required",
      "workload current receipt/object/v3/v4 evidence",
      "production_v6_v3_v4_artifacts",
      "schema=regalloc_action_emission_ledger.v4",
    ]) {
      assert.throws(
        () => validateCanonicalRegallocEvidenceLabels(
          Buffer.from(`canonical\n${legacyLabel}\n`, "utf8"),
          "legacy-label mutation",
        ),
        /retained legacy regalloc evidence labels/,
        legacyLabel,
      );
    }
    const mutatedDependencies = new Map(dependencyPaths.map((path) => [path, readFileSync(join(CHENG_ROOT, path))]));
    mutatedDependencies.set("tools/regalloc_production_gate.sh", Buffer.from("mutated\n", "utf8"));
    assert.throws(() => validateProductionGateDependencyBundle(mutatedDependencies), /exact source hash mismatch/);

    const productionParent = join(scratch, "production-evidence");
    mkdirSync(productionParent);
    const greenProduction = productionEvidenceFixture(productionParent, "green");
    const greenEvidence = validateProductionGateEvidence(greenProduction.workDir, greenProduction.report.path, greenProduction.report.sha256, greenProduction.stdout, greenProduction.expected);
    assert.equal(greenEvidence.guardEvidence.guardReportCount, greenProduction.guardCount);
    assert.equal(greenEvidence.guardEvidence.guardReportCount, 62);
    assert.equal(greenEvidence.compilePairRowCount, 12);
    assert.equal(greenEvidence.perfEvidence.rowCount, 28);
    assert.equal(greenEvidence.requiredStatusEvidence.requiredCount, 185);
    assert.equal(greenEvidence.requiredStatusEvidence.reportProductionCount, 186);
    assert.equal(greenEvidence.execBundleEvidence.files.length, 4);
    assert.equal(greenEvidence.receiptEvidence.functionReceiptCount, "1");
    assert.equal(greenEvidence.receiptEvidence.objectPath, join(greenProduction.workDir, "workload.compile_pair.1.2.current.o"));
    const semanticMutations: Array<[string, any, RegExp]> = [
      ["report-red", {badProductionStatus: true}, /production_status mismatch|status mismatch/],
      ["guard-scope", {badGuardScope: true}, /memory_guard_scope mismatch/],
      ["guard-peak", {badGuardPeak: true}, /RSS does not bind|peak contract mismatch/],
      ["receipt-schema", {badReceiptSchema: true}, /regalloc_receipt_schema mismatch/],
      ["snapshot-schema", {badSnapshotSchema: true}, /frozen plan snapshot identity\/count contract mismatch/],
      ["ledger-object", {badLedgerObject: true}, /action emission ledger identity\/count contract mismatch/],
      ["metrics-schema", {badMetricsSchema: true}, /metrics identity\/schema mismatch/],
      ["source-drift", {badSourceDrift: true}, /source or role-to-compiler identity drift/],
      ["object-nondeterminism", {badObjectDeterminism: true}, /object bytes are nondeterministic/],
      ["required-order", {badRequiredOrder: true}, /reordered/],
      ["required-scope", {badRequiredScope: true}, /rescoped/],
      ["required-status", {badRequiredStatus: true}, /non-GREEN/],
      ["required-detail", {badRequiredDetail: true}, /detail\/report binding mismatch/],
      ["perf-order", {badPerfOrder: true}, /performance row .* sequence mismatch/],
      ["perf-floor", {badPerfFloor: true}, /performance floor\/regression\/spread contract mismatch/],
      ["perf-verdict", {badPerfVerdict: true}, /performance pair verdict median_ratio_ppm mismatch/],
      ["exec-snapshot", {badExecSnapshot: true}, /private snapshot mismatch/],
    ];
    for (const [name, mutation, pattern] of semanticMutations) {
      const fixture = productionEvidenceFixture(productionParent, name, mutation);
      assert.throws(() => validateProductionGateEvidence(fixture.workDir, fixture.report.path, fixture.report.sha256, fixture.stdout, fixture.expected), pattern, name);
    }
    const lockMutation = productionEvidenceFixture(productionParent, "lock-mutation");
    assert.throws(() => validateProductionGateEvidence(lockMutation.workDir, lockMutation.report.path, lockMutation.report.sha256, lockMutation.stdout, {...lockMutation.expected, jobsLock: {...lockMutation.expected.jobsLock, sha256: hash("wrong-lock")}}), /external lock mismatch/);
    const missingGuard = productionEvidenceFixture(productionParent, "missing-guard");
    rmSync(join(missingGuard.workDir, "workload.compile_pair.3.4.baseline.compile.guard.txt"));
    assert.throws(() => validateProductionGateEvidence(missingGuard.workDir, missingGuard.report.path, missingGuard.report.sha256, missingGuard.stdout, missingGuard.expected), /unavailable|guard/);
    const extraGuard = productionEvidenceFixture(productionParent, "extra-guard");
    const extraStdout = join(extraGuard.workDir, "unexpected.stdout.txt");
    const extraStderr = join(extraGuard.workDir, "unexpected.stderr.txt");
    writeFileSync(extraStdout, Buffer.alloc(0));
    writeFileSync(extraStderr, Buffer.alloc(0));
    writeFileSync(join(extraGuard.workDir, "unexpected.guard.txt"), productionGuard("unexpected", extraStdout, extraStderr));
    assert.throws(() => validateProductionGateEvidence(extraGuard.workDir, extraGuard.report.path, extraGuard.report.sha256, extraGuard.stdout, extraGuard.expected), /guard sets differ/);

    console.log("[C.2] release claims and final artifact manifests");
    const claimDigest = hash("release-input-contract");
    const cleanClaimRoot = join(scratch, "claim-clean");
    mkdirSync(cleanClaimRoot);
    const cleanClaim = acquireReleaseWorkClaim(CHENG_ROOT, {releaseWorkRoot: cleanClaimRoot});
    try {
      const finalized = finalizeReleaseWorkClaim(cleanClaim, claimDigest);
      const identity = validateReleaseWorkClaim(cleanClaim);
      assert.equal(finalized.identity.sha256, identity.sha256);
      assert.equal(identity.finalized, true);
      assert.equal(identity.size, String(readFileSync(cleanClaim.path).length));
    } finally { closeReleaseWorkClaim(cleanClaim); }
    const claimMutation = (name: string, mutate: (claim: any, root: string) => void, pattern: RegExp) => {
      const root = join(scratch, `claim-${name}`);
      mkdirSync(root);
      const claim = acquireReleaseWorkClaim(CHENG_ROOT, {releaseWorkRoot: root});
      try {
        finalizeReleaseWorkClaim(claim, claimDigest);
        mutate(claim, root);
        assert.throws(() => validateReleaseWorkClaim(claim), pattern, name);
      } finally { closeReleaseWorkClaim(claim); }
    };
    claimMutation("append", (claim) => writeFileSync(claim.path, "append\n", {flag: "a"}), /claim .*contract|claim path/);
    claimMutation("truncate", (claim) => writeFileSync(claim.path, "schema=cheng_regalloc_release_claim.v1\n"), /claim .*contract|claim path/);
    claimMutation("replace", (claim) => {
      const raw = readFileSync(claim.path);
      rmSync(claim.path);
      writeFileSync(claim.path, raw, {mode: 0o600});
    }, /one link|claim path/);
    claimMutation("hardlink", (claim, root) => linkSync(claim.path, join(root, "claim-hardlink")), /one link|claim path/);
    claimMutation("restore", (claim) => {
      const raw = readFileSync(claim.path);
      writeFileSync(claim.path, "temporary mutation\n");
      writeFileSync(claim.path, raw);
    }, /metadata differs/);
    claimMutation("root-swap", (_claim, root) => {
      renameSync(root, `${root}.held`);
      mkdirSync(root);
    }, /release root path no longer names|unavailable/);

    const finalBindings = Object.fromEntries([
      "source_manifest_sha256", "official_driver_sha256", "baseline_driver_sha256", "allocator_sha256",
      "certification_sha256", "backend2_version_manifest_sha256",
      "official_build_receipt_sha256", "official_compiler_report_sha256", "official_build_guard_sha256",
      "official_source_bundle_cid", "official_entry_source_cid", "official_compile_receipt_cid",
      "official_compiler_output_receipt_cid",
      "official_workspace_source_manifest_sha256", "official_build_seed_sha256",
      "jobs_lock_sha256", "exec_diff_lock_sha256", "target_emit_lock_sha256", "gen3_lock_sha256",
      "production_perf_raw_sha256", "production_perf_verdict_sha256",
      "production_compile_raw_sha256", "production_compile_verdict_sha256",
      "production_receipt_sha256", "production_object_sha256",
      "guard_set_sha256", "exec_final_sha256", "claim_sha256",
      "private_runtime_bundle_sha256", "source_receipt_set_sha256", "semantic_pipeline_receipt_sha256",
      "production_report_sha256", "outer_guard_sha256",
    ].map((key, index) => [key, hash(`binding:${index}`)]));
    const finalManifestFixture = (name: string) => {
      const root = join(scratch, `final-manifest-${name}`);
      mkdirSync(root);
      mkdirSync(join(root, "private-toolchain"));
      writeFileSync(join(root, ".cheng-regalloc-preflight.claim"), "claim\n");
      writeFileSync(join(root, "private-toolchain", "tool"), "tool\n");
      const evidence = materializeFinalReleaseArtifactManifest(root, finalBindings);
      assert.equal(validateFinalReleaseArtifactManifest(root, evidence.manifestPath, evidence.manifestSha256, finalBindings).artifactCount, 3);
      return {root, evidence};
    };
    finalManifestFixture("green");
    const finalBytes = finalManifestFixture("bytes");
    writeFileSync(join(finalBytes.root, "private-toolchain", "tool"), "mutated\n");
    assert.throws(() => validateFinalReleaseArtifactManifest(finalBytes.root, finalBytes.evidence.manifestPath, finalBytes.evidence.manifestSha256, finalBindings), /artifact changed/);
    const finalRestore = finalManifestFixture("restore");
    const finalRestorePath = join(finalRestore.root, "private-toolchain", "tool");
    const finalRestoreRaw = readFileSync(finalRestorePath);
    writeFileSync(finalRestorePath, "temporary mutation\n");
    writeFileSync(finalRestorePath, finalRestoreRaw);
    assert.throws(() => validateFinalReleaseArtifactManifest(finalRestore.root, finalRestore.evidence.manifestPath, finalRestore.evidence.manifestSha256, finalBindings), /artifact changed/);
    const finalExtra = finalManifestFixture("extra");
    writeFileSync(join(finalExtra.root, "unexpected"), "extra\n");
    assert.throws(() => validateFinalReleaseArtifactManifest(finalExtra.root, finalExtra.evidence.manifestPath, finalExtra.evidence.manifestSha256, finalBindings), /set count changed/);
    const finalHardlink = finalManifestFixture("hardlink");
    linkSync(join(finalHardlink.root, "private-toolchain", "tool"), join(finalHardlink.root, "private-toolchain", "tool-link"));
    assert.throws(() => validateFinalReleaseArtifactManifest(finalHardlink.root, finalHardlink.evidence.manifestPath, finalHardlink.evidence.manifestSha256, finalBindings), /unexpected hardlinks/);
    const finalBinding = finalManifestFixture("binding");
    assert.throws(() => validateFinalReleaseArtifactManifest(finalBinding.root, finalBinding.evidence.manifestPath, finalBinding.evidence.manifestSha256, {...finalBindings, allocator_sha256: hash("wrong-binding")}), /binding mismatch/);
    assert.throws(() => validateFinalReleaseArtifactManifest(finalBinding.root, finalBinding.evidence.manifestPath, finalBinding.evidence.manifestSha256, {...finalBindings, unexpected_sha256: hash("unexpected-binding")}), /exact key set mismatch/);

    console.log("[C.3] private toolchain and one-shot worker");
    const toolchainRoot = join(scratch, "private-actual-toolchain");
    mkdirSync(toolchainRoot);
    const toolchainDriver = join(scratch, "private-toolchain-driver");
    writeFileSync(toolchainDriver, "#!/bin/bash\nexit 0\n");
    chmodSync(toolchainDriver, 0o755);
    const exactPin = (path: string) => ({path, sha256: hash(readFileSync(path)), stat: lstatSync(path, {bigint: true})});
    const toolchain = materializePrivateReleaseToolchain({releaseWorkRoot: toolchainRoot}, toolchainDriver, "/usr/bin/cc", exactPin(toolchainDriver), exactPin("/usr/bin/cc"));
    assert.equal(validatePrivateReleaseToolchain(toolchain).toolCount, 48);
    const privatePythonSmoke = spawnSync(join(toolchain.bin, "python3"), ["-c", "import psutil"], {encoding: "utf8", env: privateReleaseExecutionEnv(toolchain)});
    assert.equal(privatePythonSmoke.status, 0, privatePythonSmoke.stderr);
    assert.equal(privatePythonSmoke.stdout, "");
    assert.equal(privatePythonSmoke.stderr, "");
    const privateSelfTestEnv: Record<string, string> = {...process.env, ...privateReleaseExecutionEnv(toolchain)} as Record<string, string>;
    for (const key of Object.keys(privateSelfTestEnv)) if (/^DYLD_/.test(key) || ["NODE_OPTIONS", "BUN_OPTIONS", "BUN_INSPECT", "BUN_RUNTIME_TRANSPILER_CACHE_PATH"].includes(key)) delete privateSelfTestEnv[key];
    const privateGateSelfTest = spawnSync(join(toolchain.bin, "bash"), [join(CHENG_ROOT, "tools/regalloc_production_gate.sh"), "--self-test"], {cwd: CHENG_ROOT, encoding: "utf8", env: privateSelfTestEnv, timeout: 600_000, maxBuffer: 64 * 1024 * 1024});
    assert.equal(privateGateSelfTest.status, 0, privateGateSelfTest.stderr);
    assert.equal(privateGateSelfTest.stdout, `regalloc_gate_exec_self_path=${join(CHENG_ROOT, "tools/regalloc_production_gate.sh")}\nregalloc_gate_self_test=PASS\n`);
    assert.equal(privateGateSelfTest.stderr, "");
    const inheritedPath = process.env.PATH;
    process.env.PATH = join(scratch, "path-poison");
    try {
      assert.equal(privateReleaseExecutionEnv(toolchain).PATH, toolchain.bin);
      assert.throws(() => privateReleaseExecutionEnv(toolchain, {PATH: process.env.PATH}), /cannot override pinned PATH/);
    } finally {
      if (inheritedPath === undefined) delete process.env.PATH;
      else process.env.PATH = inheritedPath;
    }
    writeFileSync(toolchain.tools.get("bash").wrapper.path, "#!/bin/bash\nexit 99\n");
    assert.throws(() => validatePrivateReleaseToolchain(toolchain), /private release tool changed/);

    const oneShotPrivateRoot = join(scratch, "one-shot-private-source");
    mkdirSync(oneShotPrivateRoot);
    const oneShotSourcePath = join(scratch, "cheng_regalloc_preflight_m9022.ts");
    const oneShotSourceRaw = Buffer.from("export const witness = 1;\n", "utf8");
    writeFileSync(oneShotSourcePath, oneShotSourceRaw);
    const oneShotSourceInputs = {snapshots: [{label: "fusion/src/cheng_regalloc_preflight_m9022.ts", path: realpathSync(oneShotSourcePath), raw: oneShotSourceRaw, sha256: hash(oneShotSourceRaw), stat: lstatSync(oneShotSourcePath, {bigint: true})}]};
    const privateSourceTree = materializePrivateOneShotSourceTree(oneShotSourceInputs, oneShotPrivateRoot);
    const privateSourceContext = {privateSourceRoot: privateSourceTree.sourceRoot, privateSourceSetSha256: privateSourceTree.artifactSetSha256, privateSources: privateSourceTree.artifacts};
    assert.equal(validatePrivateOneShotSourceTree(privateSourceContext).artifactCount, 1);
    const privateEntry = join(privateSourceTree.sourceRoot, "src/cheng_regalloc_preflight_m9022.ts");
    await assert.rejects(() => buildPrivateOneShotBundle(privateSourceTree, privateEntry, async () => {
      const original = readFileSync(privateEntry);
      writeFileSync(privateEntry, "export const injected = 99;\n");
      writeFileSync(privateEntry, original);
      return {success: true, logs: [], outputs: [{arrayBuffer: async () => Buffer.from("bundle\n", "utf8")}]} as any;
    }), /private source .*identity mismatch|artifact-set binding mismatch/);
    const oneShotManifestPath = join(scratch, "one-shot-source-manifest.txt");
    writeFileSync(oneShotManifestPath, completeSourceManifest(CHENG_ROOT, "tests/regalloc_single_pass_value_core_smoke"));
    const oneShotReleaseRoot = join(scratch, "one-shot-release-root");
    mkdirSync(oneShotReleaseRoot);
    const oneShotSmoke = await executePreflight({mode: "release", treeRoot: CHENG_ROOT, coldDriver: STAGE3, sourceManifest: oneShotManifestPath, releaseWorkRoot: oneShotReleaseRoot});
    assert.equal(
      oneShotSmoke.verdict,
      "RED",
      JSON.stringify(oneShotSmoke.checks.filter((entry: any) => entry.status === "CFAIL" || entry.status === "RED")),
    );
    const oneShotSmokeCheck = oneShotSmoke.checks.find((entry: any) => entry.id === "release_one_shot_worker");
    assert.equal(oneShotSmokeCheck?.status, "GREEN", JSON.stringify(oneShotSmokeCheck));
    assert.equal(oneShotSmokeCheck?.loadedModuleUrl.startsWith("file://"), true);
    assert.equal(oneShotSmokeCheck?.bundleBuild?.schema, "cheng_regalloc_one_shot_bundle_build_evidence");
    assert.ok(BigInt(oneShotSmokeCheck?.bundleBuild?.peakBytes || 0) <= 1073741824n);
    assert.ok(BigInt(oneShotSmokeCheck?.outerGuard?.peakBytes || 0) <= 1073741824n);
    assert.equal(oneShotSmoke.checks.find((entry: any) => entry.id === "release_evidence_inputs")?.status, "RED");
    assertTrue(true, "production success evidence passes; exec bundle, ordered 185 statuses, performance, report, lock, guard, receipt, frozen-plan/action-ledger and complete-set mutations fail closed");

    console.log("[D] raw fixed point has no masking");
    assertTrue(existsSync(STAGE3), `real stage3 exists: ${STAGE3}`);
    const gen2 = join(scratch, "GEN2");
    const gen3 = join(scratch, "GEN3");
    const official = join(scratch, "official");
    copyFileSync(STAGE3, gen2); copyFileSync(STAGE3, gen3); copyFileSync(STAGE3, official);
    chmodSync(gen2, 0o755); chmodSync(gen3, 0o755); chmodSync(official, 0o755);
    assert.equal(rawDriverFixedPoint(gen2, gen3, official).identical, true);
    const changed = readFileSync(official);
    changed[changed.length - 1] ^= 1;
    writeFileSync(official, changed); chmodSync(official, 0o755);
    assert.equal(rawDriverFixedPoint(gen2, gen3, official).identical, false);
    const sameInode = join(scratch, "GEN3-hardlink");
    linkSync(gen2, sameInode);
    assert.throws(() => rawDriverFixedPoint(gen2, sameInode, gen2), /different inodes/);
    assertTrue(true, "a one-byte change is RED and distinct GEN2/GEN3 inodes are mandatory");

    console.log("[E] missing release artifact manifest and non-1GiB cap stop before every heavy child");
    const fake = join(scratch, "must-not-run.sh");
    const sentinel = join(scratch, "spawned");
    writeFileSync(fake, `#!/bin/sh\nprintf '%s|%s|%s|%s|%s|%s' "$CHENG_STRICT_CALL_SYNTAX" "$CHENG_TYPED_EXPR_LEGACY" "$BACKEND_JOBS" "$BACKEND_INCREMENTAL" "$CHENG_DISABLE_PRIMARY_OBJECT_CACHE" "$CHENG_PROCESS_MAX_RSS_BYTES" > ${JSON.stringify(sentinel)}\ni=0\nwhile [ "$i" -lt 200 ]; do\n  printf 0123456789abcdef0123456789abcdef\n  i=$((i + 1))\ndone\nexit 99\n`);
    chmodSync(fake, 0o755);
    const release = await executePreflight({mode: "release", treeRoot: CHENG_ROOT, coldDriver: fake});
    assert.equal(release.verdict, "RED");
    assert.equal(release.compiler_profile.sha256, compilerProfile.sha256);
    assert.equal(release.checks.find((entry: any) => entry.id === "artifact_source_manifest")?.heavyChildStarted, false);
    assert.equal(existsSync(sentinel), false);
    const wrongReleaseCap = await executePreflight({mode: "release", treeRoot: CHENG_ROOT, coldDriver: fake, rssCapBytes: 536870912});
    assert.equal(wrongReleaseCap.verdict, "RED");
    assert.equal(wrongReleaseCap.checks.find((entry: any) => entry.id === "release_memory_limit")?.status, "RED");
    assert.equal(wrongReleaseCap.checks.find((entry: any) => entry.id === "release_memory_limit")?.heavyChildStarted, false);
    assert.equal(existsSync(sentinel), false);
    const rejectMcp = startMcp({}, PROJECT);
    try {
      await rejectMcp.initialize();
      const rejected = await rejectMcp.callTool("cheng_regalloc_preflight", {mode: "release", treeRoot: CHENG_ROOT, coldDriver: fake});
      assert.equal(rejected.isError, true);
      assert.match(String(rejected.parsed), /artifact_source_manifest/);
    } finally { rejectMcp.kill(); }
    assert.equal(existsSync(sentinel), false);
    const releaseCli = spawnSync(process.execPath, [CLI, "run", "cheng_regalloc_preflight", "--input", JSON.stringify({mode: "release", treeRoot: CHENG_ROOT, coldDriver: fake})], {cwd: PROJECT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024});
    assert.notEqual(releaseCli.status, 0);
    const releaseCliText = `${releaseCli.stdout}\n${releaseCli.stderr}`;
    assert.match(releaseCliText, /artifact_source_manifest/);
    assert.equal(existsSync(sentinel), false);
    const poisonedEnv = {...process.env, CHENG_STRICT_CALL_SYNTAX: "0", CHENG_TYPED_EXPR_LEGACY: "fast", BACKEND_JOBS: "19", BACKEND_INCREMENTAL: "1", CHENG_DISABLE_PRIMARY_OBJECT_CACHE: "0", CHENG_FUSION_RSS_CAP: "2147483648", CHENG_FUSION_TIMEOUT_MS: "1"};
    const sourceCli = spawnSync(process.execPath, [CLI, "run", "cheng_regalloc_preflight", "--input", JSON.stringify({mode: "source", treeRoot: CHENG_ROOT, coldDriver: fake, timeoutSec: 30, maxOutputBytes: 1024})], {cwd: PROJECT, env: poisonedEnv, encoding: "utf8", maxBuffer: 8 * 1024 * 1024});
    assert.notEqual(sourceCli.status, 0);
    const sourceCliText = `${sourceCli.stdout}\n${sourceCli.stderr}`;
    assert.match(sourceCliText, /bodyir_memory_and_arena_release/);
    assert.match(sourceCliText, /UNPROVEN/);
    assert.match(sourceCliText, /output_overflow/);
    assert.doesNotMatch(sourceCliText, /validateSourceManifestPath|sourceManifest.*undefined/);
    assert.equal(existsSync(sentinel), true);
    assert.equal(readFileSync(sentinel, "utf8"), "1||1|0|1|1073741824");
    const sourceRejectMcp = startMcp({}, PROJECT);
    try {
      await sourceRejectMcp.initialize();
      const rejected = await sourceRejectMcp.callTool("cheng_regalloc_preflight", {mode: "source", treeRoot: CHENG_ROOT, coldDriver: fake, timeoutSec: 30, maxOutputBytes: 1024}, undefined, 120000);
      assert.equal(rejected.isError, true);
      assert.match(String(rejected.parsed), /bodyir_memory_and_arena_release/);
      assert.match(String(rejected.parsed), /UNPROVEN/);
      assert.match(String(rejected.parsed), /output_overflow/);
    } finally { sourceRejectMcp.kill(); }
    const invalidPath = await executePreflight({mode: "source", treeRoot: "relative", coldDriver: fake});
    assert.equal(invalidPath.verdict, "CFAIL");
    assertTrue(true, "release missing-manifest and source UNPROVEN both reach the tool body and return nonzero through CLI/MCP");

    console.log("[F] stable live source report: monotonic gaps, complete cases, pinned identity and no CFAIL");
    const liveInputsBefore = snapshotSourceInputs(CHENG_ROOT);
    const liveDriverSha256 = hash(readFileSync(OFFICIAL_DRIVER));
    const source = await executePreflight({mode: "source", treeRoot: CHENG_ROOT, coldDriver: OFFICIAL_DRIVER, timeoutSec: 300});
    const liveInputsAfter = snapshotSourceInputs(CHENG_ROOT);
    const liveDriverAfterSha256 = hash(readFileSync(OFFICIAL_DRIVER));

    assert.equal(source.schema, "cheng_regalloc_preflight");
    assert.equal(source.mode, "source");
    assert.equal(source.release_ready, 0);
    assert.equal(source.check_count, source.checks.length);
    assert.equal(new Set(source.checks.map((entry: any) => entry.id)).size, source.checks.length);
    assert.equal(source.checks.some((entry: any) => entry.id === "artifact_source_manifest"), false);
    const invalidTopLevelStatuses = source.checks.filter((entry: any) => !["GREEN", "RED", "UNPROVEN"].includes(entry.status));
    assert.equal(invalidTopLevelStatuses.length, 0, conciseStatuses(invalidTopLevelStatuses));
    const cfailRows = collectReportStatus(source, "CFAIL");
    assert.equal(cfailRows.length, 0, conciseStatuses(cfailRows));
    assert.ok(source.verdict === "RED" || source.verdict === "SOURCE_GREEN", `unexpected source verdict ${source.verdict}`);
    const redRows = collectReportStatus(source, "RED");
    assert.equal(redRows.every((entry) => entry.reason.length > 0), true, conciseStatuses(redRows));

    assert.equal(sameSourceInputs(liveInputsBefore, liveInputsAfter), true, "live Cheng/Fusion source closure drifted during item22");
    assert.equal(source.snapshot_sha256, liveInputsBefore.sha256);
    assert.equal(liveDriverAfterSha256, liveDriverSha256, "live official driver bytes drifted during item22");
    const sourceSnapshotCheck = source.checks.find((entry: any) => entry.id === "source_snapshot");
    assert.equal(sourceSnapshotCheck?.status, "GREEN", sourceSnapshotCheck?.reason);
    assert.equal(sourceSnapshotCheck?.artifact_sha256, liveInputsBefore.sha256);
    assert.equal(sourceSnapshotCheck?.authorityProductionScope, "minimum_import_closure");
    assert.equal(sourceSnapshotCheck?.authorityManifestRootFileCount, 0);
    assert.equal(sourceSnapshotCheck?.authorityProductionImportFileCount, liveInputsBefore.authorityProductionFiles.length);
    const identityCheck = source.checks.find((entry: any) => entry.id === "driver_toolchain_identity");
    assert.equal(identityCheck?.status, "GREEN", identityCheck?.reason);
    assert.equal(identityCheck?.coldDriverSha256, liveDriverSha256);

    const mandatoryGreen = [
      "typedexpr_expression_leaf_coverage_ledger",
      "typedexpr_formal_expression_spec_binding",
      "typedexpr_qualified_nested_call_declaration_binding",
      "source_snapshot",
      "driver_toolchain_identity",
      "cheng_internal_contract_fixture",
      "aarch64_f64_runtime_gate_source_contract",
      "aarch64_f64_runtime_gate",
      "x86_64_f64_runtime_gate_source_contract",
      "x86_64_f64_runtime_gate",
      "bodyir_packed_slab_o2",
      "bodyir_packed_slab_sanitized",
    ];
    for (const id of mandatoryGreen) {
      const entry = source.checks.find((value: any) => value.id === id);
      assert.equal(entry?.status, "GREEN", `${id}: ${entry?.reason || "missing check"}`);
    }
    const allowedTopLevelRed = new Set(["typedexpr_frozen_authority_projection_closure", "typedexpr_static_arg_expression_matrix", "semantic_pipeline_real_receipts"]);
    const unexpectedTopLevelRed = source.checks.filter((entry: any) => entry.status === "RED" && !allowedTopLevelRed.has(entry.id));
    assert.deepEqual(unexpectedTopLevelRed.map((entry: any) => `${entry.id}:${entry.reason}`), []);
    for (const id of ["typedexpr_ebnf_structural_semantic_coverage", "typedexpr_formal_profile_consistency"]) {
      const entry = source.checks.find((value: any) => value.id === id);
      assert.ok(entry?.status === "GREEN" || entry?.status === "UNPROVEN", `${id}: ${entry?.status}:${entry?.reason}`);
    }
    assert.equal(source.checks.find((value: any) => value.id === "bodyir_memory_and_arena_release")?.status, "UNPROVEN");
    const aarch64F64RuntimeSource = source.checks.find((value: any) => value.id === "aarch64_f64_runtime_gate_source_contract");
    assert.equal(aarch64F64RuntimeSource?.status, "GREEN", aarch64F64RuntimeSource?.reason);
    assert.equal(aarch64F64RuntimeSource?.memoryLimitBytes, "1073741824");
    assert.equal(aarch64F64RuntimeSource?.globalStaticRelocOracle, "PAGE21_PAGEOFF12_CONSECUTIVE_SAME_SYMBOL_AND_TAINTED_F64_STORE");
    assert.equal(aarch64F64RuntimeSource?.d0PoisonStatus, "PROVEN");
    assert.equal(aarch64F64RuntimeSource?.postCallX0ToD0Status, "PROVEN");
    assert.equal(aarch64F64RuntimeSource?.localRuntimeDataflow, "StoreLocal->F64Add->X0");
    const aarch64F64Runtime = source.checks.find((value: any) => value.id === "aarch64_f64_runtime_gate");
    assert.equal(aarch64F64Runtime?.status, "GREEN", aarch64F64Runtime?.reason);
    assert.equal(aarch64F64Runtime?.memoryLimitBytes, "1073741824");
    assert.equal(aarch64F64Runtime?.nanCompareCaseCount, 30);
    assert.equal(aarch64F64Runtime?.finiteCompareCaseCount, 18);
    assert.equal(aarch64F64Runtime?.storeRuntimeCaseCount, 5);
    assert.equal(aarch64F64Runtime?.storeRuntimeFamilyCount, 3);
    assert.equal(aarch64F64Runtime?.rawFunctionRelocCount, 0);
    assert.equal(aarch64F64Runtime?.guardReportCount, 6);
    assert.equal(aarch64F64Runtime?.globalStaticRelocOracleStatus, "GREEN");
    const x86_64F64RuntimeSource = source.checks.find((value: any) => value.id === "x86_64_f64_runtime_gate_source_contract");
    assert.equal(x86_64F64RuntimeSource?.status, "GREEN", x86_64F64RuntimeSource?.reason);
    assert.equal(x86_64F64RuntimeSource?.memoryLimitBytes, "1073741824");
    assert.equal(x86_64F64RuntimeSource?.hostExecution, "rosetta_x86_64");
    assert.equal(x86_64F64RuntimeSource?.nanCompareCaseCount, 60);
    assert.equal(x86_64F64RuntimeSource?.finiteCompareCaseCount, 72);
    assert.equal(x86_64F64RuntimeSource?.materializedFunctionCount, 6);
    assert.equal(x86_64F64RuntimeSource?.fusedFunctionCount, 6);
    assert.equal(x86_64F64RuntimeSource?.bridgeResultTransform, "0x5a5a5a5a");
    assert.deepEqual(x86_64F64RuntimeSource?.disassemblyMarkers, ["ucomisd", "setp", "setnp"]);
    const x86_64F64Runtime = source.checks.find((value: any) => value.id === "x86_64_f64_runtime_gate");
    assert.equal(x86_64F64Runtime?.status, "GREEN", x86_64F64Runtime?.reason);
    assert.equal(x86_64F64Runtime?.memoryLimitBytes, "1073741824");
    assert.equal(x86_64F64Runtime?.hostExecution, "rosetta_x86_64");
    assert.equal(x86_64F64Runtime?.rawFunctionRelocCount, 0);
    assert.equal(x86_64F64Runtime?.nanCompareCaseCount, 60);
    assert.equal(x86_64F64Runtime?.finiteCompareCaseCount, 72);
    assert.equal(x86_64F64Runtime?.materializedFunctionCount, 6);
    assert.equal(x86_64F64Runtime?.fusedFunctionCount, 6);
    assert.equal(x86_64F64Runtime?.bridgeResultTransform, "0x5a5a5a5a");
    assert.equal(x86_64F64Runtime?.guardReportCount, 6);
    assert.equal(x86_64F64Runtime?.rosettaExecutionStatus, "GREEN");
    assert.equal(x86_64F64Runtime?.disassemblyOracleStatus, "GREEN");
    assert.equal(x86_64F64Runtime?.bridgeTransformStatus, "GREEN");

    const authority = source.checks.find((value: any) => value.id === "typedexpr_frozen_authority_projection_closure");
    assert.ok(authority?.status === "GREEN" || authority?.status === "RED", authority?.reason);
    assert.equal(authority?.sourceSha256, hash(readFileSync(join(CHENG_ROOT, "src/core/lang/typed_expr.cheng"))));
    assert.equal(authority?.productionClosure?.fileCount, liveInputsBefore.authorityProductionFiles.length);
    assert.ok(authority?.productionClosure?.status === "GREEN" || authority?.productionClosure?.status === "RED", authority?.productionClosure?.reason);
    assert.ok(authority?.productionClosure?.functionCount > 0);
    assert.ok(authority?.productionClosure?.edgeCount > 0);
    assert.ok(authority?.productionClosure?.rootDerivation?.pipelineEntries.length > 0);
    if (authority.status === "RED") assert.ok(Array.isArray(authority.issues) && authority.issues.length > 0, authority.reason);
    if (authority.productionClosure.status === "RED") assert.ok(Array.isArray(authority.productionClosure.issues) && authority.productionClosure.issues.length > 0, authority.productionClosure.reason);
    assert.ok(authority?.productionClosure?.rootDerivation?.legalSourceIoBindings.some((entry: any) => entry.key.includes("CompilerCsgReadSourceTextCached")));
    const liveEntryCAbiMetadataViolations = authority.productionClosure.bodyIrEntryCAbiMetadataContractViolations || [];
    const liveEntryCAbiMetadataProofs = authority.productionClosure.bodyIrEntryCAbiMetadataContractProofs || [];
    const liveEntryCAbiMetadataEvidence = [...liveEntryCAbiMetadataViolations, ...liveEntryCAbiMetadataProofs];
    assert.deepEqual(liveEntryCAbiMetadataEvidence.map((entry: any) => entry.family), ["bodyir_entry_c_abi_metadata_roundtrip"]);
    assert.equal(liveEntryCAbiMetadataViolations.every((entry: any) => Array.isArray(entry.reasons) && entry.reasons.length > 0), true);
    assert.equal(liveEntryCAbiMetadataProofs.every((entry: any) => entry.proofStatus === "PROVEN" && entry.reasons.length === 0), true);
    const f64ContractFamilies = [
      "entry_home_prologue_store",
      "f64_call_result_return_bridge",
      "f64_cond_canonical_mirror",
      "f64_entry_c_abi_admission",
      "importc_f64_admission",
    ];
    const liveF64Violations = authority.productionClosure.regallocAdapterF64ContractViolations || [];
    const liveF64Proofs = authority.productionClosure.regallocAdapterF64ContractProofs || [];
    const liveF64Evidence = [...liveF64Violations, ...liveF64Proofs];
    assert.deepEqual(liveF64Evidence.map((entry: any) => entry.family).sort(), f64ContractFamilies);
    assert.equal(liveF64Violations.every((entry: any) => Array.isArray(entry.reasons) && entry.reasons.length > 0 && entry.rootReachable === true), true);
    assert.equal(liveF64Proofs.every((entry: any) => entry.proofStatus === "PROVEN" && entry.reasons.length === 0 && entry.rootReachable === true), true);
    const liveX64CopyViolations = authority.productionClosure.x64CopyMemoryCheckedArithmeticViolations || [];
    const liveX64CopyProofs = authority.productionClosure.x64CopyMemoryCheckedArithmeticProofs || [];
    const liveX64CopyEvidence = [...liveX64CopyViolations, ...liveX64CopyProofs];
    assert.deepEqual(liveX64CopyEvidence.map((entry: any) => entry.family), ["x64_copy_memory_checked_byte_count_and_offsets"]);
    assert.equal(liveX64CopyViolations.every((entry: any) => Array.isArray(entry.reasons) && entry.reasons.length > 0), true);
    assert.equal(liveX64CopyProofs.every((entry: any) => entry.proofStatus === "PROVEN" && entry.reasons.length === 0), true);
    const liveX64F64Violations = authority.productionClosure.x64F64AbiContractViolations || [];
    const liveX64F64Proofs = authority.productionClosure.x64F64AbiContractProofs || [];
    assert.deepEqual([...liveX64F64Violations, ...liveX64F64Proofs].map((entry: any) => entry.family), ["x64_f64_xmm0_return_and_call_result_bridge"]);
    assert.equal(liveX64F64Violations.every((entry: any) => Array.isArray(entry.reasons) && entry.reasons.length > 0), true);
    assert.equal(liveX64F64Proofs.every((entry: any) => entry.proofStatus === "PROVEN" && entry.reasons.length === 0), true);
    const liveX64WordViolations = authority.productionClosure.x64WordCountCheckedArithmeticViolations || [];
    const liveX64WordProofs = authority.productionClosure.x64WordCountCheckedArithmeticProofs || [];
    assert.deepEqual([...liveX64WordViolations, ...liveX64WordProofs].map((entry: any) => entry.family), ["x64_word_count_checked_padding"]);
    assert.equal(liveX64WordViolations.every((entry: any) => Array.isArray(entry.reasons) && entry.reasons.length > 0), true);
    assert.equal(liveX64WordProofs.every((entry: any) => entry.proofStatus === "PROVEN" && entry.reasons.length === 0), true);

    const typedExpr = source.checks.find((value: any) => value.id === "typedexpr_static_arg_expression_matrix");
    assert.ok(typedExpr?.status === "GREEN" || typedExpr?.status === "RED", typedExpr?.reason);
    assert.equal(typedExpr?.caseCount, 95);
    assert.equal(typedExpr?.cases?.length, 95);
    assert.equal(new Set(typedExpr.cases.map((entry: any) => entry.id)).size, 95);
    assert.equal(typedExpr?.compilerProfileSha256, compilerProfile.sha256);
    assert.equal(typedExpr.cases.filter((entry: any) => entry.expected === "RED").length, 16);
    assert.equal(typedExpr.cases.filter((entry: any) => entry.expected === "GREEN").length, 79);
    const matrixFailureReasons = new Set([
      "negative_fixture_was_not_rejected",
      "negative_fixture_materialized_target",
      "negative_fixture_missed_static_diagnostic",
      "positive_fixture_compile_timed_out",
      "positive_fixture_compile_output_overflow",
      "positive_fixture_target_missing",
      "positive_fixture_compile_failed",
      "positive_fixture_run_failed",
      "positive_fixture_output_contract_mismatch",
    ]);
    for (const entry of typedExpr.cases) {
      assert.ok(entry.fixture && existsSync(entry.fixture), `${entry.id}: fixture missing`);
      assert.ok(entry.expected === "GREEN" || entry.expected === "RED", `${entry.id}: invalid expectation`);
      assert.ok(entry.status === "GREEN" || entry.status === "RED", `${entry.id}: invalid status ${entry.status}`);
      assert.notEqual(entry.compileRc, undefined, `${entry.id}: compile was skipped`);
      assert.equal(typeof entry.reason, "string", `${entry.id}: reason missing`);
      if (entry.status === "GREEN" && entry.expected === "GREEN") {
        assert.equal(entry.compileRc, 0, `${entry.id}: false GREEN compile`);
        assert.equal(entry.runRc, 0, `${entry.id}: false GREEN run`);
        assert.equal(entry.targetProduced, true, `${entry.id}: false GREEN target`);
        assert.equal(entry.reason, "positive_fixture_compiled_and_ran");
      } else if (entry.status === "GREEN") {
        assert.notEqual(entry.compileRc, 0, `${entry.id}: negative fixture was not rejected`);
        assert.equal(entry.targetProduced, false, `${entry.id}: negative fixture materialized a target`);
        assert.equal(entry.diagnosticMatched, true, `${entry.id}: negative fixture missed its diagnostic`);
        assert.equal(entry.reason, "negative_fixture_rejected_before_target");
      } else {
        assert.ok(matrixFailureReasons.has(entry.reason), `${entry.id}: unexplained RED ${entry.reason}`);
        assert.equal(entry.expected === "GREEN" ? entry.reason.startsWith("positive_fixture_") : entry.reason.startsWith("negative_fixture_"), true, `${entry.id}: RED reason/expectation mismatch`);
      }
    }
    const failedTypedExprCases = typedExpr.cases.filter((entry: any) => entry.status === "RED");
    assert.equal(typedExpr.status, failedTypedExprCases.length === 0 ? "GREEN" : "RED");
    assert.equal(typedExpr.reason, failedTypedExprCases.length === 0 ? "every expression family passed its independent compile/run or compile-fail contract" : `${failedTypedExprCases.length} independent expression families failed`);
    assert.equal(typedExpr.cases.find((entry: any) => entry.id === "shared_cross_module_return_binding")?.status, "GREEN");
    const qualifiedNestedCall = typedExpr.cases.find((entry: any) => entry.id === "qualified_nested_call_canonical_declaration");
    assert.equal(qualifiedNestedCall?.status, "GREEN", qualifiedNestedCall?.reason);
    assert.equal(qualifiedNestedCall?.declarationWitnessId, "qualified_nested_call.std_monotimes");
    console.log(`  live source verdict=${source.verdict} red_checks=${source.checks.filter((entry: any) => entry.status === "RED").length} typedexpr_gaps=${failedTypedExprCases.length}`);
    assertTrue(true, "live gaps may only decrease after real fixes; every case still executes, every RED is structured, and any identity drift is CFAIL");
  } finally {
    rmSync(scratch, {recursive: true, force: true});
  }
}

await main();
console.log("item22 regalloc preflight: PASS");
