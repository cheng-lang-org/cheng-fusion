// mech15 impl r2 探针: 从真实 UniMaker 提取的 .csgc 里抽取 ChessPage peerConnectionRef 相关函数的真实
// op 序列 + block 结构(含 try/catch 的 tryBlock/catchBlock/finallyBlock 字段), 供白名单门槛与
// teardown 折叠形状设计使用。复刻 mech13-dump-localstream-ops.mjs 的 localFunctionTargetByName 解析
// 逻辑(与生产 orchestrator scene-runtime-smoke-source.mjs 同一算法), 非 mock, 非猜测。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const pkg = new URL("..", import.meta.url).pathname;
const { csgcReadFacts } = await import(pathToFileURL(join(pkg, "dist", "csgc-reader.js")).href);
const path = process.argv[2] || "tmp/mech15r2_run1/unimaker-react.csgc";
const facts = csgcReadFacts(readFileSync(join(pkg, path))).facts;

const opsById = new Map(), opsByFn = new Map(), opsByBlock = new Map();
for (const f of facts) {
  if (f.kind === "csg.op") {
    opsById.set(f.id, f);
    if (!opsByFn.has(f.function)) opsByFn.set(f.function, []);
    opsByFn.get(f.function).push(f);
    const b = typeof f.block === "string" ? f.block : "";
    if (!opsByBlock.has(b)) opsByBlock.set(b, []);
    opsByBlock.get(b).push(f);
  }
}
const sfvt = (v) => {
  const op = opsById.get(v);
  if (!op) return undefined;
  if (op.opKind === "function_value") return op.targetFunction;
  if (op.opKind === "call" && (op.callee || op.calleeText) === "useCallback" && op.arguments && op.arguments[0]) return sfvt(op.arguments[0]);
  return undefined;
};
const localFunctionTargetByName = new Map();
for (const op of opsById.values()) {
  if (op.opKind !== "local_write" || typeof op.name !== "string" || typeof op.value !== "string") continue;
  const targetFid = sfvt(op.value);
  if (targetFid && !localFunctionTargetByName.has(op.name)) localFunctionTargetByName.set(op.name, targetFid);
}

const targets = ["releaseVoiceRuntime", "ensureVoicePeerConnection", "flushPendingIceCandidates", "handleIncomingVoiceAnswer", "handleIncomingVoiceIceCandidate", "handleVoiceAction", "handleClose"];
console.log("=== localFunctionTargetByName lookups ===");
for (const name of targets) {
  const fid = localFunctionTargetByName.get(name);
  console.log(`${name}: ${fid ? "fid=" + fid : "NOT FOUND"}`);
}

function dumpFn(fid, label) {
  const ops = (opsByFn.get(fid) || []).slice().sort((a, b) => (Number(a.ordinal) || 0) - (Number(b.ordinal) || 0));
  console.log(`\n=== ops for ${label} (fid=${fid}, ${ops.length} ops) ===`);
  for (let i = 0; i < ops.length; i++) {
    const { kind, ...rest } = ops[i];
    console.log(`[${i}] ${JSON.stringify(rest)}`);
  }
}

for (const name of targets) {
  const fid = localFunctionTargetByName.get(name);
  if (fid) dumpFn(fid, name);
}

// declared nullable type for peerConnectionRef (mechanism 14 style extraction, useRef<T|null>(null))
console.log("\n=== useRef<T|null>(null) declared types (scan for peerConnectionRef) ===");
const REF_NULLABLE_RETURN_TYPE_RE = /^(?:React\.)?MutableRefObject<(.+)\s*\|\s*null>$/;
for (const o of opsById.values()) {
  if (o.opKind === "local_write" && o.value) {
    const v = opsById.get(o.value);
    if (v && v.opKind === "call" && (v.callee || v.calleeText) === "useRef" && o.name === "peerConnectionRef") {
      const mn = REF_NULLABLE_RETURN_TYPE_RE.exec(String(v.returnType || ""));
      console.log(`peerConnectionRef useRef returnType=${JSON.stringify(v.returnType)} matched=${mn ? mn[1].trim() : "NO MATCH"}`);
    }
  }
}

// local_write typeText for `connection` (write-side type used by ensureVoicePeerConnection at line 930)
console.log("\n=== local_write ops named 'connection' (typeText check) ===");
for (const o of opsById.values()) {
  if (o.opKind === "local_write" && o.name === "connection") {
    console.log(JSON.stringify({ function: o.function, typeText: o.typeText, typeSource: o.typeSource, value: o.value, valueOpKind: opsById.get(o.value)?.opKind, valueCallee: opsById.get(o.value)?.callee || opsById.get(o.value)?.calleeText }));
  }
}
