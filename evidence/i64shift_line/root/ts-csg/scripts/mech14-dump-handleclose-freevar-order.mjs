// mech14 探针: 独立复算 handleClose 的完整、确定性 free-var 解析序列(freeVarsOfClosure 的完整返回
// 数组, 不受 buildCompiledHandlerTable 内部循环遇到第一个真阻塞就 break 的截断影响)。
//
// 下面 sfvt/localFunctionWrites/localFunctionTargetByName/localFunctionOwnerByNameAndTarget/
// localFunctionWritesByOwner/localAliasesFor/freeVarsOf/freeVarsOfClosure 七段逐字节复刻自
// scripts/scene-runtime-smoke-source.mjs 的 buildCompiledHandlerTable() 内部同名逻辑(该文件本卷
// 全程只读, 未改动一行——本探针是只读旁路, 不影响任何生产路径), 与 mech13-dump-localstream-ops.mjs
// 复刻 localFunctionTargetByName 的方法论完全同构: 非 mock、非猜测、非重新设计, 只是把闭包内部私有
// 状态搬到闭包外部以便独立观察, 真实算法字符不差。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const pkg = new URL("..", import.meta.url).pathname;
const { csgcReadFacts } = await import(pathToFileURL(join(pkg, "dist", "csgc-reader.js")).href);
const path = process.argv[2] || "tmp/mech14_run1/unimaker-react.csgc";
const coreFacts = csgcReadFacts(readFileSync(join(pkg, path))).facts;
const scenePath = process.argv[3] || path.replace(/unimaker-react\.csgc$/, "unimaker-react.scene.csgc");
const sceneFacts = csgcReadFacts(readFileSync(join(pkg, scenePath))).facts;

const CHT_BUILTIN_IDENTIFIERS = new Set(["undefined", "null"]);

const opsById = new Map(), opsByFn = new Map(), fnById = new Map();
for (const f of coreFacts) {
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
const localFunctionWrites = [];
for (const op of opsById.values()) {
  if (op.opKind !== "local_write" || typeof op.name !== "string" || typeof op.value !== "string") continue;
  const targetFid = sfvt(op.value);
  if (targetFid) localFunctionWrites.push({ name: op.name, targetFid, ownerFid: String(op.function || "") });
}
const localFunctionTargetByName = new Map();
const localFunctionOwnerByNameAndTarget = new Map();
const localFunctionWritesByOwner = new Map();
const localFunctionTargetKey = (name, fid) => `${name} ${fid}`;
for (const w of localFunctionWrites) {
  if (!localFunctionTargetByName.has(w.name)) localFunctionTargetByName.set(w.name, w.targetFid);
  const targetKey = localFunctionTargetKey(w.name, w.targetFid);
  if (!localFunctionOwnerByNameAndTarget.has(targetKey)) localFunctionOwnerByNameAndTarget.set(targetKey, w.ownerFid);
  if (!localFunctionWritesByOwner.has(w.ownerFid)) localFunctionWritesByOwner.set(w.ownerFid, []);
  localFunctionWritesByOwner.get(w.ownerFid).push(w);
}
// sceneInvokeNames: verbatim same construction as buildCompiledHandlerTable (scan sceneFacts'
// csg.web.scene.event_handler effect strings for "invoke:" segments) — real data, not approximated.
function sceneEffectInvokeNames(effect) {
  const text = String(effect || "");
  if (text.startsWith("invoke:")) return [text.slice("invoke:".length)];
  const names = [];
  for (const segment of text.split(";")) {
    if (segment.startsWith("invoke:")) names.push(segment.slice("invoke:".length));
  }
  return names;
}
const sceneInvokeNames = new Set();
for (const f of sceneFacts) {
  if (f.kind !== "csg.web.scene.event_handler" || typeof f.effect !== "string") continue;
  for (const name of sceneEffectInvokeNames(f.effect)) sceneInvokeNames.add(name);
}
const localAliasesFor = (name, fid) => {
  const owner = localFunctionOwnerByNameAndTarget.get(localFunctionTargetKey(name, fid));
  if (!owner) return new Map();
  const aliases = new Map();
  for (const w of (localFunctionWritesByOwner.get(owner) || [])) {
    if (sceneInvokeNames.has(w.name)) continue;
    if (w.ownerFid === owner && /^[A-Za-z_$][\w$]*$/.test(w.name) && !aliases.has(w.name)) aliases.set(w.name, w.targetFid);
  }
  return aliases;
};
const freeVarsByFid = new Map();
const freeVarsOf = (fid) => {
  if (freeVarsByFid.has(fid)) return freeVarsByFid.get(fid);
  const ops = opsByFn.get(fid) || [];
  const fn = fnById.get(fid);
  const params = new Set(((fn && fn.parameters) || []).map((p) => p && p.name).filter(Boolean));
  const locals = new Set();
  for (const o of ops) if ((o.opKind === "local_write" || o.opKind === "binding_extract") && o.name) locals.add(o.name);
  for (const o of ops) if ((o.opKind === "for_of" || o.opKind === "for_in" || o.opKind === "for_count") && o.initializerName) locals.add(String(o.initializerName));
  const out = [], seen = new Set();
  for (const o of ops) if (o.opKind === "identifier" && o.name && !CHT_BUILTIN_IDENTIFIERS.has(String(o.name)) && !params.has(o.name) && !locals.has(o.name) && !seen.has(o.name)) { seen.add(o.name); out.push(o.name); }
  freeVarsByFid.set(fid, out);
  return out;
};
const freeVarsOfClosure = (fid, localAliases) => {
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
  walk(fid);
  return out;
};

const targetName = process.argv[4] || "handleClose";
const fid = localFunctionTargetByName.get(targetName);
console.log(`--- mech14 freeVarsOfClosure 独立复算: ${targetName} (fid=${fid || "NOT FOUND"}) ---`);
if (!fid) process.exit(2);
const aliases = localAliasesFor(targetName, fid);
console.log(`localAliasesFor("${targetName}", fid) 命中的局部函数别名 (${aliases.size}):`);
for (const [name, targetFid] of aliases) console.log(`  ${name} -> fid=${targetFid}`);
const list = freeVarsOfClosure(fid, aliases);
console.log(`\n完整 free-var 解析序 (${list.length} 项, freeVarsOfClosure 原始返回数组, 未截断):`);
list.forEach((v, i) => console.log(`  [${i + 1}] ${v}`));
