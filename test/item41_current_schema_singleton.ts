#!/usr/bin/env bun

import {execFileSync, spawnSync} from "node:child_process";
import {mkdtempSync, readFileSync, readdirSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = join(root, "evidence");
const schema = Object.freeze({
  index: "cheng-fusion-evidence-index",
  manifest: "cheng-fusion-evidence-manifest",
  receipt: "cheng-fusion-evidence-receipt",
  stages: "cheng-fusion-evidence-stages",
});
const forbidden = /cheng-fusion-evidence-(?:index|manifest|receipt|stages)\/v[12]\b/;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function json(path: string): Record<string, unknown> {
  return JSON.parse(read(path)) as Record<string, unknown>;
}

const producer = read(join(root, "tools/evidence_deposit.py"));
const consumer = read(join(root, "tools/evidence_verify.py"));
for (const [name, value] of Object.entries(schema)) {
  const needle = `SCHEMA_${name.toUpperCase()} = "${value}"`;
  if (!producer.includes(needle) || !consumer.includes(needle)) {
    throw new Error(`current evidence ${name} schema producer/consumer drift`);
  }
}
if (forbidden.test(producer) || forbidden.test(consumer)) {
  throw new Error("versioned evidence schema survived in producer/consumer");
}
if (json(join(evidenceRoot, "index.json")).schema !== schema.index) {
  throw new Error("current evidence index schema drift");
}
for (const runId of readdirSync(evidenceRoot).filter((name) => name.startsWith("ignite_")).sort()) {
  const runDir = join(evidenceRoot, runId);
  const expected = [
    ["manifest.json", schema.manifest],
    ["receipt.json", schema.receipt],
    ["stages.json", schema.stages],
  ] as const;
  for (const [name, value] of expected) {
    const path = join(runDir, name);
    if (json(path).schema !== value || forbidden.test(read(path))) {
      throw new Error(`${runId}/${name}: versioned or non-current schema`);
    }
  }
}
execFileSync("python3", [join(root, "tools/evidence_verify.py")], {
  cwd: root,
  stdio: "pipe",
});

const mutationRoot = mkdtempSync(join(tmpdir(), "cheng-fusion-schema-singleton-"));
try {
  execFileSync("cp", ["-R", `${evidenceRoot}/.`, mutationRoot]);
  const indexPath = join(mutationRoot, "index.json");
  const indexRaw = read(indexPath).replace(
    `"schema": "${schema.index}"`,
    `"schema": "${schema.index}/legacy"`,
  );
  Bun.write(indexPath, indexRaw);
  const rejected = spawnSync(
    "python3",
    [join(root, "tools/evidence_verify.py"), "--evidence-dir", mutationRoot],
    {cwd: root, encoding: "utf8"},
  );
  if (rejected.status === 0) {
    throw new Error("versioned evidence schema mutation was accepted");
  }
} finally {
  rmSync(mutationRoot, {recursive: true, force: true});
}

console.log("item41_current_schema_singleton_status=PASS");
console.log("item41_current_schema_singleton_store_runs=4");
console.log("item41_current_schema_singleton_schema_mutations=1");
