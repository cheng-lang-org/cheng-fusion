// mech17 r1 探针: 复刻 buildCompiledHandlerTable 里 mechanism 12 (arrBoxRefs) 的精确判定逻辑
// (scene-runtime-smoke-source.mjs ~6216-6330 行, 本文件只读未改动), 对真实提取的全部
// queuedVoiceIceCandidatesRef 出现点逐条判定"当前代码会把 usage.{arrOk,isDom,objectLike,arrShapesSeen}
// 置成什么", 消除对 nx/nx2 位置关系的猜测。只读 core facts(extraction 阶段产物, 与 DouDiZhuPage
// roomState 碰撞/scene 物化管线完全无关, 不需要任何探针改名)。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const pkg = new URL("..", import.meta.url).pathname;
const { csgcReadFacts } = await import(pathToFileURL(join(pkg, "dist", "csgc-reader.js")).href);
const path = process.argv[2] || "tmp/census-m17r1/unimaker-react.csgc";
const REF_NAME = process.argv[3] || "queuedVoiceIceCandidatesRef";
const facts = csgcReadFacts(readFileSync(join(pkg, path))).facts;

const opsById = new Map(), opsByFn = new Map(), dataById = new Map();
for (const f of facts) {
  if (f.kind === "csg.op") {
    opsById.set(f.id, f);
    if (!opsByFn.has(f.function)) opsByFn.set(f.function, []);
    opsByFn.get(f.function).push(f);
  }
  if (f.kind === "csg.data") dataById.set(f.id, f.value);
}
for (const ops of opsByFn.values()) ops.sort((a, b) => (Number(a.ordinal) || 0) - (Number(b.ordinal) || 0));

// Which source function ids belong to ChessPage.tsx (informational only, printed per hit).
const fnFile = new Map();
for (const f of facts) if (f.kind === "csg.function" && typeof f.id !== "undefined") fnFile.set(f.id, f.sourceFile || f.file || "");

const usage = { objectLike: false, isDom: false, setOk: true, setMethodsSeen: new Set(), arrOk: true, arrShapesSeen: new Set() };
let total = 0;

for (const [fid, ops] of opsByFn) {
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (o.opKind !== "identifier" || o.name !== REF_NAME) continue;
    total++;
    const nx = ops[i + 1], nx2 = ops[i + 2];
    const file = fnFile.get(fid) || "?";
    console.log(`\n#${total} fn=${fid} file=${file} i=${i}`);
    console.log(`  nx  = ${nx ? nx.opKind + (nx.name ? "/" + nx.name : "") : "<end>"}`);
    console.log(`  nx2 = ${nx2 ? nx2.opKind + (nx2.name ? "/" + nx2.name : "") + (nx2.memberName ? "/member=" + nx2.memberName : "") + "/recv=" + (nx2.receiver === nx?.id ? "MATCH" : String(nx2.receiver)) + "/argc=" + ((nx2.arguments || []).length) : "<end>"}`);

    if (nx && nx.opKind === "property_read" && nx.name === "current") {
      // objectLike gate (line ~6247): any property_read/property_write/call chained on `.current`
      // (receiver===nx.id) trips objectLike unless it's a whitelisted handle-deref (mech15, N/A for
      // an array ref — queuedVoiceIceCandidatesRef's declared type RTCIceCandidateInit[] is never a
      // CHT_HANDLE_REF_TYPES member so isWhitelistedHandleDeref is structurally false here).
      const tripsObjectLike = !!(nx2 && nx2.receiver === nx.id && (nx2.opKind === "property_read" || nx2.opKind === "property_write" || nx2.opKind === "call"));
      if (tripsObjectLike) usage.objectLike = true;

      const pushCallOp = ops.find((op2) => op2.opKind === "call" && op2.receiver === nx.id && String(op2.memberName || "") === "push");
      const isArrPushCall = !!pushCallOp && (pushCallOp.arguments || []).length === 1
        && opsById.get(String(pushCallOp.arguments[0]))?.opKind === "spread";

      let setOrDomNote = "n/a (not a call)";
      if (nx2 && nx2.opKind === "call") {
        const mname = String(nx2.memberName || "");
        const argc = (nx2.arguments || []).length;
        const isSetCall = (mname === "has" && argc === 1) || (mname === "add" && argc === 1) || (mname === "clear" && argc === 0);
        if (isSetCall) { usage.setMethodsSeen.add(mname); setOrDomNote = `setCall(${mname})`; }
        else {
          usage.setOk = false;
          if (!isArrPushCall) { usage.isDom = true; setOrDomNote = `setOk=false, isDom=true (mname=${mname}, isArrPushCall=false)`; }
          else setOrDomNote = `setOk=false, isDom UNCHANGED (isArrPushCall=true, mname=push+spread)`;
        }
      }

      let arrShapeMatched = false, arrShapeNote;
      if (isArrPushCall) { usage.arrShapesSeen.add("push"); arrShapeMatched = true; arrShapeNote = "push(...spread)"; }
      else if (nx2 && nx2.opKind === "array_literal" && (nx2.elements || []).length === 1 && (nx2.spreadFlags || [])[0] === true) { usage.arrShapesSeen.add("copy"); arrShapeMatched = true; arrShapeNote = "copy [...ref.current]"; }
      else if (nx2 && nx2.opKind === "property_read" && nx2.name === "length") { usage.arrShapesSeen.add("length"); arrShapeMatched = true; arrShapeNote = "length"; }
      else arrShapeNote = "NO MATCH";
      if (!arrShapeMatched) usage.arrOk = false;

      console.log(`  => tripsObjectLike=${tripsObjectLike}  isArrPushCall=${isArrPushCall}  ${setOrDomNote}  arrShape=${arrShapeNote}`);
    }
    if (nx && nx.opKind === "property_write" && nx.name === "current") {
      const vo = opsById.get(nx.value);
      const isEmptyArrayLiteralWrite = vo && vo.opKind === "array_literal" && Number(vo.elementCount ?? (vo.elements || []).length) === 0;
      if (vo && (vo.opKind === "object_literal" || vo.opKind === "new" || vo.opKind === "array_literal")) usage.objectLike = true;
      if (isEmptyArrayLiteralWrite) usage.arrShapesSeen.add("clear"); else usage.arrOk = false;
      console.log(`  => write .current = ${vo ? vo.opKind : "?"}  isEmptyArrayLiteralWrite=${isEmptyArrayLiteralWrite}`);
    }
  }
}

console.log(`\n=== TOTAL occurrences of '${REF_NAME}': ${total} ===`);
console.log(`final usage.objectLike=${usage.objectLike}`);
console.log(`final usage.isDom=${usage.isDom}`);
console.log(`final usage.setOk=${usage.setOk}  setMethodsSeen=${[...usage.setMethodsSeen]}`);
console.log(`final usage.arrOk=${usage.arrOk}  arrShapesSeen=${[...usage.arrShapesSeen]}`);
console.log(`\narrBoxRefs classification requires: scalarBoxRefs.has=N (scalarType never set here) && objBoxRefs.has=N (no hasObjLitWrite) && setBoxRefs.has=N && usage.arrOk && arrShapesSeen.size>0 && !usage.isDom && !usage.hasObjLitWrite`);
console.log(`  => would this ref reach arrBoxRefs.set(...)? ${usage.arrOk && usage.arrShapesSeen.size > 0 && !usage.isDom ? "YES" : "NO (excluded — falls through to fv-unknown)"}`);
