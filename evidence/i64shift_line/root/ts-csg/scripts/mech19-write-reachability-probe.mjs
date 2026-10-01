// mech19 r1 探针: 对指定 ref name, 找出其全部 `.current =` 写点(owner 函数), 并复刻
// buildCompiledHandlerTable 里 trampoline/delegate/inline-JSX-arrow 的 handler-root fid 解析
// + localAliasesFor/freeVarsOfClosure 同款调用图遍历(仅遍历 fid, 不收集自由变量名), 判定每个
// 写点 owner 函数是否可从"任一可解析的 JSX invoke: handler 根"可达。对源码只读未改。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const pkg = new URL("..", import.meta.url).pathname;
const coreDir = process.argv[2];
const REF_NAME = process.argv[3];
const { csgcReadFacts } = await import(pathToFileURL(join(pkg, "dist", "csgc-reader.js")).href);
const core = csgcReadFacts(readFileSync(join(pkg, coreDir, "unimaker-react.csgc"))).facts;
const scene = csgcReadFacts(readFileSync(join(pkg, coreDir, "unimaker-react.scene.csgc"))).facts;

const opsById = new Map(), opsByFn = new Map(), fnById = new Map(), dataById = new Map();
for (const f of core) {
  if (f.kind === "csg.op") {
    opsById.set(f.id, f);
    if (!opsByFn.has(f.function)) opsByFn.set(f.function, []);
    opsByFn.get(f.function).push(f);
  } else if (f.kind === "csg.function" || f.kind === "csg.async_function") {
    fnById.set(f.id, f);
  } else if (f.kind === "csg.data") dataById.set(f.id, f.value);
}

// --- verbatim copy of scene-runtime-smoke-source.mjs's local-function-alias graph machinery ---
const sfvt = (v) => {
  const op = opsById.get(v);
  if (!op) return undefined;
  if (op.opKind === "function_value") return op.targetFunction;
  if (op.opKind === "call" && (op.callee || op.calleeText) === "useCallback" && op.arguments && op.arguments[0]) return sfvt(op.arguments[0]);
  return undefined;
};
const localFunctionWrites = [];
for (const op of opsById.values()) {
  if (op.opKind !== "local_write" || typeof op.name !== "string" || typeof op.value !== "string") continue;
  const targetFid = sfvt(op.value);
  if (targetFid) localFunctionWrites.push({ name: op.name, targetFid, ownerFid: String(op.function || "") });
}
const localFunctionTargetByName = new Map();
const localFunctionOwnerByNameAndTarget = new Map();
const localFunctionWritesByOwner = new Map();
const localFunctionTargetKey = (name, fid) => `${name}\u0000${fid}`;
for (const w of localFunctionWrites) {
  if (!localFunctionTargetByName.has(w.name)) localFunctionTargetByName.set(w.name, w.targetFid);
  const targetKey = localFunctionTargetKey(w.name, w.targetFid);
  if (!localFunctionOwnerByNameAndTarget.has(targetKey)) localFunctionOwnerByNameAndTarget.set(targetKey, w.ownerFid);
  if (!localFunctionWritesByOwner.has(w.ownerFid)) localFunctionWritesByOwner.set(w.ownerFid, []);
  localFunctionWritesByOwner.get(w.ownerFid).push(w);
}
const resolveId = (n) => localFunctionTargetByName.get(n);
const localAliasesFor = (name, fid) => {
  const owner = localFunctionOwnerByNameAndTarget.get(localFunctionTargetKey(name, fid));
  if (!owner) return new Map();
  const aliases = new Map();
  for (const w of (localFunctionWritesByOwner.get(owner) || [])) {
    if (w.ownerFid === owner && /^[A-Za-z_$][\w$]*$/.test(w.name) && !aliases.has(w.name)) aliases.set(w.name, w.targetFid);
  }
  return aliases;
};
const unwrapTrampoline = (s) => {
  const m = String(s).trim().match(/^\(?\s*[\w\s,]*\)?\s*=>\s*\{?\s*(?:void\s+)?([A-Za-z_$][\w$]*)\(\s*\)\s*;?\s*\}?$/);
  return m ? m[1] : null;
};
function sceneEffectInvokeNames(effect) {
  const text = String(effect || "");
  if (text.startsWith("invoke:")) return [text.slice("invoke:".length)];
  const names = [];
  for (const segment of text.split(";")) if (segment.startsWith("invoke:")) names.push(segment.slice("invoke:".length));
  return names;
}
// sceneEventHandlerHelperName is production-internal naming sugar for a JSX inline delegate; not
// needed for this probe's reachability question (a name it would resolve still resolves via
// resolveId/trampoline/f.handlerFn fallbacks below in every real case this ref touches).

// --- collect ALL invoke: handler roots (every JSX-bound event handler, not just the ones that end
// up fully compiling for OTHER unrelated reasons e.g. bad param type) ---
const invokeNames = new Set();
for (const f of scene) {
  if (f.kind !== "csg.web.scene.event_handler" || typeof f.effect !== "string") continue;
  for (const nm of sceneEffectInvokeNames(f.effect)) invokeNames.add(nm);
}
const rootFids = new Set();
const unresolved = [];
for (const name of invokeNames) {
  let fid = resolveId(name);
  let resolvedVia = "direct";
  if (!fid) {
    const tgt = unwrapTrampoline(name);
    if (tgt) { const tfid = resolveId(tgt); if (tfid) { fid = tfid; resolvedVia = "trampoline"; } }
  }
  if (!fid) {
    const hf = scene.find((f) => f.kind === "csg.web.scene.event_handler" && typeof f.effect === "string" && sceneEffectInvokeNames(f.effect).includes(name) && typeof f.handlerFn === "string" && fnById.has(f.handlerFn));
    if (hf) { fid = hf.handlerFn; resolvedVia = "inline-jsx-arrow"; }
  }
  if (fid) rootFids.add(fid); else unresolved.push(name);
}
process.stderr.write(`invoke: unique names=${invokeNames.size}, resolved roots=${rootFids.size}, unresolved=${unresolved.length}\n`);

// --- BFS over ALL root fids' local-alias call graphs, recording every visited fid ---
const reachableFids = new Set();
const walk = (curFid, localAliases) => {
  if (!curFid || reachableFids.has(curFid)) return;
  reachableFids.add(curFid);
  for (const o of (opsByFn.get(curFid) || [])) {
    if (o.opKind !== "call") continue;
    const callee = String(o.callee || o.calleeText || "");
    const target = localAliases.get(callee);
    if (target) walk(target, localAliases);
  }
};
for (const name of invokeNames) {
  let fid = resolveId(name), callName = name;
  if (!fid) { const tgt = unwrapTrampoline(name); if (tgt) { const tfid = resolveId(tgt); if (tfid) { fid = tfid; callName = tgt; } } }
  if (!fid) {
    const hf = scene.find((f) => f.kind === "csg.web.scene.event_handler" && typeof f.effect === "string" && sceneEffectInvokeNames(f.effect).includes(name) && typeof f.handlerFn === "string" && fnById.has(f.handlerFn));
    if (hf) { fid = hf.handlerFn; callName = `chtInline_${hf.handlerFn}`; }
  }
  if (!fid) continue;
  walk(fid, localAliasesFor(callName, fid));
}
process.stderr.write(`total reachable fids (union over all handler roots)=${reachableFids.size}\n`);

// --- find every `.current =` write site for REF_NAME, report owner fid + reachability ---
console.log(`\n=== write sites for '${REF_NAME}' ===`);
let writeCount = 0, reachableWriteCount = 0;
for (const [fid, ops] of opsByFn) {
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (o.opKind !== "identifier" || o.name !== REF_NAME) continue;
    const nx = ops[i + 1];
    if (!nx || nx.opKind !== "property_write" || nx.name !== "current") continue;
    writeCount++;
    const reach = reachableFids.has(fid);
    if (reach) reachableWriteCount++;
    console.log(`  write #${writeCount}: owner fid=${fid}  reachable-from-any-handler-root=${reach}`);
  }
}
console.log(`\nTOTAL write sites=${writeCount}, reachable=${reachableWriteCount}, unreachable=${writeCount - reachableWriteCount}`);

// which handler root(s), if any, actually reach each write-site owner fid (for readable attribution)
if (writeCount > 0) {
  console.log(`\n=== attribution: which handler root(s) reach each write owner fid ===`);
  for (const [fid, ops] of opsByFn) {
    let isWriteOwner = false;
    for (let i = 0; i < ops.length; i++) {
      const o = ops[i];
      if (o.opKind === "identifier" && o.name === REF_NAME && ops[i + 1] && ops[i + 1].opKind === "property_write" && ops[i + 1].name === "current") isWriteOwner = true;
    }
    if (!isWriteOwner) continue;
    const reachingRoots = [];
    for (const name of invokeNames) {
      let rfid = resolveId(name), callName = name;
      if (!rfid) { const tgt = unwrapTrampoline(name); if (tgt) { const tfid = resolveId(tgt); if (tfid) { rfid = tfid; callName = tgt; } } }
      if (!rfid) {
        const hf = scene.find((f) => f.kind === "csg.web.scene.event_handler" && typeof f.effect === "string" && sceneEffectInvokeNames(f.effect).includes(name) && typeof f.handlerFn === "string" && fnById.has(f.handlerFn));
        if (hf) { rfid = hf.handlerFn; callName = `chtInline_${hf.handlerFn}`; }
      }
      if (!rfid) continue;
      const localVisited = new Set();
      const w2 = (cf, la) => { if (!cf || localVisited.has(cf)) return; localVisited.add(cf); for (const o of (opsByFn.get(cf) || [])) { if (o.opKind !== "call") continue; const c = String(o.callee || o.calleeText || ""); const t = la.get(c); if (t) w2(t, la); } };
      w2(rfid, localAliasesFor(callName, rfid));
      if (localVisited.has(fid)) reachingRoots.push(name);
    }
    console.log(`  write-owner fid=${fid}: reached by handler roots = [${reachingRoots.join(", ") || "NONE (orphan)"}]`);
  }
}
