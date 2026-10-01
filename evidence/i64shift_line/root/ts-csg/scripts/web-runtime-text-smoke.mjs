import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chengSmokeEnv } from "./cheng-smoke-env.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const tmpDir = join(packageDir, "tmp", "web-runtime-text");
const exePath = join(tmpDir, "web_runtime_text_smoke");
const reportPath = join(tmpDir, "web_runtime_text_smoke.report.txt");
const layoutBoundaryExePath = join(tmpDir, "web_runtime_text_layout_boundary_smoke");
const layoutBoundaryReportPath = join(tmpDir, "web_runtime_text_layout_boundary_smoke.report.txt");
const cheng = join(repoRoot, "artifacts", "backend_driver", "cheng");

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

execFileSync(cheng, [
  "system-link-exec",
  `--root:${repoRoot}`,
  "--in:src/tests/web_runtime_text_smoke.cheng",
  "--emit:exe",
  "--target:arm64-apple-darwin",
  `--out:${exePath}`,
  `--report-out:${reportPath}`,
], {
  cwd: repoRoot,
  env: chengSmokeEnv(),
  stdio: "inherit",
});

const output = execFileSync(exePath, [], {
  cwd: repoRoot,
  encoding: "utf8",
});

assert.match(output, /web_runtime_text_smoke ok/);
assert.match(output, /web_runtime_text_assertions=measure\/negative/);
process.stdout.write(output);

execFileSync(cheng, [
  "system-link-exec",
  `--root:${repoRoot}`,
  "--in:src/tests/web_runtime_text_layout_boundary_smoke.cheng",
  "--emit:exe",
  "--target:arm64-apple-darwin",
  `--out:${layoutBoundaryExePath}`,
  `--report-out:${layoutBoundaryReportPath}`,
], {
  cwd: repoRoot,
  env: chengSmokeEnv(),
  stdio: "inherit",
});

const layoutBoundaryReport = readFileSync(layoutBoundaryReportPath, "utf8");
assert.ok(layoutBoundaryReport.length > 0);
assert.match(layoutBoundaryReport, /^unresolved_symbol_count=0$/m);

const layoutBoundaryRun = spawnSync(layoutBoundaryExePath, [], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert.equal(layoutBoundaryRun.status, 0, `web_runtime_text_layout_boundary_smoke exited with status ${layoutBoundaryRun.status}, signal ${layoutBoundaryRun.signal}`);
assert.match(layoutBoundaryRun.stdout, /web_runtime_text_layout_boundary_smoke ok/);
if (layoutBoundaryRun.stdout) {
  process.stdout.write(layoutBoundaryRun.stdout);
}
if (layoutBoundaryRun.stderr) {
  console.error(`stderr: ${layoutBoundaryRun.stderr}`);
}
