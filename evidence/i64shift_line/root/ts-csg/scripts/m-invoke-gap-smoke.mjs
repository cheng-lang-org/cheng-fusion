#!/usr/bin/env node
// Focused CHT invoke-gap smoke (W-C lane; M-report §五.3 design): a minimal TSX
// fixture carrying the four real uncompiled handler shapes (custom-callback
// parent/child pairs + inline void-call arrows over useCallback targets) is run
// through the REAL pipeline — emitCsgWebFromTs extract -> materializer session ->
// scene facts -> buildCompiledHandlerTable — and the per-site outcomes are
// asserted so transpiler/materializer changes prove against the exact shapes.
//
// Usage: node scripts/m-invoke-gap-smoke.mjs [--diagnose]
//   --diagnose  print skips/remaining instead of asserting (development mode)
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const fixtureTsConfig = join(packageDir, "fixtures", "csg-cht-invoke-gap", "tsconfig.json");
const fixtureRoot = join(packageDir, "fixtures", "csg-cht-invoke-gap");
const tmpDir = join(packageDir, "tmp", "m-invoke-gap-smoke");
const diagnose = process.argv.includes("--diagnose");

const { emitCsgWebFromTs } = await import(pathToFileURL(join(packageDir, "dist", "csg-web.js")).href);
const {
  createCsgWebMaterializerSession,
  emitCsgWebSessionToSceneFacts,
} = await import(pathToFileURL(join(packageDir, "dist", "csg-web-materializer.js")).href);
const { buildCompiledHandlerTable } = await import(pathToFileURL(join(scriptDir, "scene-runtime-smoke-source.mjs")).href);

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

const extractResult = emitCsgWebFromTs({
  project: fixtureTsConfig,
  rootDir: fixtureRoot,
  entryRoots: ["src/GapPage.tsx"],
  includeDebugMaps: true,
});
if (extractResult.diagnostics.length > 0) {
  process.stderr.write(`extract diagnostics:\n${extractResult.diagnostics.join("\n")}\n`);
  process.exit(1);
}

const session = createCsgWebMaterializerSession(extractResult.facts);
const scene = emitCsgWebSessionToSceneFacts(session, {
  frameLimit: 2,
  pureCheng: true,
  mobileAppExports: true,
  mobileInitialRoute: "gap_main",
  mobileRoutes: [
    { routeId: "gap_main", rootSource: "src/GapPage.tsx", rootComponent: "App" },
  ],
  viewport: "390x844",
  fontBase64s: [],
  fontWeights: [],
  fontFamilies: [],
});
if (scene.diagnostics.length > 0) {
  process.stderr.write(`scene fact diagnostics:\n${scene.diagnostics.join("\n")}\n`);
}

const invokeSites = [];
for (const f of scene.facts) {
  if (f.kind !== "csg.web.scene.event_handler" || typeof f.effect !== "string") continue;
  if (f.effect.startsWith("invoke:")) {
    invokeSites.push({ name: f.effect.slice("invoke:".length), routeId: f.routeId, nodeId: f.nodeId, propName: f.propName, handlerFn: f.handlerFn });
  }
}
process.stdout.write(`invoke sites (${invokeSites.length}):\n`);
for (const s of invokeSites) {
  process.stdout.write(`  route=${s.routeId} node=${s.nodeId} prop=${s.propName} handlerFn=${s.handlerFn ?? ""} name=${JSON.stringify(s.name.slice(0, 100))}\n`);
}

const cht = await buildCompiledHandlerTable(extractResult.facts, scene.facts, { projectRoot: fixtureRoot });
process.stdout.write(`\nCHT compiled=${cht.count} names=[${cht.names.join(", ")}]\n`);
process.stdout.write(`gesture=[${(cht.gestureNames || []).join(", ")}]\n`);
process.stdout.write(`skips:\n`);
for (const s of cht.skips) process.stdout.write(`  ${JSON.stringify(s.name.slice(0, 100))} -> ${s.reason}\n`);

const remaining = new Set(invokeSites.map((s) => s.name));
for (const n of cht.names) remaining.delete(n);
for (const n of cht.gestureNames || []) remaining.delete(n);
process.stdout.write(`remaining unique invoke names (${remaining.size}): ${[...remaining].map((n) => JSON.stringify(n.slice(0, 100))).join(", ")}\n`);

if (!diagnose) {
  const failed = [];
  if (remaining.size > 2) failed.push(`${remaining.size} invoke site name(s) remain uncompiled (expected <= 2, the frozen-chain blockers)`);
  if (!cht.names.includes("handleCalculate")) failed.push("expected compiled handler missing: handleCalculate (direct + forwarded onRecalculate sites)");
  if (cht.names.includes("onRefresh")) failed.push("onRefresh should classify to the node_contents_refresh command, not stay an invoke site");
  // The forwarding mechanism: the child-internal onRecalculate site must dispatch under the
  // parent's own handler name (classification retry), not stay invoke:onRecalculate.
  const invokeNames = invokeSites.map((s) => s.name);
  if (invokeNames.includes("onRecalculate")) failed.push("forwarded onRecalculate site still carries invoke:onRecalculate");
  if (invokeNames.includes("() => onLoad(record)")) failed.push("forwarded delegate () => onLoad(record) still carries its raw arrow text");
  if (failed.length > 0) {
    process.stderr.write(`m-invoke-gap-smoke FAIL:\n  - ${failed.join("\n  - ")}\n`);
    process.exit(1);
  }
  process.stdout.write("m-invoke-gap-smoke ok\n");
}
