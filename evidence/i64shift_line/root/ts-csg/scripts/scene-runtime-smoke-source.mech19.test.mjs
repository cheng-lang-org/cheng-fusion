// scene-runtime-smoke-source.mech19.test.mjs
//
// 机制19 r1: 写可达性安全网(跨全部六个 box-ref 家族: scalar/object/set/array/struct/handle —
// handle 是 scalar 的写形态子类, 走同一 scalarBoxRefs 门禁, 不需要独立测试)。
//
// 背景(详见 mech19_impl_r1_verdict.md 的普查矩阵全量记录): 对全项目 199 个 useRef() 候选、已被
// 现有分类器接纳的 92 个 box-ref、285 个 ref×写点组合逐一判定"该写点所在函数是否可从任一 JSX
// invoke: handler 根经调用图可达"——93.0%(265/285)的写点当前不可达。mech18 r1 已用真实生产代码
// (latestRoomStateRef)证实这是一个真实、可复现的静默 stale-read 风险(编译成功但写永不执行,读到
// KV 槽零值), 但当时判定"0 个安全 admission 点", 未落地修复, 只诊断+锁定证据。本文件锁定 mech19
// r1 实际落地的修复: scene-runtime-smoke-source.mjs 新增 `reachableWriteOwnerFids`(从每个
// JSX-绑定的 handler 名出发, 复用 `freeVarsOfClosure` 已有的 trampoline/delegate/inline-JSX-arrow
// 解析 + 本地函数别名调用图遍历语义, 得到"从任一 handler 根可达的函数 id 全集")+
// `refWriteReachabilityOk(refName, usage)`(单一共享谓词: 有写点则要求至少一个可达, 零写点则要求
// useRef 初值是编译期常量), 接入全部五个"有独立 admission 判定点"的家族(struct 的判定虽在自己的
// writesOk 独立 pass 里, 但复用同一份 usage.currentWriteCount/hasReachableCurrentWrite, 因为写
// 位点侦测发生在同一个共享 per-op 扫描循环里, 不分家族)。
//
// ★现役影响(第一性问题的真实答案, 对真实 UniMaker 提取的 825898-fact core + 对应 scene facts 实测,
// 见 verdict §4): 当前唯一真正编译成功的 10 个 handler
// (handleSettingsToggle/handleVideoToggle/handleVideoMuteToggle/handleFullscreen/handleSendComment/
// handleLike/handleReport/handleCopyDid/handleCopyDidBackup/handleMouseUp)里, 92 个已接纳 box-ref
// 中只有 mousePanningRef 真正被消费(由 handleMouseUp), 且它 3 个写点里有 1 个可达(handleMouseUp
// 自己的写)——`refWriteReachabilityOk` 判定为 true, 予以放行。零现役 miscompile、零现役编译产物
// 变化(cht-measure 三次独立重跑逐字节一致: CHT_compiled=10, 同名单, 同 skip)。测试3 精确复刻这个
// "混合"形状(2 不可达 + 1 可达), 锁定"混合 ref 不因为部分写点不可达就被连坐排除"这条设计约束。
//
// ★机制19 r2 更新(mech19_r1v_b_verdict.md 定谳 r1 REFUTED, 本文件测试7/9-11/13 就地记录此次修复):
// r1 的 `usage.currentWriteCount`/`hasReachableCurrentWrite` 只在 `property_write current` 分支
// 递增——array 家族的 push(...xs)/push(x)/splice(0) 与 set 家族的 .add/.clear 全部是 CALL op,
// 在更早的 `property_read current` 分支被识别(pushCallOp/spliceCallOp 的 ID-backreference 检测),
// 从未触达 property_write 分支。结果: 任何只用这些 CALL 型写形态、从不用 `.current = x` 赋值的
// ref, currentWriteCount 恒为 0, 落进"零写点→只看初值是否编译期常量"的兜底路径——`useRef<T[]>([])`/
// `useRef(new Set())` 恒是常量, 安全网对这整类 ref 是空转的, 一个真孤儿写函数会被放行(与
// mech18 定谳的 latestRoomStateRef 同类洞)。复核 B 用可执行复现(`arrPushOnlyOrphanRef`,
// isArrPushOneCall 形态, 与生产真实的 pendingIceCandidatesRef/queuedVoiceIceCandidatesRef 同型)
// 证伪 r1 自称的"天然覆盖 scalar/object/array/struct 全部四族"。本轮(r2)把 array 家族的三种 CALL
// 型写(push/pushOne/drain)与 set 家族的两种 CALL 型写(add/clear)全部接入同一份
// usage.currentWriteCount/hasReachableCurrentWrite——`refWriteReachabilityOk` 仍是唯一消费者,
// 无新谓词、无旁路。`.current.delete(x)`(set)保持真正不建模(mechanism 11 既有注释明文声明), 已在
// isSetCall 之外, 会先于 admission 就 setOk 闭合失败, 不需要新的写点计数分支(测试13 锁定此点)。
// 测试9/10/11 各配一个"孤儿排除"+"可达控制组"对照, 测试7/8 是 set 家族的对称 GAP CLOSED 翻转
// (原"documented scope limit"测试断言的是 r1 的真实(现已修复)行为, 就地翻转, 同 mech18 ★KNOWN
// GAP → ★GAP CLOSED 的三态牙齿惯例)。测试10 是复核 B 反例的直接吸收——同一 fid 级 op 序列锁定为
// 永久回归。
//
// Usage: node scripts/scene-runtime-smoke-source.mech19.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

function componentFn() {
  return { kind: "csg.function", id: "fn.component", name: "Mech19TestComponent", parameters: [], returnType: "void" };
}
function orphanFn(fid) {
  // A plain csg.function fact NEVER referenced by any function_value/call op and NEVER bound to any
  // eventHandlerFact — faithful to latestRoomStateRef's real useEffect closure (mech18 r1 §2): its
  // only "reference" anywhere is as an argument to something CHT never compiles, never a call target.
  return { kind: "csg.function", id: fid, name: "<anonymous-orphan>", parameters: [], returnType: "void" };
}
function handlerBindingFacts(handlerName, targetFid) {
  return [
    { kind: "csg.op", id: `op.fnvalue.${handlerName}`, function: "fn.component", block: "block.component", opKind: "function_value", targetFunction: targetFid },
    { kind: "csg.op", id: `op.localwrite.${handlerName}`, function: "fn.component", block: "block.component", opKind: "local_write", name: handlerName, value: `op.fnvalue.${handlerName}` },
    { kind: "csg.function", id: targetFid, name: "<anonymous>", parameters: [], returnType: "void" },
  ];
}
function eventHandlerFact(handlerName) {
  return { kind: "csg.web.scene.event_handler", effect: `invoke:${handlerName}`, routeIndex: 0, nodeId: 0 };
}
function useRefFacts(refName, returnType, initialValueOpId) {
  return [
    { kind: "csg.op", id: `op.useRef.call.${refName}`, function: "fn.component", block: "block.component", opKind: "call", callee: "useRef", arguments: initialValueOpId ? [initialValueOpId] : [], returnType },
    { kind: "csg.op", id: `op.useRef.write.${refName}`, function: "fn.component", block: "block.component", opKind: "local_write", name: refName, value: `op.useRef.call.${refName}` },
  ];
}
function strLiteralOp(id, fid, block, value) {
  return [
    { kind: "csg.data", id: `${id}.data`, dataKind: "string", value },
    { kind: "csg.op", id, function: fid, block, opKind: "literal", data: `${id}.data` },
  ];
}
function scalarStrWriteFacts(fid, block, refName, strValue, tag) {
  const idBase = `op.${tag}`;
  return [
    ...strLiteralOp(`${idBase}.lit`, fid, block, strValue),
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.lit` },
  ];
}
function objLitWriteFacts(fid, block, refName, fieldName, strValue, tag) {
  const idBase = `op.${tag}`;
  return [
    ...strLiteralOp(`${idBase}.lit`, fid, block, strValue),
    { kind: "csg.op", id: `${idBase}.objlit`, function: fid, block, opKind: "object_literal", properties: [{ name: fieldName, value: `${idBase}.lit` }] },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.objlit` },
  ];
}
function nullWriteFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.data", id: `${idBase}.null`, dataKind: "null", value: null },
    { kind: "csg.op", id: `${idBase}.nulllit`, function: fid, block, opKind: "literal", data: `${idBase}.null` },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.nulllit` },
  ];
}
function returnReadFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.ret`, function: fid, block, opKind: "return", value: `${idBase}.cur` },
  ];
}
function arrClearWriteFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.emptyarr`, function: fid, block, opKind: "array_literal", elementCount: 0, elements: [] },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.emptyarr` },
  ];
}
function arrLengthReadFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.len`, function: fid, block, opKind: "property_read", name: "length", receiver: `${idBase}.cur` },
    { kind: "csg.op", id: `${idBase}.ret`, function: fid, block, opKind: "return", value: `${idBase}.len` },
  ];
}
function setMethodCallFacts(fid, block, refName, methodName, args, tag) {
  const idBase = `op.${tag}`;
  const ops = [];
  const argIds = args.map((v, i) => { ops.push(...strLiteralOp(`${idBase}.arg${i}`, fid, block, v)); return `${idBase}.arg${i}`; });
  ops.push(
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.call`, function: fid, block, opKind: "call", receiver: `${idBase}.cur`, memberName: methodName, arguments: argIds },
  );
  return ops;
}

// --- mech19 r2 additions below: the three CALL-type array write shapes, real ts-csg emission
// order (ref identifier, property_read("current"), THEN the argument sub-expression(s), THEN the
// call op LAST — verified against real UniMaker extraction, same ordering scene-runtime-smoke-
// source.mech12.test.mjs's arrPushFactsRealistic/arrNonSpreadPushFacts/arrDrainFacts document; ID-
// backreference finds the call by `receiver === the .current op's own id`, not by array position).

// `const <localName> = [...<refName>.current]` (spread-copy-read into a fresh local) — used ONLY to
// give a `push(...srcIdentifierName)` write a resolvable, real-typed free-variable source (mirrors
// scene-runtime-smoke-source.mech12.test.mjs's own arrCopyReadFacts/positive-realistic-op-order
// test convention: a bare unbound identifier trips an UNRELATED fv-unknown:<sourceName> for the
// source name itself, which is not what these admission tests are checking).
function arrCopyReadFacts(fid, block, refName, localName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.arrlit`, function: fid, block, opKind: "array_literal", elementCount: 1, elements: [`${idBase}.cur`], spreadFlags: [true] },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "local_write", name: localName, value: `${idBase}.arrlit` },
  ];
}

// `.current.push(...srcIdentifierName)` — spread-append (isArrPushCall).
function arrPushSpreadFacts(fid, block, refName, srcIdentifierName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.src`, function: fid, block, opKind: "identifier", name: srcIdentifierName },
    { kind: "csg.op", id: `${idBase}.spread`, function: fid, block, opKind: "spread", value: `${idBase}.src` },
    { kind: "csg.op", id: `${idBase}.call`, function: fid, block, opKind: "call", callee: `${refName}.current.push`, memberName: "push", receiver: `${idBase}.cur`, arguments: [`${idBase}.spread`] },
  ];
}

// `.current.push(x)` — single non-spread argument (isArrPushOneCall, mech17 r1's
// queuedVoiceIceCandidatesRef/pendingIceCandidatesRef real production shape — ChessPage.tsx:847).
// This is the EXACT shape mech19_r1v_b_verdict.md's arrPushOnlyOrphanRef repro used to prove r1's
// safety net was silently non-admitting-safe (i.e. it silently ADMITTED an orphan push writer).
function arrPushOneFacts(fid, block, refName, strValue, tag) {
  const idBase = `op.${tag}`;
  return [
    ...strLiteralOp(`${idBase}.lit`, fid, block, strValue),
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.call`, function: fid, block, opKind: "call", callee: `${refName}.current.push`, memberName: "push", receiver: `${idBase}.cur`, arguments: [`${idBase}.lit`] },
  ];
}

// `.current.splice(0)` — drain-all (isArrDrainCall, mech17 r1's ChessPage.tsx:828
// flushQueuedVoiceIceCandidates shape). Binds the drained snapshot to `localName`.
function arrDrainFacts(fid, block, refName, localName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.data", id: `${idBase}.zero`, dataKind: "number", value: 0 },
    { kind: "csg.op", id: `${idBase}.zerolit`, function: fid, block, opKind: "literal", data: `${idBase}.zero`, literalKind: "number" },
    { kind: "csg.op", id: `${idBase}.call`, function: fid, block, opKind: "call", callee: `${refName}.current.splice`, memberName: "splice", receiver: `${idBase}.cur`, arguments: [`${idBase}.zerolit`] },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "local_write", name: localName, value: `${idBase}.call` },
  ];
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

// ---------------------------------------------------------------------------
// 1. scalar family: a scalar box-ref whose ONLY `.current =` write lives in an orphan (unreachable)
// function is now excluded at admission — never reaches scalarBoxRefs, falls to fv-unknown, same
// honest-failure shape every other unrecognized ref shape already uses.
await check("scalar family: orphan-only write is excluded (fv-unknown), never silently admitted with dead write code", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("scalarOrphanRef", "MutableRefObject<string | null>"),
    orphanFn("fn.orphanScalarWriter"),
    ...scalarStrWriteFacts("fn.orphanScalarWriter", "block.orphan", "scalarOrphanRef", "unreachable-value", "osw1"),
    ...handlerBindingFacts("readScalarOrphan", "fn.readScalarOrphan"),
    ...returnReadFacts("fn.readScalarOrphan", "block.rso", "scalarOrphanRef", "rso1"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("readScalarOrphan")]);
  assert.equal(cht.count, 0, "the orphaned-write scalar ref must not compile");
  assert.equal(cht.skips.length, 1);
  assert.match(cht.skips[0].reason, /^fv-unknown:scalarOrphanRef$/, JSON.stringify(cht.skips));
});

// ---------------------------------------------------------------------------
// 2. scalar family control: the SAME shape, but the write lives inside the reading handler itself
// (reachable by construction) — compiles exactly as before mech19 r1 (zero regression for the
// overwhelmingly common real shape: a handler that both writes and reads its own box-ref).
await check("scalar family control: a write inside the SAME reachable handler still compiles (zero regression for the common shape)", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("scalarHealthyRef", "MutableRefObject<string | null>"),
    ...handlerBindingFacts("writeScalarHealthy", "fn.writeScalarHealthy"),
    ...scalarStrWriteFacts("fn.writeScalarHealthy", "block.wsh", "scalarHealthyRef", "healthy-value", "wsh1"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("writeScalarHealthy")]);
  assert.equal(cht.count, 1, JSON.stringify(cht.skips));
  assert.deepEqual(cht.skips, []);
  assert.match(cht.code, /__chtRef_scalarHealthyRef/);
});

// ---------------------------------------------------------------------------
// 3. struct family, ★MIXED shape (the real mousePanningRef shape, verdict §4): TWO unreachable
// writes (mirroring mousedown/mousemove-style siblings that never reach the generic compile path)
// PLUS one write reachable from the SAME handler that reads the ref. Must still admit — a ref is
// only excluded when EVERY write is unreachable, never merely because SOME are (per-handler honest
// failure, no collateral punishment of a ref that has at least one genuinely live write path).
await check("struct family MIXED shape (real mousePanningRef pattern): 2 unreachable + 1 reachable write — still admitted, not collaterally excluded", async () => {
  const coreFacts = [
    componentFn(),
    { kind: "csg.type_decl", name: "WebRtcIceConfig", members: [{ name: "relayOnly", type: "boolean" }] },
    ...useRefFacts("mixedRef", "MutableRefObject<WebRtcIceConfig | null>"),
    orphanFn("fn.orphanWriterA"),
    ...nullWriteFacts("fn.orphanWriterA", "block.owa", "mixedRef", "owa1"),
    orphanFn("fn.orphanWriterB"),
    ...nullWriteFacts("fn.orphanWriterB", "block.owb", "mixedRef", "owb1"),
    ...handlerBindingFacts("touchMixedRef", "fn.touchMixedRef"),
    ...nullWriteFacts("fn.touchMixedRef", "block.tmr", "mixedRef", "tmr1"),
    ...returnReadFacts("fn.touchMixedRef", "block.tmr", "mixedRef", "tmr2"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("touchMixedRef")]);
  assert.equal(cht.count, 1, `mixed ref (1 of 3 writes reachable) must still compile: ${JSON.stringify(cht.skips)}`);
  assert.deepEqual(cht.skips, []);
  assert.match(cht.code, /__chtRef_mixedRef/);
});

// ---------------------------------------------------------------------------
// 3b. struct family control: if ALL writes are unreachable (no mixed case, pure orphan — same shape
// as mech18's own updated ★GAP CLOSED test, repeated here for this file's own self-containment)
// the ref is excluded.
await check("struct family: ALL writes unreachable (no reachable write at all) — excluded", async () => {
  const coreFacts = [
    componentFn(),
    { kind: "csg.type_decl", name: "WebRtcIceConfig", members: [{ name: "relayOnly", type: "boolean" }] },
    ...useRefFacts("allOrphanRef", "MutableRefObject<WebRtcIceConfig | null>"),
    orphanFn("fn.orphanWriterC"),
    ...nullWriteFacts("fn.orphanWriterC", "block.owc", "allOrphanRef", "owc1"),
    orphanFn("fn.orphanWriterD"),
    ...nullWriteFacts("fn.orphanWriterD", "block.owd", "allOrphanRef", "owd1"),
    ...handlerBindingFacts("readAllOrphan", "fn.readAllOrphan"),
    ...returnReadFacts("fn.readAllOrphan", "block.rao", "allOrphanRef", "rao1"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("readAllOrphan")]);
  assert.equal(cht.count, 0, JSON.stringify(cht.skips));
  assert.match(cht.skips[0].reason, /^fv-unknown:allOrphanRef$/);
});

// ---------------------------------------------------------------------------
// 4. object family: an orphan-only object-literal write is excluded exactly like scalar/struct
// (proves the safety net is not struct/scalar-specific — every family sharing the same per-op write
// scan gets the same treatment).
await check("object family: orphan-only object-literal write is excluded (fv-unknown)", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("objOrphanRef", "MutableRefObject<any>"),
    orphanFn("fn.orphanObjWriter"),
    ...objLitWriteFacts("fn.orphanObjWriter", "block.oow", "objOrphanRef", "label", "unreachable", "oow1"),
    ...handlerBindingFacts("readObjOrphan", "fn.readObjOrphan"),
    ...returnReadFacts("fn.readObjOrphan", "block.roo", "objOrphanRef", "roo1"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("readObjOrphan")]);
  assert.equal(cht.count, 0, JSON.stringify(cht.skips));
  assert.match(cht.skips[0].reason, /^fv-unknown:objOrphanRef$/);
});

// ---------------------------------------------------------------------------
// 5. object family control: write inside the reachable reading handler itself still compiles.
await check("object family control: a reachable object-literal write still compiles (zero regression)", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("objHealthyRef", "MutableRefObject<any>"),
    ...handlerBindingFacts("writeObjHealthy", "fn.writeObjHealthy"),
    ...objLitWriteFacts("fn.writeObjHealthy", "block.woh", "objHealthyRef", "label", "healthy", "woh1"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("writeObjHealthy")]);
  assert.equal(cht.count, 1, JSON.stringify(cht.skips));
  assert.match(cht.code, /__chtRefP_objHealthyRef/);
});

// ---------------------------------------------------------------------------
// 6. array family: an orphan-only `.current = []` clear-reassign write is excluded exactly like the
// other property_write-based families (RTCIceCandidateInit is a real registered element type —
// mirrors pendingIceCandidatesRef/queuedVoiceIceCandidatesRef's declared element type).
await check("array family: orphan-only clear-reassign write is excluded (fv-unknown)", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("arrOrphanRef", "MutableRefObject<RTCIceCandidateInit[]>"),
    orphanFn("fn.orphanArrWriter"),
    ...arrClearWriteFacts("fn.orphanArrWriter", "block.oaw", "arrOrphanRef", "oaw1"),
    ...handlerBindingFacts("readArrOrphan", "fn.readArrOrphan"),
    ...arrLengthReadFacts("fn.readArrOrphan", "block.rao2", "arrOrphanRef", "rao2"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("readArrOrphan")]);
  assert.equal(cht.count, 0, JSON.stringify(cht.skips));
  assert.match(cht.skips[0].reason, /^fv-unknown:arrOrphanRef$/);
});

// ---------------------------------------------------------------------------
// 6b. array family control: a reachable clear-reassign write (inside the reading handler itself)
// still compiles (zero regression).
await check("array family control: a reachable clear-reassign write still compiles (zero regression)", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("arrHealthyRef", "MutableRefObject<RTCIceCandidateInit[]>"),
    ...handlerBindingFacts("clearArrHealthy", "fn.clearArrHealthy"),
    ...arrClearWriteFacts("fn.clearArrHealthy", "block.cah", "arrHealthyRef", "cah1"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("clearArrHealthy")]);
  assert.equal(cht.count, 1, JSON.stringify(cht.skips));
  assert.match(cht.code, /arrHealthyRef/);
});

// ---------------------------------------------------------------------------
// 7. set family, ★GAP CLOSED (mech19 r2 — this exact shape is what mech19_r1v_b_verdict.md's
// REFUTED verdict named as r1's live gap, mirrored for the set family): `.current.add`/`.current.
// clear` now populate usage.currentWriteCount/hasReachableCurrentWrite (see scene-runtime-smoke-
// source.mjs's mechanism-19-r2 comment, right after `if (isSetCall) usage.setMethodsSeen.add(...)`)
// — an orphan-only `.add(x)` writer is NO LONGER silently admitted just because the ref's `useRef
// (new Set())` initial value happens to be compile-time-constant. This test previously asserted the
// OPPOSITE (r1's actual, now-fixed, behavior) under the name "set family (documented scope limit)";
// the assertion is intentionally flipped here (cht.count 1 -> 0), same three-state-teeth convention
// mech18's own ★KNOWN GAP -> ★GAP CLOSED flip used in mech19 r1.
await check("★GAP CLOSED (mech19 r2): set family orphan-only .add() write is now excluded (fv-unknown), not silently admitted via the constant-initial-value fallback", async () => {
  const newSetOp = { kind: "csg.op", id: "op.new.setUnaffectedRef", function: "fn.component", block: "block.component", opKind: "new", callee: "Set", arguments: [] };
  const coreFacts = [
    componentFn(),
    newSetOp,
    ...useRefFacts("setUnaffectedRef", "MutableRefObject<Set<string>>", "op.new.setUnaffectedRef"),
    orphanFn("fn.orphanSetWriter"),
    ...setMethodCallFacts("fn.orphanSetWriter", "block.osw", "setUnaffectedRef", "add", ["x"], "osw1"),
    ...handlerBindingFacts("readSetUnaffected", "fn.readSetUnaffected"),
    ...setMethodCallFacts("fn.readSetUnaffected", "block.rsu", "setUnaffectedRef", "has", ["x"], "rsu1"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("readSetUnaffected")]);
  assert.equal(cht.count, 0, `orphan-only .add() write must now exclude the ref: ${JSON.stringify(cht.skips)}`);
  assert.match(cht.skips[0].reason, /^fv-unknown:setUnaffectedRef$/);
});

// ---------------------------------------------------------------------------
// 7b. set-add family control: a reachable `.add(x)` call (inside the SAME handler that binds the
// JSX event) still admits — zero regression for the common shape (mirrors every other family's own
// "control" pairing: 2/2b/5/6b above, and mech11's own pre-existing positive test which covers the
// identical real-production shape from a different angle).
await check("set-add family control: a reachable .add(x) call still compiles (zero regression)", async () => {
  const newSetOp = { kind: "csg.op", id: "op.new.setAddHealthyRef", function: "fn.component", block: "block.component", opKind: "new", callee: "Set", arguments: [] };
  const coreFacts = [
    componentFn(),
    newSetOp,
    ...useRefFacts("setAddHealthyRef", "MutableRefObject<Set<string>>", "op.new.setAddHealthyRef"),
    ...handlerBindingFacts("writeSetAddHealthy", "fn.writeSetAddHealthy"),
    ...setMethodCallFacts("fn.writeSetAddHealthy", "block.wsah", "setAddHealthyRef", "add", ["x"], "wsah1"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("writeSetAddHealthy")]);
  assert.equal(cht.count, 1, JSON.stringify(cht.skips));
  assert.deepEqual(cht.skips, []);
});

// ---------------------------------------------------------------------------
// 8. set-clear family, same ★GAP CLOSED shape as test 7 but for `.clear()` (argc===0, the OTHER
// set-family CALL-type write mech19 r2 wires in) — an orphan-only `.clear()` writer is excluded.
await check("set-clear family: orphan-only .clear() write is excluded (fv-unknown)", async () => {
  const newSetOp = { kind: "csg.op", id: "op.new.setClearOrphanRef", function: "fn.component", block: "block.component", opKind: "new", callee: "Set", arguments: [] };
  const coreFacts = [
    componentFn(),
    newSetOp,
    ...useRefFacts("setClearOrphanRef", "MutableRefObject<Set<string>>", "op.new.setClearOrphanRef"),
    orphanFn("fn.orphanSetClearWriter"),
    ...setMethodCallFacts("fn.orphanSetClearWriter", "block.oscw", "setClearOrphanRef", "clear", [], "oscw1"),
    ...handlerBindingFacts("readSetClearOrphan", "fn.readSetClearOrphan"),
    ...setMethodCallFacts("fn.readSetClearOrphan", "block.rsco", "setClearOrphanRef", "has", ["x"], "rsco1"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("readSetClearOrphan")]);
  assert.equal(cht.count, 0, JSON.stringify(cht.skips));
  assert.match(cht.skips[0].reason, /^fv-unknown:setClearOrphanRef$/);
});

// ---------------------------------------------------------------------------
// 8b. set-clear family control: a reachable `.clear()` call still admits.
await check("set-clear family control: a reachable .clear() call still compiles (zero regression)", async () => {
  const newSetOp = { kind: "csg.op", id: "op.new.setClearHealthyRef", function: "fn.component", block: "block.component", opKind: "new", callee: "Set", arguments: [] };
  const coreFacts = [
    componentFn(),
    newSetOp,
    ...useRefFacts("setClearHealthyRef", "MutableRefObject<Set<string>>", "op.new.setClearHealthyRef"),
    ...handlerBindingFacts("writeSetClearHealthy", "fn.writeSetClearHealthy"),
    ...setMethodCallFacts("fn.writeSetClearHealthy", "block.wsch", "setClearHealthyRef", "clear", [], "wsch1"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("writeSetClearHealthy")]);
  assert.equal(cht.count, 1, JSON.stringify(cht.skips));
  assert.deepEqual(cht.skips, []);
});

// ---------------------------------------------------------------------------
// 9. array-push (spread-append, isArrPushCall) family: orphan-only write excluded — the CALL-type
// write mirror of test 6 (which only covered the `.current = []` clear-reassign ASSIGNMENT shape;
// mech19_r1v_b_verdict.md's core finding is that r1's test 6 never exercised this CALL-type shape
// at all).
await check("array-push (spread) family: orphan-only push(...xs) write is excluded (fv-unknown)", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("arrPushSpreadOrphanRef", "MutableRefObject<RTCIceCandidateInit[]>"),
    orphanFn("fn.orphanArrPushSpreadWriter"),
    ...arrPushSpreadFacts("fn.orphanArrPushSpreadWriter", "block.oapsw", "arrPushSpreadOrphanRef", "candidateBatch", "oapsw1"),
    ...handlerBindingFacts("readArrPushSpreadOrphan", "fn.readArrPushSpreadOrphan"),
    ...arrLengthReadFacts("fn.readArrPushSpreadOrphan", "block.rapso", "arrPushSpreadOrphanRef", "rapso1"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("readArrPushSpreadOrphan")]);
  assert.equal(cht.count, 0, JSON.stringify(cht.skips));
  assert.match(cht.skips[0].reason, /^fv-unknown:arrPushSpreadOrphanRef$/);
});

// ---------------------------------------------------------------------------
// 9b. array-push (spread) family control: a reachable push(...xs) write still compiles.
await check("array-push (spread) family control: a reachable push(...xs) write still compiles (zero regression)", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("arrPushSpreadHealthyRef", "MutableRefObject<RTCIceCandidateInit[]>"),
    ...useRefFacts("arrPushSpreadSrcRef", "MutableRefObject<RTCIceCandidateInit[]>"),
    ...handlerBindingFacts("writeArrPushSpreadHealthy", "fn.writeArrPushSpreadHealthy"),
    ...arrCopyReadFacts("fn.writeArrPushSpreadHealthy", "block.wapsh", "arrPushSpreadSrcRef", "candidateBatch", "wapsh0"),
    ...arrPushSpreadFacts("fn.writeArrPushSpreadHealthy", "block.wapsh", "arrPushSpreadHealthyRef", "candidateBatch", "wapsh1"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("writeArrPushSpreadHealthy")]);
  assert.equal(cht.count, 1, JSON.stringify(cht.skips));
  assert.deepEqual(cht.skips, []);
});

// ---------------------------------------------------------------------------
// 10. array-pushOne family, ★THE REVIEW-B COUNTEREXAMPLE, ABSORBED (isArrPushOneCall — mech17 r1's
// queuedVoiceIceCandidatesRef/pendingIceCandidatesRef real shape, ChessPage.tsx:847): an orphan-only
// `.current.push(x)` write is excluded. mech19_r1v_b_verdict.md's arrPushOnlyOrphanRef repro proved
// r1 silently ADMITTED exactly this shape (cht.count=1, the orphan write's value never lands in the
// compiled read — a real, executable REFUTED-r1 finding, not a hypothetical). This is that same
// repro shape, now locked as a permanent regression test asserting the CORRECT (excluded) outcome.
await check("★review-B counterexample absorbed: array-pushOne orphan-only write (arrPushOnlyOrphanRef shape) is excluded (fv-unknown), not silently admitted", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("arrPushOnlyOrphanRef", "MutableRefObject<RTCIceCandidateInit[]>"),
    orphanFn("fn.orphanArrPushWriter"),
    ...arrPushOneFacts("fn.orphanArrPushWriter", "block.oapw", "arrPushOnlyOrphanRef", "candidate-x", "oapw1"),
    ...handlerBindingFacts("readArrPushOnly", "fn.readArrPushOnly"),
    ...arrLengthReadFacts("fn.readArrPushOnly", "block.rapo", "arrPushOnlyOrphanRef", "rapo1"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("readArrPushOnly")]);
  assert.equal(cht.count, 0, `orphan-only push(x) write must now exclude the ref (was silently admitted pre-mech19-r2): ${JSON.stringify(cht.skips)}`);
  assert.match(cht.skips[0].reason, /^fv-unknown:arrPushOnlyOrphanRef$/);
  assert.ok(!cht.code.includes("orphanArrPushWriter"), "the orphan writer must never surface in the compiled output at all (honest omission, not dead-code inclusion)");
});

// ---------------------------------------------------------------------------
// 10b. array-pushOne family control (the important negative-space check): a REACHABLE push(x) write
// must NOT be excluded by the new write-reachability gate — it must reach admission (arrBoxRefs) and
// only THEN hit the pre-existing, unrelated mech17 r1 transpile-fail wall for pushOne codegen (still
// deliberately unimplemented — no reachable real call site to verify a per-element struct
// constructor against, verdict §4/§5, unchanged by mech19 r2). The skip reason discriminates the two
// layers precisely: `transpile-fail:...` (reached admission, failed later at codegen — correct,
// zero collateral from mech19 r2) vs `fv-unknown:...` (blocked AT admission — would mean mech19 r2's
// reachability gate wrongly punished a reachable write, a real regression this test would catch).
await check("array-pushOne family control: a reachable push(x) write reaches admission (not fv-unknown) — only the pre-existing mech17 r1 codegen defer applies, zero collateral from the r2 reachability gate", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("arrPushOneHealthyRef", "MutableRefObject<RTCIceCandidateInit[]>"),
    ...handlerBindingFacts("writeArrPushOneHealthy", "fn.writeArrPushOneHealthy"),
    ...arrPushOneFacts("fn.writeArrPushOneHealthy", "block.wapoh", "arrPushOneHealthyRef", "candidate-y", "wapoh1"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("writeArrPushOneHealthy")]);
  assert.equal(cht.count, 0, JSON.stringify(cht.skips));
  assert.equal(cht.skips.length, 1);
  assert.match(cht.skips[0].reason, /^transpile-fail:/, `a reachable pushOne write must clear the r2 admission gate and fail ONLY at the pre-existing codegen layer, never at fv-unknown: ${JSON.stringify(cht.skips)}`);
  assert.doesNotMatch(cht.skips[0].reason, /^fv-unknown:/, "must not be blocked at admission — that would mean the r2 reachability gate collaterally excludes a genuinely reachable write");
});

// ---------------------------------------------------------------------------
// 11. array-drain family (isArrDrainCall, `.current.splice(0)`, mech17 r1's ChessPage.tsx:828
// flushQueuedVoiceIceCandidates shape): an orphan-only drain write is excluded — the third and
// final CALL-type array write shape mech19 r2 wires in.
await check("array-drain family: orphan-only splice(0) write is excluded (fv-unknown)", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("arrDrainOrphanRef", "MutableRefObject<RTCIceCandidateInit[]>"),
    orphanFn("fn.orphanArrDrainWriter"),
    ...arrDrainFacts("fn.orphanArrDrainWriter", "block.oadw", "arrDrainOrphanRef", "drainedBatch", "oadw1"),
    ...handlerBindingFacts("readArrDrainOrphan", "fn.readArrDrainOrphan"),
    ...arrLengthReadFacts("fn.readArrDrainOrphan", "block.rado", "arrDrainOrphanRef", "rado1"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("readArrDrainOrphan")]);
  assert.equal(cht.count, 0, JSON.stringify(cht.skips));
  assert.match(cht.skips[0].reason, /^fv-unknown:arrDrainOrphanRef$/);
});

// ---------------------------------------------------------------------------
// 11b. array-drain family control: a reachable splice(0) drain still compiles.
await check("array-drain family control: a reachable splice(0) drain still compiles (zero regression)", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("arrDrainHealthyRef", "MutableRefObject<RTCIceCandidateInit[]>"),
    ...handlerBindingFacts("writeArrDrainHealthy", "fn.writeArrDrainHealthy"),
    ...arrDrainFacts("fn.writeArrDrainHealthy", "block.wadh", "arrDrainHealthyRef", "drainedBatch2", "wadh1"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("writeArrDrainHealthy")]);
  assert.equal(cht.count, 1, JSON.stringify(cht.skips));
  assert.deepEqual(cht.skips, []);
});

// ---------------------------------------------------------------------------
// 12. set family, fallback still has teeth: when the zero-write-points fallback genuinely applies
// (a set ref using ONLY `.has(x)`, never add/clear anywhere — currentWriteCount stays structurally
// 0, mech19 r2 does not change this path at all) AND the useRef(...) initial value is NOT compile-
// time-constant (a variable, not a literal/no-arg-new/empty-array), the ref IS excluded — proves
// refInitialValueIsConstant's fail-closed default (mechanism 16 r3 cross-component-collision
// precedent) actually gates something, this isn't a dead branch.
await check("set family: non-constant useRef(...) initial value IS excluded when the ref genuinely has zero write call sites (has-only usage)", async () => {
  const coreFacts = [
    componentFn(),
    { kind: "csg.op", id: "op.localwrite.someExternalSet", function: "fn.component", block: "block.component", opKind: "local_write", name: "someExternalSet", value: "op.new.setUnaffectedRef2" },
    { kind: "csg.op", id: "op.new.setUnaffectedRef2", function: "fn.component", block: "block.component", opKind: "new", callee: "Set", arguments: [] },
    { kind: "csg.op", id: "op.identifier.someExternalSet", function: "fn.component", block: "block.component", opKind: "identifier", name: "someExternalSet" },
    ...useRefFacts("setNonConstRef", "MutableRefObject<Set<string>>", "op.identifier.someExternalSet"),
    ...handlerBindingFacts("readSetNonConst", "fn.readSetNonConst"),
    ...setMethodCallFacts("fn.readSetNonConst", "block.rsnc", "setNonConstRef", "has", ["x"], "rsnc1"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("readSetNonConst")]);
  assert.equal(cht.count, 0, `non-constant initial value + zero measurable write points must exclude: ${JSON.stringify(cht.skips)}`);
  assert.match(cht.skips[0].reason, /^fv-unknown:setNonConstRef$/);
});

// ---------------------------------------------------------------------------
// 13. set family, `.current.delete(x)` — the ONE remaining CALL-type mutation shape mech19 r2
// deliberately does NOT add write-tracking for, because it needs none: `delete` was never in
// isSetCall (pre-existing, mechanism 11's own comment names it as unmodeled alongside `.forEach`),
// so it fails setOk closed and the ref never reaches setBoxRefs admission at all — regardless of
// whether the delete call site is reachable or orphaned. Locked here so this is a tested fact, not
// an unverified claim: a `.delete(x)` call excludes the ref EVEN WHEN it's the only mutation and
// it's called from the very handler doing the reading (the most favorable possible reachability).
await check("set family: .current.delete(x) remains unmodeled and excludes the ref even when reachable (no write-tracking branch needed — already fails setOk closed)", async () => {
  const newSetOp = { kind: "csg.op", id: "op.new.setDeleteRef", function: "fn.component", block: "block.component", opKind: "new", callee: "Set", arguments: [] };
  const coreFacts = [
    componentFn(),
    newSetOp,
    ...useRefFacts("setDeleteRef", "MutableRefObject<Set<string>>", "op.new.setDeleteRef"),
    ...handlerBindingFacts("writeSetDelete", "fn.writeSetDelete"),
    ...setMethodCallFacts("fn.writeSetDelete", "block.wsd", "setDeleteRef", "delete", ["x"], "wsd1"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, [eventHandlerFact("writeSetDelete")]);
  assert.equal(cht.count, 0, `.delete(x) must still exclude the ref (unmodeled call, fails setOk closed): ${JSON.stringify(cht.skips)}`);
  assert.match(cht.skips[0].reason, /^fv-unknown:setDeleteRef$/);
});

process.stdout.write(`PASS (${passed}/${passed})\n`);
