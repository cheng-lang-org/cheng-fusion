import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tmpDir = join(packageDir, "tmp", "cheng-web-run-smoke");
const tracePath = join(tmpDir, "trace.json");

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

const output = execFileSync(process.execPath, [
  "scripts/cheng-web-run.mjs",
  "--project",
  "fixtures/csg-web-materializer-basic/tsconfig.json",
  "--out-dir",
  tmpDir,
  "--frame-limit",
  "1",
  "--trace-out",
  tracePath,
], {
  cwd: packageDir,
  encoding: "utf8",
  timeout: 120000,
});

assert.match(output, /cheng-web-run ok/);
assert.match(output, /csg_web_materializer ok/);
assert.equal(existsSync(tracePath), true);

const trace = JSON.parse(readFileSync(tracePath, "utf8"));
assert.equal(trace.schema, "cheng-web-run.trace");
assert.equal(trace.run, true);
assert.equal(existsSync(trace.source), true);
assert.equal(existsSync(trace.executable), true);
assert.equal(existsSync(trace.nativeObjects.appObject), true);
assert.equal(trace.materialized.elements, 3);
assert.equal(trace.frameLimit, 1);

process.stdout.write("cheng-web-run smoke ok\n");
