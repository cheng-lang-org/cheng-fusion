// mech13 探针: 从真实 UniMaker 提取的 .csgc 里抽取 ChessPage localStreamRef 相关函数的真实 op 序列。
// 复刻 scene-runtime-smoke-source.mjs 里 localFunctionTargetByName 的解析逻辑(useCallback/局部箭头
// 函数按名字解析, 与生产 orchestrator 完全同一套算法), 非 mock, 非猜测。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const pkg = new URL("..", import.meta.url).pathname;
const { csgcReadFacts } = await import(pathToFileURL(join(pkg, "dist", "csgc-reader.js")).href);
const path = process.argv[2] || "tmp/mech13_baseline/unimaker-react.csgc";
const facts = csgcReadFacts(readFileSync(join(pkg, path))).facts;

const opsById = new Map(), opsByFn = new Map();
for (const f of facts) {
  if (f.kind === "csg.op") {
    opsById.set(f.id, f);
    if (!opsByFn.has(f.function)) opsByFn.set(f.function, []);
    opsByFn.get(f.function).push(f);
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

const targets = ["ensureLocalVoiceMedia", "releaseVoiceRuntime", "stopStreamTracks", "toggleMicrophone", "handleClose", "handleVoiceAction"];
for (const name of targets) {
  const fid = localFunctionTargetByName.get(name);
  console.log(`\n=== ${name}: ${fid ? "fid=" + fid : "NOT FOUND"} ===`);
}

for (const fid of process.argv.slice(3)) {
  const ops = (opsByFn.get(fid) || []).slice().sort((a, b) => (Number(a.ordinal) || 0) - (Number(b.ordinal) || 0));
  console.log(`\n=== ops for ${fid} (${ops.length}) ===`);
  for (let i = 0; i < ops.length; i++) {
    const { kind, ...rest } = ops[i];
    console.log(`[${i}] ${JSON.stringify(rest)}`);
  }
}
