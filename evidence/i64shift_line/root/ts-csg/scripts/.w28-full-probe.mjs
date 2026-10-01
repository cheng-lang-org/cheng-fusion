#!/usr/bin/env node
// W-C lane real-verification probe: read a retained materializer-input JSONL (the exact
// fact set one-click feeds the materializer — e.g. the bridge's pack-failure dump), run
// the materializer session + scene facts + buildCompiledHandlerTable IN-PROCESS, and print
// the per-name skip digest.
// Usage: node scripts/.w28-full-probe.mjs <facts.jsonl>
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const factsPath = process.argv[2];
if (!factsPath) {
  process.stderr.write("usage: node scripts/.w28-full-probe.mjs <facts.jsonl>\n");
  process.exit(2);
}
const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");

const facts = readFileSync(factsPath, "utf8").split("\n").filter((line) => line.length > 0).map((line) => JSON.parse(line));
if (!Array.isArray(facts) || facts.length === 0) {
  process.stderr.write("facts payload invalid\n");
  process.exit(1);
}
process.stdout.write(`facts loaded: ${facts.length}\n`);

const { createCsgWebMaterializerSession, emitCsgWebSessionToSceneFacts } = await import(pathToFileURL(join(packageDir, "dist", "csg-web-materializer.js")).href);
const { buildCompiledHandlerTable } = await import(pathToFileURL(join(scriptDir, "scene-runtime-smoke-source.mjs")).href);

const session = createCsgWebMaterializerSession(facts);
// The retained route catalog (lane-stable const in unimaker-one-click.mjs, not exported) —
// eval'd from source so the scene materializes the same route set the real run uses.
const oneClickSource = readFileSync(join(packageDir, "scripts", "unimaker-one-click.mjs"), "utf8");
const catalogStart = oneClickSource.indexOf("const unimakerReactRouteCatalog = [");
const catalogEnd = oneClickSource.indexOf("\n];", catalogStart);
if (catalogStart < 0 || catalogEnd < 0) {
  process.stderr.write("route catalog not found in unimaker-one-click.mjs\n");
  process.exit(1);
}
const mobileRoutes = new Function(`${oneClickSource.slice(catalogStart, catalogEnd + 3)}; return unimakerReactRouteCatalog;`)();
process.stdout.write(`route catalog: ${mobileRoutes.length}\n`);
const scene = emitCsgWebSessionToSceneFacts(session, {
  frameLimit: 2,
  pureCheng: true,
  mobileAppExports: true,
  mobileInitialRoute: mobileRoutes[0]?.routeId ?? "home_default",
  mobileRoutes,
  viewport: "390x844",
  fontBase64s: [],
  fontWeights: [],
  fontFamilies: [],
});
process.stdout.write(`scene facts: ${scene.facts.length} diagnostics: ${scene.diagnostics.length}\n`);

const invokeSites = [];
for (const f of scene.facts) {
  if (f.kind !== "csg.web.scene.event_handler" || typeof f.effect !== "string") continue;
  if (f.effect.startsWith("invoke:")) invokeSites.push({ name: f.effect.slice("invoke:".length), routeId: f.routeId, nodeId: f.nodeId, propName: f.propName, handlerFn: f.handlerFn });
}
process.stdout.write(`invoke sites: ${invokeSites.length}\n`);
for (const s of invokeSites) {
  process.stdout.write(`  route=${s.routeId} node=${s.nodeId} prop=${s.propName} handlerFn=${s.handlerFn ?? ""} name=${JSON.stringify(s.name.slice(0, 120))}\n`);
}

const cht = await buildCompiledHandlerTable(facts, scene.facts, { projectRoot: "/Users/lbcheng/UniMaker/React.js" });
process.stdout.write(`\nCHT compiled=${cht.count} names=[${cht.names.join(", ")}]\n`);
process.stdout.write(`gesture=[${(cht.gestureNames || []).join(", ")}]\n`);
process.stdout.write(`skips (${cht.skips.length}):\n`);
for (const s of cht.skips) process.stdout.write(`  ${JSON.stringify(s.name.slice(0, 120))} -> ${s.reason}\n`);

const remaining = new Set(invokeSites.map((s) => s.name));
for (const n of cht.names) remaining.delete(n);
for (const n of cht.gestureNames || []) remaining.delete(n);
process.stdout.write(`\nremaining unique invoke names (${remaining.size}):\n`);
for (const n of remaining) process.stdout.write(`  ${JSON.stringify(n.slice(0, 120))}\n`);
