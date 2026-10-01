#!/usr/bin/env node
// Task-scoped CHT diagnostic probe (W-C lane): reads the retained one-click facts
// (unimaker-react.csgc + unimaker-react.scene.csgc) and re-runs buildCompiledHandlerTable
// with per-skip detail surfaced (CHT_DEBUG_FV / CHT_DEBUG_DETAIL pass through env).
// Usage: node scripts/.w28-cht-probe.mjs <outDir> [--names pat1,pat2]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2];
if (!outDir) {
  process.stderr.write("usage: node scripts/.w28-cht-probe.mjs <outDir> [--names pat1,pat2]\n");
  process.exit(2);
}
const namesFilterIdx = process.argv.indexOf("--names");
const nameFilter = namesFilterIdx >= 0 ? String(process.argv[namesFilterIdx + 1] ?? "") : "";

const { csgcReadFacts } = await import(new URL("../dist/csgc-reader.js", import.meta.url).href);
const { buildCompiledHandlerTable } = await import(new URL("./scene-runtime-smoke-source.mjs", import.meta.url).href);

const coreFacts = csgcReadFacts(readFileSync(join(outDir, "unimaker-react.csgc"))).facts;
const sceneFacts = csgcReadFacts(readFileSync(join(outDir, "unimaker-react.scene.csgc"))).facts;

const invokeSites = [];
for (const f of sceneFacts) {
  if (f.kind !== "csg.web.scene.event_handler" || typeof f.effect !== "string") continue;
  if (f.effect.startsWith("invoke:")) invokeSites.push({ name: f.effect.slice("invoke:".length), routeId: f.routeId, nodeId: f.nodeId, propName: f.propName, owner: f.owner, handlerFn: f.handlerFn });
}
process.stdout.write(`baseline invoke sites: ${invokeSites.length}\n`);
for (const s of invokeSites) {
  process.stdout.write(`  site route=${s.routeId} node=${s.nodeId} prop=${s.propName} owner=${s.owner ?? ""} handlerFn=${s.handlerFn ?? ""} name=${JSON.stringify(s.name.slice(0, 120))}\n`);
}

const r = await buildCompiledHandlerTable(coreFacts, sceneFacts, { projectRoot: "/Users/lbcheng/UniMaker/React.js" });
process.stdout.write(`\ncompiled count=${r.count} names=[${r.names.join(", ")}]\n`);
process.stdout.write(`gesture names=[${(r.gestureNames || []).join(", ")}]\n`);
process.stdout.write(`skips (${r.skips.length}):\n`);
for (const s of r.skips) {
  if (nameFilter.length > 0 && !s.name.includes(nameFilter)) continue;
  process.stdout.write(`  ${JSON.stringify(s.name.slice(0, 140))} -> ${s.reason}\n`);
}
const remaining = new Set(invokeSites.map((s) => s.name));
for (const n of r.names) remaining.delete(n);
for (const n of r.gestureNames || []) remaining.delete(n);
process.stdout.write(`\nremaining unique invoke names (${remaining.size}):\n`);
for (const n of remaining) process.stdout.write(`  ${JSON.stringify(n.slice(0, 140))}\n`);
