// mech18 r1 探针: 复刻 buildCompiledHandlerTable 里 mechanism 14 (structBoxRefs) 的精确判定逻辑
// (scene-runtime-smoke-source.mjs ~6138-6146(refDeclaredNullableType 注册)/~6154-6157
// (localVarTypeTextByFnAndName)/~6216-6250(objectLike 门)/~6425-6465(structBoxRefs 判定+写形态门)
// 行, 本文件对源码只读不改), 对真实提取的全部 latestRoomStateRef 出现点逐条判定"当前代码会把
// usage.{objectLike,isDom} 与 declType/reg/writesOk 置成什么", 消除对 nx/nx2 位置关系与
// localVarTypeTextByFnAndName 命中与否的猜测。只读 core facts(提取阶段产物，与 DouDiZhuPage
// roomState 碰撞/scene 物化管线完全无关，不需要任何探针改名——同 mech17 探针纪律)。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const pkg = new URL("..", import.meta.url).pathname;
const { csgcReadFacts } = await import(pathToFileURL(join(pkg, "dist", "csgc-reader.js")).href);
const path = process.argv[2] || "tmp/census-m18r1/unimaker-react.csgc";
const REF_NAME = process.argv[3] || "latestRoomStateRef";
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

const fnFile = new Map();
for (const f of facts) if (f.kind === "csg.function" && typeof f.id !== "undefined") fnFile.set(f.id, f.sourceFile || f.file || "");

// --- Step 0: chtTypeDeclNames + CHT_STRUCT_REF_TYPES / CHT_HANDLE_REF_TYPES real membership ---
const typeDeclNames = new Set(facts.filter((f) => f.kind === "csg.type_decl" && typeof f.name === "string").map((f) => String(f.name)));
console.log(`csg.type_decl fact count total=${facts.filter((f) => f.kind === "csg.type_decl").length}`);
console.log(`typeDeclNames has 'RealtimeChessRoom'? ${typeDeclNames.has("RealtimeChessRoom")}`);
const CHT_STRUCT_REF_TYPES = new Set(["WebRtcIceConfig"]); // mirrors scene-runtime-smoke-source.mjs verbatim (read-only copy for the probe)
const CHT_HANDLE_REF_TYPES = new Set(["MediaStream", "RTCPeerConnection"]);
console.log(`CHT_STRUCT_REF_TYPES has 'RealtimeChessRoom'? ${CHT_STRUCT_REF_TYPES.has("RealtimeChessRoom")}`);
console.log(`CHT_HANDLE_REF_TYPES has 'RealtimeChessRoom'? ${CHT_HANDLE_REF_TYPES.has("RealtimeChessRoom")}`);

// --- Step 1: refDeclaredNullableType registration (declaration form, keyed off useRef CALL's
// checker-resolved returnType annotation, NOT off the initial-value argument expression) ---
const REF_NULLABLE_RETURN_TYPE_RE = /^(?:React\.)?MutableRefObject<(.+)\s*\|\s*null>$/;
let declMatch = null, declReturnTypeRaw = null, declInitialValueOpKind = null, declInitialValueName = null;
for (const o of opsById.values()) if (o.opKind === "local_write" && o.name === REF_NAME && o.value) {
  const v = opsById.get(o.value);
  if (v && v.opKind === "call" && (v.callee || v.calleeText) === "useRef") {
    declReturnTypeRaw = String(v.returnType || "");
    const mn = REF_NULLABLE_RETURN_TYPE_RE.exec(declReturnTypeRaw);
    if (mn) declMatch = mn[1].trim();
    const args = v.arguments || [];
    if (args.length === 1) {
      const argOp = opsById.get(String(args[0]));
      declInitialValueOpKind = argOp ? argOp.opKind : "<missing>";
      declInitialValueName = argOp ? (argOp.name ?? "") : "";
    }
  }
}
console.log(`\n=== Step1: declaration ===`);
console.log(`useRef returnType raw = "${declReturnTypeRaw}"`);
console.log(`REF_NULLABLE_RETURN_TYPE_RE match -> declaredType = ${declMatch === null ? "NO MATCH" : `"${declMatch}"`}`);
console.log(`useRef(...) initial-value arg opKind=${declInitialValueOpKind} name=${declInitialValueName}  (initial value is a VARIABLE, not null/literal -- per task framing)`);
console.log(`=> refDeclaredNullableType.get('${REF_NAME}') would be: ${declMatch === null ? "undefined (registration MISSES)" : `"${declMatch}"`}`);

// --- Step 2: localVarTypeTextByFnAndName — does the useState-destructured `roomState` binding
// carry a typeText the write-shape gate can match against? ---
const localVarTypeTextByFnAndName = new Map();
for (const o of opsById.values()) {
  if ((o.opKind === "local_write" || o.opKind === "binding_extract") && typeof o.name === "string" && typeof o.typeText === "string") {
    localVarTypeTextByFnAndName.set(`${o.function} ${o.name}`, o.typeText);
  }
}
// Find every op literally named "roomState" (any function) to show its own opKind/typeText, real not assumed.
console.log(`\n=== Step2: localVarTypeTextByFnAndName probe for identifier "roomState" ===`);
let roomStateBindingCount = 0;
for (const o of opsById.values()) {
  if ((o.opKind === "local_write" || o.opKind === "binding_extract") && o.name === "roomState") {
    roomStateBindingCount++;
    console.log(`  binding #${roomStateBindingCount}: fn=${o.function} opKind=${o.opKind} typeText=${JSON.stringify(o.typeText)}`);
  }
}
if (roomStateBindingCount === 0) console.log(`  NO local_write/binding_extract op named "roomState" found at all`);

// --- Step 3: per-occurrence walk, mirroring the real objectLike gate + structBoxRefs write gate ---
const usage = { objectLike: false, isDom: false };
let total = 0;
const currentWrites = []; // {fn, valueOpKind, valueName, isNullSentinel}

for (const [fid, ops] of opsByFn) {
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (o.opKind !== "identifier" || o.name !== REF_NAME) continue;
    total++;
    const nx = ops[i + 1], nx2 = ops[i + 2];
    const file = fnFile.get(fid) || "?";
    console.log(`\n#${total} fn=${fid} file=${file} i=${i}`);
    console.log(`  nx  = ${nx ? nx.opKind + (nx.name ? "/" + nx.name : "") : "<end>"}`);
    console.log(`  nx2 = ${nx2 ? nx2.opKind + (nx2.name ? "/" + nx2.name : "") + (nx2.memberName ? "/member=" + nx2.memberName : "") + "/recv=" + (nx2.receiver === nx?.id ? "MATCH" : String(nx2.receiver)) : "<end>"}`);

    if (nx && nx.opKind === "property_read" && nx.name === "current") {
      const tripsObjectLike = !!(nx2 && nx2.receiver === nx.id && (nx2.opKind === "property_read" || nx2.opKind === "property_write" || nx2.opKind === "call"));
      if (tripsObjectLike) usage.objectLike = true;
      console.log(`  => READ .current  tripsObjectLike(chained .current.<field>)=${tripsObjectLike}`);
    }
    if (nx && nx.opKind === "property_write" && nx.name === "current") {
      const vo = opsById.get(nx.value);
      const isNullSentinel = (vo && vo.opKind === "literal" && dataById.get(String(vo.data)) === null)
        || (vo && vo.opKind === "identifier" && (vo.name === "null" || vo.name === "undefined"));
      if (vo && (vo.opKind === "object_literal" || vo.opKind === "new" || vo.opKind === "array_literal")) usage.objectLike = true;
      currentWrites.push({ fn: fid, valueOpKind: vo ? vo.opKind : "?", valueName: vo ? vo.name : undefined, isNullSentinel });
      console.log(`  => WRITE .current = ${vo ? vo.opKind : "?"}${vo && vo.name ? "/" + vo.name : ""}  isNullSentinel=${isNullSentinel}`);
    }
  }
}

console.log(`\n=== TOTAL occurrences of '${REF_NAME}': ${total} ===`);
console.log(`final usage.objectLike=${usage.objectLike}`);

// --- Step 4: structBoxRefs write-shape gate, replayed against each real .current= write ---
console.log(`\n=== Step4: structBoxRefs write-shape gate replay (declType = ${declMatch === null ? "undefined" : `"${declMatch}"`}) ===`);
let writesOk = true;
for (const w of currentWrites) {
  if (w.isNullSentinel) { console.log(`  write in fn=${w.fn}: null-sentinel -> continue (OK)`); continue; }
  if (w.valueOpKind === "identifier") {
    const writeDeclType = localVarTypeTextByFnAndName.get(`${w.fn} ${w.valueName}`);
    const matches = writeDeclType !== undefined && declMatch !== null && writeDeclType === declMatch;
    console.log(`  write in fn=${w.fn}: identifier "${w.valueName}", localVarTypeTextByFnAndName lookup = ${JSON.stringify(writeDeclType)}, matches declType? ${matches}`);
    if (matches) continue;
  } else {
    console.log(`  write in fn=${w.fn}: valueOpKind=${w.valueOpKind} (not identifier, not null-sentinel)`);
  }
  writesOk = false;
}
console.log(`final writesOk=${writesOk}`);

console.log(`\n=== FINAL VERDICT ===`);
console.log(`structBoxRefs admission requires: !usage.objectLike && !usage.isDom && declType!==undefined && CHT_STRUCT_REF_TYPES.has(declType) && writesOk`);
console.log(`  !usage.objectLike = ${!usage.objectLike}`);
console.log(`  !usage.isDom = ${!usage.isDom}`);
console.log(`  declType defined = ${declMatch !== null}`);
console.log(`  CHT_STRUCT_REF_TYPES.has(declType) = ${declMatch !== null && CHT_STRUCT_REF_TYPES.has(declMatch)}`);
console.log(`  writesOk = ${writesOk}`);
const admitted = !usage.objectLike && !usage.isDom && declMatch !== null && CHT_STRUCT_REF_TYPES.has(declMatch) && writesOk;
console.log(`  => would this ref reach structBoxRefs.set(...)? ${admitted ? "YES" : "NO (excluded -- falls through to fv-unknown)"}`);
