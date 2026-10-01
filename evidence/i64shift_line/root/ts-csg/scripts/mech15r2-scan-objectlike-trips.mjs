// mech15 impl r2 探针: 复刻 buildCompiledHandlerTable 里 objectLike 判定的精确逻辑(scene-runtime-
// smoke-source.mjs ~6058-6162 行, 本文件只读未改动), 对真实提取的全部 peerConnectionRef 出现点逐条判
// 定"当前代码是否会把 usage.objectLike 置 true", 消除对 nx2 位置关系的猜测。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const pkg = new URL("..", import.meta.url).pathname;
const { csgcReadFacts } = await import(pathToFileURL(join(pkg, "dist", "csgc-reader.js")).href);
const path = process.argv[2] || "tmp/mech15r2_run1/unimaker-react.csgc";
const facts = csgcReadFacts(readFileSync(join(pkg, path))).facts;
const REF_NAME = process.argv[3] || "peerConnectionRef";

const opsById = new Map(), opsByFn = new Map();
for (const f of facts) {
  if (f.kind === "csg.op") {
    opsById.set(f.id, f);
    if (!opsByFn.has(f.function)) opsByFn.set(f.function, []);
    opsByFn.get(f.function).push(f);
  }
}
for (const ops of opsByFn.values()) ops.sort((a, b) => (Number(a.ordinal) || 0) - (Number(b.ordinal) || 0));

let total = 0, trips = 0;
for (const [fid, ops] of opsByFn) {
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (o.opKind !== "identifier" || o.name !== REF_NAME) continue;
    total++;
    const nx = ops[i + 1], nx2 = ops[i + 2];
    let curVal = "no-.current-follow";
    let willTrip = false;
    if (nx && nx.opKind === "property_read" && nx.name === "current") {
      curVal = "current-read";
      if (nx2 && nx2.receiver === nx.id && (nx2.opKind === "property_read" || nx2.opKind === "property_write" || nx2.opKind === "call")) {
        willTrip = true;
      }
    }
    if (willTrip) trips++;
    console.log(`fn=${fid} i=${i} nx=${nx ? nx.opKind + (nx.name ? "/" + nx.name : "") : "<end>"} nx2=${nx2 ? nx2.opKind + (nx2.name ? "/" + nx2.name : "") + (nx2.memberName ? "/" + nx2.memberName : "") + "/recv=" + (nx2.receiver === nx?.id ? "MATCH" : String(nx2.receiver)) : "<end>"} => ${curVal} willTripObjectLike=${willTrip}`);
  }
}
console.log(`\nTOTAL occurrences of identifier '${REF_NAME}': ${total}, WOULD TRIP objectLike (current code, pre-patch): ${trips}`);
