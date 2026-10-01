// Offline CHT measurement: load cached core+scene facts, run buildCompiledHandlerTable,
// report compiled count/names + total invoke-site count + (with CHT_DEBUG) skip reasons.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = process.argv[2] || "tmp/census-imgdiag";
const projectRoot = process.argv[3] || "/Users/lbcheng/UniMaker/React.js";
const pkg = new URL("..", import.meta.url).pathname;
const { csgcReadFacts } = await import(pathToFileURL(join(pkg, "dist", "csgc-reader.js")).href);
const { buildCompiledHandlerTable } = await import(pathToFileURL(join(pkg, "scripts", "scene-runtime-smoke-source.mjs")).href);

// Debug-JSONL mirrors (written by one-click --keep-intermediate-facts) bypass the
// production-unpack authority gate; csgc stays the fallback for retained runs.
function readFactsAny(fileName) {
  const debugPath = join(pkg, dir, fileName === "unimaker-react.csgc" ? "unimaker-react.core.debug.jsonl" : fileName.replace(/\.csgc$/, ".debug.jsonl"));
  if (existsSync(debugPath)) {
    return readFileSync(debugPath, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  }
  return csgcReadFacts(readFileSync(join(pkg, dir, fileName))).facts;
}
const core = readFactsAny("unimaker-react.csgc");
const scene = readFactsAny("unimaker-react.scene.csgc");

function effectNames(effect, prefix) {
  const text = String(effect || "");
  if (text.startsWith(prefix)) return [text.slice(prefix.length)];
  const names = [];
  for (const segment of text.split(";")) {
    if (segment.startsWith(prefix)) names.push(segment.slice(prefix.length));
  }
  return names;
}

function eventHandlerEffectNames(facts, prefix) {
  return facts
    .filter((f) => f.kind === "csg.web.scene.event_handler" && typeof f.effect === "string")
    .flatMap((f) => effectNames(f.effect, prefix));
}

// Baseline = unresolved invoke sites plus any compiled sites already present in a post-CHT
// scene.csgc. one-click now writes scene.csgc after handler rewrites so facts/data stay
// byte-consistent; this script must therefore handle both raw and post-CHT inputs.
const invokeNamesBefore = eventHandlerEffectNames(scene, "invoke:");
const compiledNamesBefore = eventHandlerEffectNames(scene, "compiled:");
const uniqueInvoke = new Set(invokeNamesBefore);
const totalBaseline = invokeNamesBefore.length + compiledNamesBefore.length;

// buildCompiledHandlerTable REWRITES compiled handlers' effects invoke:->compiled: in-place on
// `scene`, so recount AFTER to get the LIVE invoke-dispatch count — the metric that "往下降".
const cht = await buildCompiledHandlerTable(core, scene, { projectRoot });
const invokeSitesRemaining = eventHandlerEffectNames(scene, "invoke:").length;
const compiledNames = [...new Set(eventHandlerEffectNames(scene, "compiled:"))];
process.stdout.write(`dir=${dir}\n`);
process.stdout.write(`invoke_sites_total_baseline=${totalBaseline}\n`);
process.stdout.write(`invoke_sites=${invokeSitesRemaining}  (LIVE, post-compile — this is the 往下降 metric; was ${totalBaseline} with 0 compiled)\n`);
process.stdout.write(`invoke_sites_compiled_away=${totalBaseline - invokeSitesRemaining}\n`);
process.stdout.write(`CHT_compiled=${compiledNames.length} [${compiledNames.join(", ")}]\n`);
const remaining = [...uniqueInvoke].filter((n) => !compiledNames.includes(n));
process.stdout.write(`remaining_uncompiled_unique=${remaining.length}\n`);

// skip-reason histogram (category = reason prefix before ':')
const hist = new Map();
for (const s of cht.skips || []) {
  const cat = s.reason.split(":")[0];
  hist.set(cat, (hist.get(cat) || 0) + 1);
}
process.stdout.write(`--- skip categories ---\n`);
for (const [cat, n] of [...hist.entries()].sort((a, b) => b[1] - a[1])) process.stdout.write(`  ${cat}: ${n}\n`);

if (process.env.CHT_DEBUG) {
  // detail for the int64/number-state and small-param families (the addressable subset)
  process.stdout.write(`--- skip details (first 60) ---\n`);
  for (const s of (cht.skips || []).slice(0, 60)) process.stdout.write(`  ${s.name}  <-  ${s.reason}\n`);
}
