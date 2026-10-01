#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { csgcWriteFacts } from "../ts-csg/dist/csgc-writer.js";
import { csgcReadFacts } from "../ts-csg/dist/csgc-reader.js";

const marker = "write_csgc_facts ok";

function usage() {
  process.stderr.write("usage: write_csgc_facts.mjs --out <facts.csgc>\n");
  process.exit(2);
}

let out = "";
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--out") {
    out = process.argv[++i] ?? "";
  } else {
    usage();
  }
}

if (!out) usage();

const inputText = readFileSync(0, "utf8");
let facts;
try {
  facts = JSON.parse(inputText);
} catch (error) {
  process.stderr.write(JSON.stringify({ ok: false, code: "bad_json", message: String(error) }) + "\n");
  process.exit(2);
}

if (!Array.isArray(facts)) {
  process.stderr.write(JSON.stringify({ ok: false, code: "facts_not_array" }) + "\n");
  process.exit(2);
}

const result = csgcWriteFacts(facts);
const outPath = resolve(out);
writeFileSync(outPath, result.factsBuffer);

let decodedCount = 0;
try {
  const decoded = csgcReadFacts(result.factsBuffer);
  decodedCount = decoded.facts.length;
} catch (error) {
  process.stderr.write(JSON.stringify({ ok: false, code: "csgc_readback_failed", message: String(error) }) + "\n");
  process.exit(2);
}

if (decodedCount !== facts.length) {
  process.stderr.write(JSON.stringify({
    ok: false,
    code: "csgc_fact_count_drift",
    inputCount: facts.length,
    decodedCount,
  }) + "\n");
  process.exit(2);
}

process.stdout.write(JSON.stringify({
  ok: true,
  marker,
  out: outPath,
  factCount: facts.length,
  byteSize: result.stats.byteSize,
  headerSize: result.stats.headerSize,
  flags: result.stats.flags,
  canonicalJsonlBytes: result.stats.canonicalJsonlBytes,
  scriptDir: dirname(fileURLToPath(import.meta.url)),
}) + "\n");
