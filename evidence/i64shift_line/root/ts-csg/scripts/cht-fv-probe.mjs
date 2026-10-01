// Probe: dump handleClose's transitive free-var closure + unsupported callees from cached facts.
// Replicates the exact freeVarsOf/freeVarsOfClosure/localAliasesFor logic from
// scene-runtime-smoke-source.mjs (kept line-faithful; do not "improve" — drift = wrong answer).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = process.argv[2] || "tmp/cht-s1a3-baseline";
const handlerName = process.argv[3] || "handleClose";
const pkg = new URL("..", import.meta.url).pathname;
const { csgcReadFacts } = await import(pathToFileURL(join(pkg, "dist", "csgc-reader.js")).href);
const core = csgcReadFacts(readFileSync(join(pkg, dir, "unimaker-react.csgc"))).facts;
const scene = csgcReadFacts(readFileSync(join(pkg, dir, "unimaker-react.scene.csgc"))).facts;

const CHT_BUILTIN_IDENTIFIERS = new Set(["undefined", "null"]);

const opsById = new Map(), opsByFn = new Map(), fnById = new Map();
const localFunctionWrites = [];
for (const f of core) {
  if (f.kind === "csg.op") {
    opsById.set(f.id, f);
    if (!opsByFn.has(f.function)) opsByFn.set(f.function, []);
    opsByFn.get(f.function).push(f);
  } else if (f.kind === "csg.function" || f.kind === "csg.async_function") {
    fnById.set(f.id, f);
  }
}
const sfvt = (v) => {
  const op = opsById.get(v);
  if (!op) return undefined;
  if (op.opKind === "function_value") return op.targetFunction;
  if (op.opKind === "call" && (op.callee || op.calleeText) === "useCallback" && op.arguments && op.arguments[0]) return sfvt(op.arguments[0]);
  return undefined;
};
for (const op of opsById.values()) {
  if (op.opKind !== "local_write" || typeof op.name !== "string" || typeof op.value !== "string") continue;
  const targetFid = sfvt(op.value);
  if (targetFid) localFunctionWrites.push({ name: op.name, targetFid, ownerFid: String(op.function || "") });
}
const localFunctionOwnerByNameAndTarget = new Map();
const localFunctionWritesByOwner = new Map();
const localFunctionTargetKey = (name, fid) => `${name} ${fid}`;
for (const w of localFunctionWrites) {
  const targetKey = localFunctionTargetKey(w.name, w.targetFid);
  if (!localFunctionOwnerByNameAndTarget.has(targetKey)) localFunctionOwnerByNameAndTarget.set(targetKey, w.ownerFid);
  if (!localFunctionWritesByOwner.has(w.ownerFid)) localFunctionWritesByOwner.set(w.ownerFid, []);
  localFunctionWritesByOwner.get(w.ownerFid).push(w);
}

const sceneInvokeNames = new Set();
for (const f of scene) {
  if (f.kind !== "csg.web.scene.event_handler" || typeof f.effect !== "string") continue;
  const text = f.effect;
  if (text.startsWith("invoke:")) sceneInvokeNames.add(text.slice(7));
  for (const seg of text.split(";")) if (seg.startsWith("invoke:")) sceneInvokeNames.add(seg.slice(7));
}

// find the handler event fact + its stamped handlerFn (exact identity path)
const facts = scene.filter((f) => f.kind === "csg.web.scene.event_handler" && typeof f.effect === "string" && f.effect.split(";").some((s) => s === `invoke:${handlerName}` || s.startsWith(`invoke:${handlerName}(`) ));
let fid;
for (const f of facts) {
  if (typeof f.handlerFn === "string" && fnById.has(f.handlerFn)) { fid = f.handlerFn; break; }
}
if (!fid) {
  // name-based fallback: first localFunctionWrites entry with this name
  const w = localFunctionWrites.find((x) => x.name === handlerName);
  fid = w && w.targetFid;
}
console.log(`handler=${handlerName} fid=${fid} facts=${facts.length}`);

const localAliasesFor = (name, fid0) => {
  const owner = localFunctionOwnerByNameAndTarget.get(localFunctionTargetKey(name, fid0));
  if (!owner) return new Map();
  const aliases = new Map();
  for (const w of (localFunctionWritesByOwner.get(owner) || [])) {
    if (sceneInvokeNames.has(w.name)) continue;
    if (w.ownerFid === owner && /^[A-Za-z_$][\w$]*$/.test(w.name) && !aliases.has(w.name)) aliases.set(w.name, w.targetFid);
  }
  return aliases;
};

const freeVarsByFid = new Map();
const freeVarsOf = (fid0) => {
  if (freeVarsByFid.has(fid0)) return freeVarsByFid.get(fid0);
  const ops = opsByFn.get(fid0) || [];
  const fn = fnById.get(fid0);
  const params = new Set(((fn && fn.parameters) || []).map((p) => p && p.name).filter(Boolean));
  const locals = new Set();
  for (const o of ops) if ((o.opKind === "local_write" || o.opKind === "binding_extract") && o.name) locals.add(o.name);
  for (const o of ops) if ((o.opKind === "for_of" || o.opKind === "for_in" || o.opKind === "for_count") && o.initializerName) locals.add(String(o.initializerName));
  const out = [], seen = new Set();
  for (const o of ops) if (o.opKind === "identifier" && o.name && !CHT_BUILTIN_IDENTIFIERS.has(String(o.name)) && !params.has(o.name) && !locals.has(o.name) && !seen.has(o.name)) { seen.add(o.name); out.push(o.name); }
  freeVarsByFid.set(fid0, out);
  return out;
};
const freeVarsOfClosure = (fid0, localAliases) => {
  const out = [];
  const seen = new Set();
  const visited = new Set();
  const walk = (curFid) => {
    if (!curFid || visited.has(curFid)) return;
    visited.add(curFid);
    for (const v of freeVarsOf(curFid)) {
      if (!seen.has(v)) { seen.add(v); out.push(v); }
    }
    for (const o of (opsByFn.get(curFid) || [])) {
      if (o.opKind !== "call") continue;
      const callee = String(o.callee || o.calleeText || "");
      const target = localAliases.get(callee);
      if (target) walk(target);
    }
  };
  walk(fid0);
  return out;
};

const aliases = localAliasesFor(handlerName, fid);
const fvs = freeVarsOfClosure(fid, aliases);
console.log(`closure_fvs=${fvs.length}`);
for (const v of fvs) console.log(`  fv ${v}`);
// unsupported callees = call ops in the closure whose callee resolves to nothing
console.log("--- call ops in closure (callee -> resolved local alias?)");
const visited = new Set();
const walkCalls = (curFid) => {
  if (!curFid || visited.has(curFid)) return;
  visited.add(curFid);
  for (const o of (opsByFn.get(curFid) || [])) {
    if (o.opKind !== "call") continue;
    const callee = String(o.callee || o.calleeText || "");
    const viaAlias = aliases.get(callee);
    console.log(`  call ${callee} ${viaAlias ? `-> local fn ${fnById.get(viaAlias)?.name || viaAlias}` : ""}`);
    if (viaAlias) walkCalls(viaAlias);
  }
};
walkCalls(fid);
