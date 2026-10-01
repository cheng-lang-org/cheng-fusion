import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chengSmokeEnv } from "./cheng-smoke-env.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const tmpDir = join(packageDir, "tmp", "js-promise");
const exePath = join(tmpDir, "js_promise_smoke");
const reportPath = join(tmpDir, "js_promise_smoke.report.txt");
const cheng = process.env.CHENG_SMOKE_COMPILER ?? join(repoRoot, "artifacts", "backend_driver", "cheng");

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

execFileSync(cheng, [
  "system-link-exec",
  `--root:${repoRoot}`,
  "--in:src/tests/js_promise_smoke.cheng",
  "--emit:exe",
  "--target:arm64-apple-darwin",
  `--out:${exePath}`,
  `--report-out:${reportPath}`,
], {
  cwd: repoRoot,
  env: chengSmokeEnv(),
  stdio: "inherit",
});

const report = readFileSync(reportPath, "utf8");
assert.ok(report.length > 0);
assert.match(report, /^unresolved_symbol_count=0$/m);

const run = spawnSync(exePath, [], {
  cwd: repoRoot,
  encoding: "utf8",
});

assert.equal(
  run.status,
  5,
  `expected Promise handler dispatch boundary exit 5, got status=${run.status} signal=${run.signal} stdout=${run.stdout} stderr=${run.stderr}`,
);
assert.match(run.stdout, /FAIL testPromiseHandlerDispatch: 5/);
process.stdout.write("js_promise_handler_dispatch_boundary=exit5\n");
