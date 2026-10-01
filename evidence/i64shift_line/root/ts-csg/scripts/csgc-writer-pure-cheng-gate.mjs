import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = join(packageRoot, "src");
const distributionRoot = join(packageRoot, "dist");
const frozenDistributionRoot = join(packageRoot, "dist-frozen");
const hardRed = "HARD_RED:production_launcher_runtime_primitives_missing";

for (const retired of [
  "src/cheng-csg.ts",
  "src/csgc-reader-js.ts",
  "src/csgc-writer-js.ts",
  "src/csgc-schema-js.ts",
  "src/csgc-schema.ts",
]) {
  assert.equal(existsSync(join(packageRoot, retired)), false, `retired module remains: ${retired}`);
}

for (const root of [sourceRoot, distributionRoot, frozenDistributionRoot]) {
  const suffix = root === sourceRoot ? "ts" : "js";
  const bridge = readFileSync(join(root, `csg-cheng-bridge.${suffix}`), "utf8");
  const cli = readFileSync(join(root, `cli.${suffix}`), "utf8");
  assert.match(bridge, /HARD_RED:production_launcher_runtime_primitives_missing/);
  assert.match(
    bridge,
    /function requireChengCsgHeldExecLauncherIdentity\(\)[^{]*\{\s*throw new Error\(/,
  );
  assert.doesNotMatch(
    bridge,
    /node:(?:child_process|crypto|fs|os|path|string_decoder)|\b(?:spawnSync|spawn|execFileSync|execFile|execSync|readFileSync|writeFileSync|openSync|readSync|writeSync|createHash)\s*\(|\bprocess\.env\b|["']tools["']\s*,\s*["']csg["']/,
  );
  for (const operation of [
    "chengCsgRootFileStrict",
    "chengCsgDecodeFactKindsAuthorized",
    "chengCsgFactIdentitiesThroughRootCli",
    "chengCsgPackFacts",
    "chengCsgUnpackFacts",
    "chengCsgValidateFacts",
    "chengCsgFactsRoot",
    "chengCsgDiffFacts",
  ]) {
    assert.match(
      bridge,
      new RegExp(
        `export function ${operation}\\b(?:(?!\\nexport function\\b)[\\s\\S])*?\\{\\s*return requireChengCsgHeldExecLauncherIdentity\\(\\);\\s*\\}`,
      ),
      `launcher guard does not dominate ${operation} in ${root}`,
    );
  }
  assert.match(cli, /from\s*["']\.\/csg-cheng-bridge\.js["']/);
  assert.match(
    cli,
    /function main\(\)[^{]*\{\s*const options = parseArgs\([^;]+;\s*if \(options\.help\) \{(?:(?!\n\s*if \(options\.out)[\s\S])*?return;\s*\}\s*if \(options\.out && isCsgcOutput\(options\.out\)\) \{\s*return requireChengCsgHeldExecLauncherIdentity\(\);\s*\}/,
  );
  assert.match(
    cli,
    /if\s*\([^{}]*\.endsWith\(["']\.csgc["']\)[^{}]*\)\s*\{\s*return requireChengCsgHeldExecLauncherIdentity\(\);\s*\}/,
  );
  assert.doesNotMatch(
    cli,
    /node:child_process|\b(?:spawn|spawnSync|execFile|execFileSync|execSync|mkdtemp)\s*\(|\b(?:writeUnifiedCsgcOutput|writeFactsJsonl|runPureCsgPack)\b|["']tools["']\s*,\s*["']csg["']/,
  );
}

const hostileCli = spawnSync(
  process.execPath,
  [
    join(distributionRoot, "cli.js"),
    "--project",
    "/definitely/missing-ts-csg-project.json",
    "--out",
    "/definitely/not-written-by-ts-csg.csgc",
  ],
  { cwd: packageRoot, encoding: "utf8" },
);
assert.notEqual(hostileCli.status, 0);
assert.match(hostileCli.stderr, new RegExp(hardRed));
assert.doesNotMatch(hostileCli.stderr, /ENOENT|missing-ts-csg-project/);

const hostileFacts = new Proxy([], {
  get() {
    throw new Error("input_was_inspected_before_launcher_identity");
  },
});
const expected = new RegExp(hardRed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

const bridge = await import("../dist/csg-cheng-bridge.js");
const identity = await import("../dist/csg-facts-identity.js");
const reader = await import("../dist/csgc-reader.js");
const standard = await import("../dist/csg-standard.js");
const writer = await import("../dist/csgc-writer.js");

for (const operation of [
  () => bridge.chengCsgRootFileStrict("/definitely/not/read.csgc"),
  () => bridge.chengCsgDecodeFactKindsAuthorized("", "", hostileFacts),
  () => bridge.chengCsgFactIdentitiesThroughRootCli(hostileFacts),
  () => bridge.chengCsgPackFacts(hostileFacts),
  () => bridge.chengCsgUnpackFacts(undefined),
  () => bridge.chengCsgValidateFacts(hostileFacts, "strict"),
  () => bridge.chengCsgFactsRoot(hostileFacts),
  () => bridge.chengCsgDiffFacts(hostileFacts, hostileFacts),
  () => identity.chengCsgFactIdentities(hostileFacts),
  () => reader.csgcReadFactKindsAuthorized("", "", hostileFacts),
  () => reader.csgcReadFacts(undefined),
  () => standard.csgFactsRoot(hostileFacts),
  () => standard.validateCsgFacts(hostileFacts),
  () => standard.diffCsgFacts(hostileFacts, hostileFacts),
  () => writer.csgcWriteDebugFile(hostileFacts),
  () => writer.csgcWriteFacts(hostileFacts),
]) {
  assert.throws(operation, expected);
}

console.log(
  "csgc writer pure Cheng gate STATIC_PASS launcher_exec_identity=HARD_RED prelauncher_input_access=0 dynamic_completion_credit=0",
);
