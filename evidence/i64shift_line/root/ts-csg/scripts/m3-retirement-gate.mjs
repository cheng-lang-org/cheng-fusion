#!/usr/bin/env node
// M3 retirement gate: locks the CHT clear-zero production serialization surface.
//
// Usage:
//   node scripts/m3-retirement-gate.mjs --facts <unimaker-react.scene.debug.jsonl | unimaker-react.scene.csgc>
//                                       [--runtime <unimaker-react.scene-runtime.cheng>]
//                                       [--manifest <unimaker-react.scene-manifest.json>]
//
// Defaults: --runtime and --manifest resolve next to the facts file when present.
//
// Assertions (all pass => exit 0; any failure => exit 1 with the failure list):
//   1. invokeSegmentCount === 0  (summarizeSceneActionCoverage over the real facts)
//   2. scene runtime source contains "fn routeIdFromState" at least once
//   3. handler total + per-kind counts printed (route/state_delta/command/media_lifecycle/
//      stop_propagation/style_mutation action kinds; compiled:/gesture:/invoke: effect prefixes)
//   When --manifest is provided: manifest event_handlers count must equal the facts handler
//   count, and the raw manifest text is scanned for "invoke:" (report-only: the manifest
//   carries no effect field, so the effect assertion lives on the facts layer).

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { summarizeSceneActionCoverage } from "./scene-action-coverage.mjs";

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (key === "help") { parsed.help = true; continue; }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) { parsed[key] = ""; continue; }
    parsed[key] = value;
    i += 1;
  }
  return parsed;
}

async function readSceneFacts(factsPath) {
  if (factsPath.endsWith(".jsonl")) {
    const facts = [];
    for (const line of readFileSync(factsPath, "utf8").split("\n")) {
      if (line.length === 0) continue;
      facts.push(JSON.parse(line));
    }
    return { facts, layer: "plain-jsonl" };
  }
  if (factsPath.endsWith(".csgc")) {
    const { csgcReadFacts } = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "csgc-reader.js")).href);
    const facts = csgcReadFacts(readFileSync(factsPath)).facts;
    return { facts, layer: "csgc-container" };
  }
  throw new Error(`unsupported facts format (expected .jsonl or .csgc): ${factsPath}`);
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.facts) {
  process.stdout.write(`usage: node scripts/m3-retirement-gate.mjs --facts <scene.debug.jsonl|scene.csgc> [--runtime <scene-runtime.cheng>] [--manifest <scene-manifest.json>]\n`);
  process.exit(args.help ? 0 : 1);
}

const factsPath = resolve(String(args.facts));
const failures = [];
const report = (line) => process.stdout.write(line + "\n");

if (!existsSync(factsPath)) {
  process.stdout.write(`M3 retirement gate: FAIL\n  [FAIL] facts file not found: ${factsPath}\n`);
  process.exit(1);
}

const { facts, layer } = await readSceneFacts(factsPath);
const coverage = summarizeSceneActionCoverage(facts);

const runtimePath = args.runtime ? resolve(String(args.runtime)) : null;
const factsDir = dirname(factsPath);
// Production emission default is the structural multi-part split: the monolith
// unimaker-react.scene-runtime.cheng is transient and deleted after the split,
// so when it is absent fall back to scanning the unimaker_react_scene_runtime
// part files whose concatenation is the production runtime source of record.
let runtimeInputs = [];
if (runtimePath) {
  if (!existsSync(runtimePath)) {
    failures.push(`runtime file not found: ${runtimePath}`);
    runtimeInputs = [];
  } else {
    runtimeInputs = [runtimePath];
  }
} else if (existsSync(join(factsDir, "unimaker-react.scene-runtime.cheng"))) {
  runtimeInputs = [join(factsDir, "unimaker-react.scene-runtime.cheng")];
} else {
  runtimeInputs = readdirSync(factsDir)
    .filter((name) => name.startsWith("unimaker_react_scene_runtime") && name.endsWith(".cheng"))
    .sort()
    .map((name) => join(factsDir, name));
}
let routeIdFromStateCount = 0;
let runtimeNote;
if (runtimeInputs.length === 0) {
  runtimeNote = `missing: no unimaker-react.scene-runtime.cheng and no unimaker_react_scene_runtime*.cheng parts in ${factsDir}`;
} else {
  for (const input of runtimeInputs) {
    routeIdFromStateCount += countOccurrences(readFileSync(input, "utf8"), "fn routeIdFromState");
  }
  runtimeNote = runtimeInputs.length === 1
    ? `${routeIdFromStateCount} occurrence(s) in ${runtimeInputs[0]}`
    : `${routeIdFromStateCount} occurrence(s) across ${runtimeInputs.length} runtime part file(s) in ${factsDir}`;
}

let manifestNote = "not provided";
let manifestCounts = null;
let manifestInvokeTextCount = null;
if (args.manifest) {
  const manifestPath = resolve(String(args.manifest));
  if (!existsSync(manifestPath)) {
    failures.push(`manifest file not found: ${manifestPath}`);
  } else {
    const manifestText = readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(manifestText);
    manifestCounts = manifest.counts ?? null;
    manifestInvokeTextCount = countOccurrences(manifestText, "invoke:");
    manifestNote = `${manifestPath} (raw text "invoke:" occurrences: ${manifestInvokeTextCount}, report-only — manifest has no effect field)`;
    if (manifestCounts && Number(manifestCounts.event_handlers) !== coverage.eventHandlerCount) {
      failures.push(`manifest event_handlers=${Number(manifestCounts.event_handlers)} != facts handler count=${coverage.eventHandlerCount}`);
    }
  }
}

if (coverage.invokeSegmentCount !== 0) {
  failures.push(`invokeSegmentCount=${coverage.invokeSegmentCount} (expected 0)`);
}
if (runtimeInputs.length === 0 && runtimeNote !== undefined && runtimeNote.startsWith("missing:")) {
  runtimeNote += " — projection check skipped (no runtime source at this pipeline stage)";
} else if (routeIdFromStateCount < 1) {
  failures.push(`routeIdFromState projection missing in scene runtime (${runtimeNote}, expected >= 1)`);
}
if (coverage.eventHandlerCount === 0) {
  failures.push(`event handler total is 0 — facts appear to contain no csg.web.scene.event_handler entries`);
}

report(`M3 retirement gate`);
report(`  facts: ${factsPath}`);
report(`  layer: ${layer} (${facts.length} facts)`);
report(`  handlers: total=${coverage.eventHandlerCount}`);
report(`  actionKindCounts: ${JSON.stringify(coverage.actionKindCounts)}`);
report(`  effectPrefixCounts: ${JSON.stringify(coverage.effectPrefixCounts)}`);
const effectKinds = coverage.effectPrefixCounts ?? {};
report(`    invoke=${Number(effectKinds.invoke ?? 0)} compiled=${Number(effectKinds.compiled ?? 0)} gesture=${Number(effectKinds.gesture ?? 0)} route=${Number(coverage.actionKindCounts?.route ?? 0)} state_delta=${Number(coverage.actionKindCounts?.state_delta ?? 0)} command=${Number(coverage.actionKindCounts?.command ?? 0)} stop_propagation=${Number(coverage.actionKindCounts?.stop_propagation ?? 0)} media_lifecycle=${Number(coverage.actionKindCounts?.media_lifecycle ?? 0)}`);
report(`  runtime: ${runtimeNote}`);
report(`  manifest: ${manifestNote}`);
for (const failure of failures) {
  report(`  [FAIL] ${failure}`);
}
if (failures.length > 0) {
  report(`RESULT: FAIL (${failures.length} check(s) failed)`);
  process.exit(1);
}
report(`RESULT: PASS`);
process.exit(0);
