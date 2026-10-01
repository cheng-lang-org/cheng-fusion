import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chengSmokeEnv } from "./cheng-smoke-env.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const tmpDir = join(packageDir, "tmp", "js-runtime");
const exePath = join(tmpDir, "js_runtime_value_object_smoke");
const reportPath = join(tmpDir, "js_runtime_value_object_smoke.report.txt");
const arrayPushExePath = join(tmpDir, "js_runtime_array_push_smoke");
const arrayPushReportPath = join(tmpDir, "js_runtime_array_push_smoke.report.txt");
const dateExePath = join(tmpDir, "js_runtime_date_smoke");
const dateReportPath = join(tmpDir, "js_runtime_date_smoke.report.txt");
const functionDateExePath = join(tmpDir, "js_runtime_function_date_smoke");
const functionDateReportPath = join(tmpDir, "js_runtime_function_date_smoke.report.txt");
const objectBoundaryExePath = join(tmpDir, "js_runtime_object_boundary_smoke");
const objectBoundaryReportPath = join(tmpDir, "js_runtime_object_boundary_smoke.report.txt");
const mapExePath = join(tmpDir, "js_runtime_map_string_int32_smoke");
const mapReportPath = join(tmpDir, "js_runtime_map_string_int32_smoke.report.txt");
const cheng = process.env.CHENG_SMOKE_COMPILER ?? join(repoRoot, "artifacts", "backend_driver", "cheng");
const smokeEnv = chengSmokeEnv({
  CHENG_NO_BACKEND_DRIVER_HANDOFF: "1",
  CHENG_BACKEND_DRIVER_HANDOFF: "0",
  BACKEND_INCREMENTAL: "0",
  BACKEND_MULTI_MODULE_CACHE: "0",
  CHENG_DISABLE_PRIMARY_OBJECT_CACHE: "1",
  BACKEND_BUILD_DRIVER_QUICK_STAMP_CACHE: "0",
  BACKEND_BUILD_DRIVER_QUICK_SHARED_CACHE: "0",
  CHENG_ENABLE_SYSTEM_LINK_EXEC_CACHE: "0",
});

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

execFileSync(cheng, [
  "system-link-exec",
  `--root:${repoRoot}`,
  "--in:src/tests/js_runtime_value_object_smoke.cheng",
  "--emit:exe",
  "--target:arm64-apple-darwin",
  `--out:${exePath}`,
  `--report-out:${reportPath}`,
], {
  cwd: repoRoot,
  env: smokeEnv,
  stdio: "inherit",
});

const report = readFileSync(reportPath, "utf8");
assert.ok(report.length > 0);
assert.match(report, /^unresolved_symbol_count=0$/m);

const output = execFileSync(exePath, [], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.match(output, /js_runtime_value_object_smoke ok/);
assert.match(output, /js_runtime_value_object_assertions=primitive\/string_regex/);
process.stdout.write(output);

execFileSync(cheng, [
  "system-link-exec",
  `--root:${repoRoot}`,
  "--in:src/tests/js_runtime_array_push_smoke.cheng",
  "--emit:exe",
  "--target:arm64-apple-darwin",
  `--out:${arrayPushExePath}`,
  `--report-out:${arrayPushReportPath}`,
], {
  cwd: repoRoot,
  env: smokeEnv,
  stdio: "inherit",
});

const arrayPushReport = readFileSync(arrayPushReportPath, "utf8");
assert.ok(arrayPushReport.length > 0);
assert.match(arrayPushReport, /^unresolved_symbol_count=0$/m);

const arrayPushOutput = execFileSync(arrayPushExePath, [], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.match(arrayPushOutput, /js_runtime_array_push_smoke ok/);
assert.match(arrayPushOutput, /js_runtime_array_push_assertions=init\/push\/grow\/get/);
process.stdout.write(arrayPushOutput);

execFileSync(cheng, [
  "system-link-exec",
  `--root:${repoRoot}`,
  "--in:src/tests/js_runtime_date_smoke.cheng",
  "--emit:exe",
  "--target:arm64-apple-darwin",
  `--out:${dateExePath}`,
  `--report-out:${dateReportPath}`,
], {
  cwd: repoRoot,
  env: smokeEnv,
  stdio: "inherit",
});

const dateReport = readFileSync(dateReportPath, "utf8");
assert.ok(dateReport.length > 0);
assert.match(dateReport, /^unresolved_symbol_count=0$/m);

const dateOutput = execFileSync(dateExePath, [], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.match(dateOutput, /js_runtime_date_smoke ok/);
assert.match(dateOutput, /js_runtime_date_assertions=constructor_ms/);
process.stdout.write(dateOutput);

execFileSync(cheng, [
  "system-link-exec",
  `--root:${repoRoot}`,
  "--in:src/tests/js_runtime_function_date_smoke.cheng",
  "--emit:exe",
  "--target:arm64-apple-darwin",
  `--out:${functionDateExePath}`,
  `--report-out:${functionDateReportPath}`,
], {
  cwd: repoRoot,
  env: smokeEnv,
  stdio: "inherit",
});

const functionDateReport = readFileSync(functionDateReportPath, "utf8");
assert.ok(functionDateReport.length > 0);
assert.match(functionDateReport, /^unresolved_symbol_count=0$/m);

const functionDateRun = spawnSync(functionDateExePath, [], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(
  functionDateRun.status,
  0,
  `js_runtime_function_date_smoke failed status=${functionDateRun.status} signal=${functionDateRun.signal} stderr=${functionDateRun.stderr}`,
);
assert.match(functionDateRun.stdout, /js_runtime_function_date_smoke ok/);
assert.match(functionDateRun.stdout, /js_runtime_function_date_assertions=dispatch\/date/);
process.stdout.write(functionDateRun.stdout);

execFileSync(cheng, [
  "system-link-exec",
  `--root:${repoRoot}`,
  "--in:src/tests/js_runtime_object_boundary_smoke.cheng",
  "--emit:exe",
  "--target:arm64-apple-darwin",
  `--out:${objectBoundaryExePath}`,
  `--report-out:${objectBoundaryReportPath}`,
], {
  cwd: repoRoot,
  env: smokeEnv,
  stdio: "inherit",
});

const objectBoundaryReport = readFileSync(objectBoundaryReportPath, "utf8");
assert.ok(objectBoundaryReport.length > 0);
assert.match(objectBoundaryReport, /^unresolved_symbol_count=0$/m);

const objectBoundaryRun = spawnSync(objectBoundaryExePath, [], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(
  objectBoundaryRun.status,
  0,
  `js_runtime_object_boundary_smoke failed status=${objectBoundaryRun.status} signal=${objectBoundaryRun.signal} stderr=${objectBoundaryRun.stderr}`,
);
assert.match(objectBoundaryRun.stdout, /js_runtime_object_boundary_smoke ok/);
assert.match(objectBoundaryRun.stdout, /js_runtime_object_boundary_assertions=create\/define\/get/);
process.stdout.write(objectBoundaryRun.stdout);

execFileSync(cheng, [
  "system-link-exec",
  `--root:${repoRoot}`,
  "--in:src/tests/js_runtime_map_string_int32_smoke.cheng",
  "--emit:exe",
  "--target:arm64-apple-darwin",
  `--out:${mapExePath}`,
  `--report-out:${mapReportPath}`,
], {
  cwd: repoRoot,
  env: smokeEnv,
  stdio: "inherit",
});

const mapReport = readFileSync(mapReportPath, "utf8");
assert.ok(mapReport.length > 0);
assert.match(mapReport, /^unresolved_symbol_count=0$/m);

const mapRun = spawnSync(mapExePath, [], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(
  mapRun.status,
  0,
  `js_runtime_map_string_int32_smoke failed status=${mapRun.status} signal=${mapRun.signal} stderr=${mapRun.stderr}`,
);
assert.match(mapRun.stdout, /js_runtime_map_string_int32_smoke ok/);
process.stdout.write(mapRun.stdout);
