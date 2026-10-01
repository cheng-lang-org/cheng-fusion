import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chengSmokeEnv } from "./cheng-smoke-env.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const tmpDir = join(packageDir, "tmp", "web-react-runtime");
const exePath = join(tmpDir, "web_react_runtime_smoke");
const reportPath = join(tmpDir, "web_react_runtime_smoke.report.txt");
const cheng = join(repoRoot, "artifacts", "backend_driver", "cheng");

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

execFileSync(cheng, [
  "system-link-exec",
  `--root:${repoRoot}`,
  "--in:src/tests/web_react_runtime_smoke.cheng",
  "--emit:exe",
  "--target:arm64-apple-darwin",
  `--out:${exePath}`,
  `--report-out:${reportPath}`,
], {
  cwd: repoRoot,
  env: chengSmokeEnv(),
  stdio: "inherit",
});

const run = spawnSync(exePath, [], {
  cwd: repoRoot,
  encoding: "utf8",
});

assert.equal(run.status, 0, `web_react_runtime_smoke exited with status ${run.status}, signal ${run.signal}`);
if (run.stdout) {
  process.stdout.write(run.stdout);
}
if (run.stderr) {
  console.error(`stderr: ${run.stderr}`);
}
