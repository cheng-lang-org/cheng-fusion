import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chengSmokeEnv, chengStyleSmokeMaxRssBytes } from "./cheng-smoke-env.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const tmpDir = join(packageDir, "tmp", "web-runtime-css-query");
const exePath = join(tmpDir, "web_runtime_css_query_smoke");
const reportPath = join(tmpDir, "web_runtime_css_query_smoke.report.txt");
const cheng = join(repoRoot, "artifacts", "backend_driver", "cheng");

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

execFileSync(cheng, [
  "system-link-exec",
  `--root:${repoRoot}`,
  "--in:src/tests/web_runtime_css_query_smoke.cheng",
  "--emit:exe",
  "--target:arm64-apple-darwin",
  `--out:${exePath}`,
  `--report-out:${reportPath}`,
], {
  cwd: repoRoot,
  env: chengSmokeEnv({
    CHENG_PROCESS_MAX_RSS_BYTES: chengStyleSmokeMaxRssBytes,
    PROCESS_MAX_RSS_BYTES: chengStyleSmokeMaxRssBytes,
    CHENG_MAX_RSS_BYTES: chengStyleSmokeMaxRssBytes,
    MAX_RSS_BYTES: chengStyleSmokeMaxRssBytes,
  }),
  stdio: "inherit",
});

const output = execFileSync(exePath, [], {
  cwd: repoRoot,
  encoding: "utf8",
});

assert.match(output, /web_runtime_css_query_smoke ok/);
process.stdout.write(output);
