// scene-runtime-smoke-source.mech16.test.mjs
//
// 离线单测: mechanism 16 (React useRef native-scalar box-ref, declaration-driven fallback —
// ChessPage.tsx voiceIceFlushTimerRef/callSetupTimerRef/callClockTimerRef family) — hand-authored
// synthetic CsgFact fixtures, same convention as scene-runtime-smoke-source.mech13/14/15.test.mjs
// (import the target .mjs's exported pure entry point, feed it a minimal fixture, assert on the
// real return value — no mocking of the mechanism itself).
//
// Op-shape provenance (verified against the REAL ts-csg extractor output on UniMaker's own
// ChessPage.tsx via `unimaker-one-click.mjs --stop-after materialize` during the mech16 recon —
// see mech16_verdict.md §2's file:line table — not a standalone fixture guess):
//   - `if (voiceIceFlushTimerRef.current) { window.clearTimeout(voiceIceFlushTimerRef.current);
//     voiceIceFlushTimerRef.current = null; }` (clearQueuedVoiceIceCandidates, 663-665; same shape
//     for clearVoiceTimers's callSetupTimerRef 639-641 and callClockTimerRef 643-645, the LATTER
//     using `window.clearInterval` instead) — the shape actually reached from handleClose.
//   - `voiceIceFlushTimerRef.current = window.setTimeout(() => {...}, 40)`
//     (queueOutgoingVoiceIceCandidate 848-851; same call-op-RHS write shape for callSetupTimerRef's
//     useEffect 1226 and callClockTimerRef's startVoiceClock 657, the LATTER using
//     `window.setInterval`) — NOT reachable from handleClose, must keep failing honestly. In
//     practice this fails during emitCall's own eager argument evaluation (`args =
//     argIds.map(emitExpr)`, csg-cheng-transpiler.ts, runs BEFORE any callee-specific dispatch):
//     the arrow-closure callback is a `function_value` op with no general expression codegen, so
//     the failure surfaces as `unsupported expression op 'function_value'` rather than reaching the
//     (also-honest) `unsupported callee 'window.setTimeout'` fallback — `window.setTimeout`/
//     `setInterval` are deliberately NOT registered in CHT_HOST_BRIDGES either way (mech16_verdict.md
//     §4(a)). Both are real, non-fabricated compile failures; the tests below assert on the
//     property that actually matters (never `fv-unknown`), not the specific message text.
//
// Usage: node scripts/scene-runtime-smoke-source.mech16.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

function componentFn() {
  return { kind: "csg.function", id: "fn.component", name: "ChessPageTest", parameters: [], returnType: "void" };
}

// `const <refName> = useRef<T | null>(null)` — declaredTypeText feeds refDeclaredNullableType
// (mechanism 14 plumbing, reused verbatim here — mechanism 16 does not add a new useRef-detection
// path, only a new CONSUMER of the already-recorded declared type).
function useRefFacts(refName, ordinalBase, declaredTypeText = "number") {
  return [
    { kind: "csg.op", id: `op.useRef.call.${refName}`, function: "fn.component", block: "block.component", opKind: "call", ordinal: ordinalBase, callee: "useRef", arguments: [], returnType: `MutableRefObject<${declaredTypeText} | null>` },
    { kind: "csg.op", id: `op.useRef.write.${refName}`, function: "fn.component", block: "block.component", opKind: "local_write", ordinal: ordinalBase + 1, name: refName, value: `op.useRef.call.${refName}` },
  ];
}

// r2: SAME ref name, DIFFERENT op ids (`uniqueTag` disambiguates the id, `refName` stays shared on
// the `local_write`'s `name` field only) — this is what TWO REAL useRef() call sites in TWO
// DIFFERENT component render functions actually look like in real ts-csg extractor output (every
// AST node gets its own unique id regardless of the variable name chosen). `useRefFacts` above
// reuses `refName` verbatim inside the id string, which happens to be safe for every single-
// declaration fixture above but would silently ALIAS two declarations of the same name onto the
// SAME `opsById` entry (last `.set()` wins at the id-keyed Map itself, upstream of and independent
// from refDeclaredNullableType's own name-keyed collision) — that would prove nothing about the
// mechanism under test here, so the collision checks below (7-9) use this helper instead.
function useRefFactsAt(refName, uniqueTag, ordinalBase, declaredTypeText = "number") {
  return [
    { kind: "csg.op", id: `op.useRef.call.${uniqueTag}`, function: "fn.component", block: "block.component", opKind: "call", ordinal: ordinalBase, callee: "useRef", arguments: [], returnType: `MutableRefObject<${declaredTypeText} | null>` },
    { kind: "csg.op", id: `op.useRef.write.${uniqueTag}`, function: "fn.component", block: "block.component", opKind: "local_write", ordinal: ordinalBase + 1, name: refName, value: `op.useRef.call.${uniqueTag}` },
  ];
}

function handlerBindingFacts(handlerName, targetFid, ordinalBase) {
  return [
    { kind: "csg.op", id: `op.fnvalue.${handlerName}`, function: "fn.component", block: "block.component", opKind: "function_value", ordinal: ordinalBase, targetFunction: targetFid },
    { kind: "csg.op", id: `op.localwrite.${handlerName}`, function: "fn.component", block: "block.component", opKind: "local_write", ordinal: ordinalBase + 1, name: handlerName, value: `op.fnvalue.${handlerName}` },
    { kind: "csg.function", id: targetFid, name: "<anonymous>", parameters: [], returnType: "void" },
  ];
}

function eventHandlerFact(handlerName) {
  return { kind: "csg.web.scene.event_handler", effect: `invoke:${handlerName}`, routeIndex: 0, nodeId: 0 };
}

// `if (<refName>.current) { <thenBlock> }` (bare read as a branch condition — reused verbatim from
// mech13's own fixture, same op shape).
function ifReadFacts(fid, block, refName, thenBlock, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.branch`, function: fid, block, opKind: "branch_if", condition: `${idBase}.cur`, thenBlock },
  ];
}

// `<calleeName>(<refName>.current)` — bare read passed BY VALUE as a call argument (the
// `window.clearTimeout(x.current)`/`window.clearInterval(x.current)` shape — reused verbatim from
// mech13's own fixture, same op shape mechanism 13 already proved is NOT positionally misread as a
// chained call).
function bareReadCallArgFacts(fid, block, refName, calleeName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.call`, function: fid, block, opKind: "call", callee: calleeName, arguments: [`${idBase}.cur`] },
  ];
}

// `<refName>.current = null` (reused verbatim from mech13's own fixture).
function nullWriteFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.data", id: `${idBase}.null`, dataKind: "null", value: null },
    { kind: "csg.op", id: `${idBase}.nulllit`, function: fid, block, opKind: "literal", data: `${idBase}.null` },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.nulllit` },
  ];
}

// `<refName>.current = <calleeName>(<cbTargetFid>, <msLiteral>)` — the SET write shape (mechanism
// 16's fallback types this ref write as int64/str/bool via the ref's OWN declared type, same as
// every other write shape — but the RHS call itself still has no codegen: `window.setTimeout`/
// `window.setInterval` are deliberately NOT CHT_HOST_BRIDGES entries, mech16_verdict.md §4(c), so
// the containing handler must still fail honestly). `cbTargetFid` names a real (empty-body)
// function fact so the function_value arg resolves to something real, not a dangling id.
function callValueWriteFacts(fid, block, refName, calleeName, cbTargetFid, ms, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.cb`, function: fid, block, opKind: "function_value", targetFunction: cbTargetFid },
    { kind: "csg.function", id: cbTargetFid, name: "<anonymous>", parameters: [], returnType: "void" },
    { kind: "csg.data", id: `${idBase}.msdata`, dataKind: "number", value: ms },
    { kind: "csg.op", id: `${idBase}.mslit`, function: fid, block, opKind: "literal", data: `${idBase}.msdata` },
    { kind: "csg.op", id: `${idBase}.call`, function: fid, block, opKind: "call", callee: calleeName, arguments: [`${idBase}.cb`, `${idBase}.mslit`] },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.call` },
  ];
}

// `return <refName>.current;` (bare read as a return value — reused verbatim from mech13's fixture,
// used only by test 6's synthetic boolean-ref generality check below).
function returnReadFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.ret`, function: fid, block, opKind: "return", value: `${idBase}.cur` },
  ];
}

// `useRef<T[]>([])` (mechanism 12 array-of-struct box-ref) at a given OWNING function/tag, same
// per-declaration-own-id convention as useRefFactsAt above (models two REAL, DIFFERENT components'
// useRef() call sites, sharing only the ref NAME) — used only by the r3 arrBoxRefs collision checks
// below (10-11), which need each declaration attributed to its OWN component function, unlike every
// scalar/nullable check above which shares a single componentFn().
function arrUseRefFactsAt(refName, fnId, uniqueTag, ordinalBase, elemTypeText) {
  return [
    { kind: "csg.op", id: `op.arruseRef.call.${uniqueTag}`, function: fnId, block: `block.${fnId}`, opKind: "call", ordinal: ordinalBase, callee: "useRef", arguments: [], returnType: `MutableRefObject<${elemTypeText}[]>` },
    { kind: "csg.op", id: `op.arruseRef.write.${uniqueTag}`, function: fnId, block: `block.${fnId}`, opKind: "local_write", ordinal: ordinalBase + 1, name: refName, value: `op.arruseRef.call.${uniqueTag}` },
  ];
}
// `<refName>.current = []` (mechanism 12's whitelisted array clear-reassign shape) — common to EVERY
// array-of-struct ref regardless of element type, so it carries zero information about which side's
// declared element type a handler "meant"; reused verbatim from
// adv-mech16r2-arrelem-collision-probe.mjs (mech16_r2v_b_m16r2_verdict.md's own repro fixture).
function arrClearFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.arrlit`, function: fid, block, opKind: "array_literal", elementCount: 0, elements: [], spreadFlags: [] },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.arrlit` },
  ];
}

// `const [<stateName>, <setterName>] = useState<T>(...)` at a given OWNING function/tag, same per-
// declaration-own-id convention as useRefFactsAt/arrUseRefFactsAt above (models two REAL, DIFFERENT
// components' useState() call sites, sharing only the destructured state NAME) — used only by the
// r4 stateType collision checks below (12-13). `tsType` is the TS-checker-resolved type text (e.g.
// "number"/"string"), matching real ts-csg extractor output for a useState call's `returnType`.
function useStateFactsAt(stateName, setterName, fnId, uniqueTag, ordinalBase, tsType) {
  const callId = `op.useState.call.${uniqueTag}`;
  return [
    { kind: "csg.op", id: callId, function: fnId, block: `block.${fnId}`, opKind: "call", ordinal: ordinalBase, callee: "useState",
      returnType: `[${tsType}, React.Dispatch<React.SetStateAction<${tsType}>>]`, arguments: [] },
    { kind: "csg.op", id: `${callId}.value`, function: fnId, block: `block.${fnId}`, opKind: "binding_extract", ordinal: ordinalBase + 1, source: callId, path: [{ index: 0 }], name: stateName },
    { kind: "csg.op", id: `${callId}.setter`, function: fnId, block: `block.${fnId}`, opKind: "binding_extract", ordinal: ordinalBase + 2, source: callId, path: [{ index: 1 }], name: setterName },
  ];
}

// `return <name>;` — bare free-var IDENTIFIER read as a return value (distinct from returnReadFacts
// above, which reads `<refName>.current`; a useState value is a plain local, never `.current`).
function returnFreeVarFacts(fid, block, name, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.id`, function: fid, block, opKind: "identifier", name },
    { kind: "csg.op", id: `${idBase}.ret`, function: fid, block, opKind: "return", value: `${idBase}.id` },
  ];
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

// ---------------------------------------------------------------------------
// 1. Positive + multi-ref isolation: all three ChessPage.tsx family refs (voiceIceFlushTimerRef/
//    callSetupTimerRef via window.clearTimeout, callClockTimerRef via window.clearInterval) get
//    their own independent KV-synced int64 slot var and their real `if (x.current) { clear...;
//    x.current = null }` shape (the one actually reached from handleClose) compiles to the correct
//    bridge call — mirrors mech13/14/15's own "multi-ref isolation" test pattern.
await check("positive: voiceIceFlushTimerRef/callSetupTimerRef (clearTimeout) + callClockTimerRef (clearInterval) each classify to an independent int64 slot and compile the real handleClose-reached clear-shape", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("voiceIceFlushTimerRef", 1),
    ...useRefFacts("callSetupTimerRef", 10),
    ...useRefFacts("callClockTimerRef", 20),
    ...handlerBindingFacts("clearQueuedVoiceIceCandidates", "fn.clearIce", 30),
    ...ifReadFacts("fn.clearIce", "block.clearIce", "voiceIceFlushTimerRef", "block.clearIce.then", "ci1"),
    ...bareReadCallArgFacts("fn.clearIce", "block.clearIce.then", "voiceIceFlushTimerRef", "window.clearTimeout", "ci2"),
    ...nullWriteFacts("fn.clearIce", "block.clearIce.then", "voiceIceFlushTimerRef", "ci3"),
    ...handlerBindingFacts("clearVoiceTimers", "fn.clearTimers", 40),
    ...ifReadFacts("fn.clearTimers", "block.clearTimers", "callSetupTimerRef", "block.clearTimers.then1", "ct1"),
    ...bareReadCallArgFacts("fn.clearTimers", "block.clearTimers.then1", "callSetupTimerRef", "window.clearTimeout", "ct2"),
    ...nullWriteFacts("fn.clearTimers", "block.clearTimers.then1", "callSetupTimerRef", "ct3"),
    ...ifReadFacts("fn.clearTimers", "block.clearTimers", "callClockTimerRef", "block.clearTimers.then2", "ct4"),
    ...bareReadCallArgFacts("fn.clearTimers", "block.clearTimers.then2", "callClockTimerRef", "window.clearInterval", "ct5"),
    ...nullWriteFacts("fn.clearTimers", "block.clearTimers.then2", "callClockTimerRef", "ct6"),
  ];
  const sceneFacts = [eventHandlerFact("clearQueuedVoiceIceCandidates"), eventHandlerFact("clearVoiceTimers")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 2);
  assert.match(cht.code, /var __chtRef_voiceIceFlushTimerRef: int64/, "voiceIceFlushTimerRef must get its own int64 slot var");
  assert.match(cht.code, /var __chtRef_callSetupTimerRef: int64/, "callSetupTimerRef must get its own int64 slot var");
  assert.match(cht.code, /var __chtRef_callClockTimerRef: int64/, "callClockTimerRef must get its own int64 slot var");
  assert.match(cht.code, /chengHostClearTimeout\(__chtRef_voiceIceFlushTimerRef\)/, "voiceIceFlushTimerRef's clear-shape must fold to the chengHostClearTimeout bridge over its own slot var");
  assert.match(cht.code, /chengHostClearTimeout\(__chtRef_callSetupTimerRef\)/, "callSetupTimerRef's clear-shape must fold to the chengHostClearTimeout bridge over its own slot var");
  assert.match(cht.code, /chengHostClearInterval\(__chtRef_callClockTimerRef\)/, "callClockTimerRef's clear-shape must fold to the chengHostClearInterval bridge over its own slot var");
  assert.match(cht.code, /@importc\("cheng_host_clear_timeout"\)/, "chengHostClearTimeout's own @importc contract head must be pulled into the generated program");
  assert.match(cht.code, /@importc\("cheng_host_clear_interval"\)/, "chengHostClearInterval's own @importc contract head must be pulled into the generated program");
});

// ---------------------------------------------------------------------------
// 2. Honest-negative (voiceIceFlushTimerRef): the SET write shape
//    (`voiceIceFlushTimerRef.current = window.setTimeout(() => {...}, 40)`, queueOutgoingVoiceIceCandidate
//    848-851 — NOT reachable from handleClose) must still fail to compile, and for the RIGHT reason
//    (`unsupported callee 'window.setTimeout'`, never `fv-unknown` — proving the fallback typed the
//    WRITE but did not fabricate codegen for the unmodeled call-op value). Crucially, the real
//    handleClose-reached clear-shape handler for the SAME ref, present in the SAME file-wide scan,
//    must STILL compile — proving the SET-write shape's presence does not poison classification.
await check("honest-negative: voiceIceFlushTimerRef's SET write (window.setTimeout RHS) fails with a real codegen error, never fv-unknown, and does not poison the clear-shape handler on the same ref", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("voiceIceFlushTimerRef", 1),
    ...handlerBindingFacts("clearQueuedVoiceIceCandidates", "fn.clearIce", 10),
    ...ifReadFacts("fn.clearIce", "block.clearIce", "voiceIceFlushTimerRef", "block.clearIce.then", "ci1"),
    ...bareReadCallArgFacts("fn.clearIce", "block.clearIce.then", "voiceIceFlushTimerRef", "window.clearTimeout", "ci2"),
    ...nullWriteFacts("fn.clearIce", "block.clearIce.then", "voiceIceFlushTimerRef", "ci3"),
    ...handlerBindingFacts("queueOutgoingVoiceIceCandidate", "fn.queueIce", 20),
    ...callValueWriteFacts("fn.queueIce", "block.queueIce", "voiceIceFlushTimerRef", "window.setTimeout", "fn.queueIce.cb", 40, "qi1"),
  ];
  const sceneFacts = [eventHandlerFact("clearQueuedVoiceIceCandidates"), eventHandlerFact("queueOutgoingVoiceIceCandidate")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const clearSkip = cht.skips.find((s) => s.name === "clearQueuedVoiceIceCandidates");
  assert.equal(clearSkip, undefined, `the real handleClose-reached clear-shape handler must still compile despite the SET-write shape existing elsewhere in the file: ${JSON.stringify(cht.skips)}`);
  assert.match(cht.code, /chengHostClearTimeout\(__chtRef_voiceIceFlushTimerRef\)/);
  const queueSkip = cht.skips.find((s) => s.name === "queueOutgoingVoiceIceCandidate");
  assert.ok(queueSkip, "the SET-write handler must NOT compile (no codegen exists for window.setTimeout)");
  assert.doesNotMatch(queueSkip.reason, /fv-unknown/, `must fail for a codegen reason, not a classification (fv-unknown) reason: ${JSON.stringify(queueSkip)}`);
  assert.match(queueSkip.reason, /unsupported expression op 'function_value'|unsupported callee 'window\.setTimeout'/, `must fail with a real codegen-fail reason (arg eval or callee): ${JSON.stringify(queueSkip)}`);
});

// ---------------------------------------------------------------------------
// 3. Honest-negative (callClockTimerRef): same shape as check 2 but for the `window.setInterval`
//    SET write (startVoiceClock 657) — proves the honesty guarantee is not special-cased to
//    `setTimeout` alone.
await check("honest-negative: callClockTimerRef's SET write (window.setInterval RHS) fails with a real codegen error, never fv-unknown, and does not poison the clear-shape handler on the same ref", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("callClockTimerRef", 1),
    ...handlerBindingFacts("clearVoiceTimers", "fn.clearTimers", 10),
    ...ifReadFacts("fn.clearTimers", "block.clearTimers", "callClockTimerRef", "block.clearTimers.then", "ct1"),
    ...bareReadCallArgFacts("fn.clearTimers", "block.clearTimers.then", "callClockTimerRef", "window.clearInterval", "ct2"),
    ...nullWriteFacts("fn.clearTimers", "block.clearTimers.then", "callClockTimerRef", "ct3"),
    ...handlerBindingFacts("startVoiceClock", "fn.startClock", 20),
    ...callValueWriteFacts("fn.startClock", "block.startClock", "callClockTimerRef", "window.setInterval", "fn.startClock.cb", 1000, "sc1"),
  ];
  const sceneFacts = [eventHandlerFact("clearVoiceTimers"), eventHandlerFact("startVoiceClock")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const clearSkip = cht.skips.find((s) => s.name === "clearVoiceTimers");
  assert.equal(clearSkip, undefined, `the real handleClose-reached clear-shape handler must still compile: ${JSON.stringify(cht.skips)}`);
  assert.match(cht.code, /chengHostClearInterval\(__chtRef_callClockTimerRef\)/);
  const startSkip = cht.skips.find((s) => s.name === "startVoiceClock");
  assert.ok(startSkip, "the SET-write handler must NOT compile (no codegen exists for window.setInterval)");
  assert.doesNotMatch(startSkip.reason, /fv-unknown/, `must fail for a codegen reason, not a classification (fv-unknown) reason: ${JSON.stringify(startSkip)}`);
  assert.match(startSkip.reason, /unsupported expression op 'function_value'|unsupported callee 'window\.setInterval'/, `must fail with a real codegen-fail reason (arg eval or callee): ${JSON.stringify(startSkip)}`);
});

// ---------------------------------------------------------------------------
// 4. Regression lock: an UNREGISTERED opaque type (e.g. a hypothetical `useRef<RTCDataChannel |
//    null>` — not a native TS scalar, not in CHT_HANDLE_REF_TYPES/CHT_STRUCT_REF_TYPES) with the
//    SAME "all writes unmodeled" shape must NOT be swept into scalarBoxRefs by the fallback — the
//    fallback is gated on CHT_NATIVE_SCALAR_TYPES membership, never a blanket "any declared type"
//    catch-all. Proves the fallback cannot fabricate a slot for an opaque handle type it was never
//    told about.
await check("regression: an unregistered opaque declared type (RTCDataChannel) is NOT swept into scalarBoxRefs by the fallback, stays fv-unknown", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("dataChannelRef", 1, "RTCDataChannel"),
    ...handlerBindingFacts("touchDataChannel", "fn.touchDC", 10),
    ...callValueWriteFacts("fn.touchDC", "block.touchDC", "dataChannelRef", "window.setTimeout", "fn.touchDC.cb", 40, "dc1"),
  ];
  const sceneFacts = [eventHandlerFact("touchDataChannel")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const skip = cht.skips.find((s) => s.name === "touchDataChannel");
  assert.ok(skip, "an unregistered opaque declared type must not compile via the fallback");
  assert.doesNotMatch(cht.code || "", /__chtRef_dataChannelRef/, "must never declare a slot var for an unregistered declared type");
});

// ---------------------------------------------------------------------------
// 5. Priority-order regression: an EXISTING branch (mechanism 13's identifier/CHT_HANDLE_REF_TYPES
//    match) must still win when it applies — the fallback is appended LAST and must never override
//    an already-resolved scalarType. Reuses mech13's own MediaStream shape (typed-identifier write)
//    on a ref whose declared type is the REGISTERED HANDLE type, not a native scalar — if the
//    fallback ever fired first (or a native-scalar mapping accidentally matched "MediaStream"), this
//    would either fail to compile or emit the wrong slot type; asserting the existing int64-via-
//    CHT_HANDLE_REF_TYPES codegen still fires proves no priority regression.
await check("regression: existing CHT_HANDLE_REF_TYPES (mechanism 13) branch still wins over the fallback for a registered opaque handle type", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("dataChannelRef2", 1, "MediaStream"),
    ...handlerBindingFacts("typedRoundTrip", "fn.trip", 10),
    { kind: "csg.data", id: "op.tr.zero", dataKind: "number", value: 0 },
    { kind: "csg.op", id: "op.tr.zerolit", function: "fn.trip", block: "block.trip", opKind: "literal", data: "op.tr.zero" },
    { kind: "csg.op", id: "op.tr.decl", function: "fn.trip", block: "block.trip", opKind: "local_write", name: "stream", value: "op.tr.zerolit", typeText: "MediaStream", declarationKind: "const" },
    { kind: "csg.op", id: "op.tr.src", function: "fn.trip", block: "block.trip", opKind: "identifier", name: "stream" },
    { kind: "csg.op", id: "op.tr.ref", function: "fn.trip", block: "block.trip", opKind: "identifier", name: "dataChannelRef2" },
    { kind: "csg.op", id: "op.tr.write", function: "fn.trip", block: "block.trip", opKind: "property_write", name: "current", receiver: "op.tr.ref", value: "op.tr.src" },
    ...returnReadFacts("fn.trip", "block.trip", "dataChannelRef2", "tr2"),
  ];
  const sceneFacts = [eventHandlerFact("typedRoundTrip")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile via the existing mechanism-13 branch, unaffected by the new fallback: ${JSON.stringify(cht.skips)}`);
  assert.match(cht.code, /var __chtRef_dataChannelRef2: int64/);
});

// ---------------------------------------------------------------------------
// 6. Generality: the fallback is declared-type-driven, not hardcoded to `number`/int64 — a synthetic
//    `useRef<boolean | null>` ref whose only write is an unmodeled call-op value still classifies
//    (via CHT_NATIVE_SCALAR_TYPES's `"boolean" -> "bool"` entry) and its unrelated bare-read handler
//    compiles to a `bool` slot. Not a ChessPage.tsx shape (ChessPage's own family is all `number`) —
//    included to prove CHT_NATIVE_SCALAR_TYPES's other two entries are not dead code, and to give the
//    three-state verification a narrow surgical target independent of the `number` entry.
await check("generality: the declared-type fallback also covers boolean (CHT_NATIVE_SCALAR_TYPES's 2nd entry), not just number", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("exampleFlagRef", 1, "boolean"),
    ...handlerBindingFacts("setExampleFlag", "fn.setFlag", 10),
    ...callValueWriteFacts("fn.setFlag", "block.setFlag", "exampleFlagRef", "someHostBoolProbe", "fn.setFlag.cb", 0, "sf1"),
    ...handlerBindingFacts("readExampleFlag", "fn.readFlag", 20),
    ...returnReadFacts("fn.readFlag", "block.readFlag", "exampleFlagRef", "rf1"),
  ];
  const sceneFacts = [eventHandlerFact("setExampleFlag"), eventHandlerFact("readExampleFlag")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const readSkip = cht.skips.find((s) => s.name === "readExampleFlag");
  assert.equal(readSkip, undefined, `bare-read handler must compile with a bool slot: ${JSON.stringify(cht.skips)}`);
  assert.match(cht.code, /var __chtRef_exampleFlagRef: bool/, "boolean-declared ref must get a bool slot via the fallback, not int64/str");
  const setSkip = cht.skips.find((s) => s.name === "setExampleFlag");
  assert.ok(setSkip, "the unmodeled call-op write handler must still fail (no codegen for 'someHostBoolProbe')");
  assert.doesNotMatch(setSkip.reason, /fv-unknown/, `must fail for a codegen reason, not classification: ${JSON.stringify(setSkip)}`);
});

// ---------------------------------------------------------------------------
// r2 round (mech16_review_a_m16r1_verdict.md §5, REFUTED — refDeclaredNullableType is a global
// Map keyed by bare ref name only, spanning the WHOLE extracted app with no cross-component scope
// boundary; a real precedent exists — `refreshTimerRef` is `number | null` in
// TradingHooks.ts/TradingPage.tsx but `ReturnType<typeof setTimeout> | null` in NodesPage.tsx).
// Checks 7-9 absorb + correct the review's own ADV-5 probe (its `useRefFacts` helper aliased both
// conflicting declarations onto the SAME op id via `refName`-derived ids — an id COLLISION at the
// `opsById` Map itself, upstream of and unrelated to the name-keyed collision under test — so it
// never actually exercised two live, independently-surviving declarations; `useRefFactsAt` above
// gives each declaration its own id, the way two real different components' useRef() call sites
// would extract, sharing only the ref NAME).
// ---------------------------------------------------------------------------

// 7. ★Collision core (mechanism 16's OWN consumer, scalarTypeOfValueOp's declared-type fallback):
//    two conflicting declarations of `dualNamedRef` ("number" declared first — matches what
//    chessStyleHandler actually needs; "string" declared second, simulating a later-processed
//    ChatPage-style sibling). The handler's ENTIRE write shape (`.current = null`) is only
//    classifiable via the fallback (no literal/binary/unary/identifier branch models a null write) —
//    so this check is a direct, minimal probe of the exact hole ADV-5 found. Must be a real skip
//    (fv-unknown), NEVER a zero-skip compile with any slot type (neither "number"'s int64 NOR
//    "string"'s str) — an ambiguous declaration has no honest single answer, so silently picking
//    EITHER surviving guess is still the same class of defect, not just the specific str-corruption
//    ADV-5 happened to observe.
await check("r2 collision: same-named ref, conflicting declared types (number then string) — mechanism 16's own fallback consumer must go fv-unknown, never silently pick either declaration's type", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFactsAt("dualNamedRef", "dnrNumber", 1, "number"),
    ...handlerBindingFacts("chessStyleHandler", "fn.chessStyle", 10),
    ...ifReadFacts("fn.chessStyle", "block.chessStyle", "dualNamedRef", "block.chessStyle.then", "cs1"),
    ...nullWriteFacts("fn.chessStyle", "block.chessStyle.then", "dualNamedRef", "cs2"),
    ...useRefFactsAt("dualNamedRef", "dnrString", 20, "string"),
  ];
  const sceneFacts = [eventHandlerFact("chessStyleHandler")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const skip = cht.skips.find((s) => s.name === "chessStyleHandler");
  assert.ok(skip, `an ambiguous declared-type ref must fail to compile, never silently resolve to either candidate type: ${JSON.stringify(cht.skips)}`);
  assert.match(skip.reason, /fv-unknown:dualNamedRef/, `must fail with the honest classification reason, not a codegen-fail: ${JSON.stringify(skip)}`);
  assert.doesNotMatch(cht.code || "", /__chtRef_dualNamedRef/, "must never declare a slot var (str OR int64) for an ambiguous ref name");
});

// 8. Regression (ChatPage-same-name-same-type precedent, mech14_impl2_verdict.md's own iceConfigRef
//    shape reused across ChessPage.tsx/ChatPage.tsx/DouDiZhuPage.tsx): TWO declarations of the SAME
//    name that agree on the SAME declared type text must NOT be marked ambiguous — both independent
//    handlers must keep compiling exactly as before this fix, sharing one KV slot (existing
//    contract, unaffected by the collision guard).
await check("r2 regression: same-named ref, SAME declared type across two declarations (ChatPage/ChessPage same-type precedent) must still compile normally, not be swept into ambiguous", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFactsAt("sharedTimerRef", "stA", 1, "number"),
    ...handlerBindingFacts("clearSharedTimerA", "fn.clearSharedA", 10),
    ...ifReadFacts("fn.clearSharedA", "block.clearSharedA", "sharedTimerRef", "block.clearSharedA.then", "sa1"),
    ...bareReadCallArgFacts("fn.clearSharedA", "block.clearSharedA.then", "sharedTimerRef", "window.clearTimeout", "sa2"),
    ...nullWriteFacts("fn.clearSharedA", "block.clearSharedA.then", "sharedTimerRef", "sa3"),
    ...useRefFactsAt("sharedTimerRef", "stB", 20, "number"),
    ...handlerBindingFacts("clearSharedTimerB", "fn.clearSharedB", 30),
    ...ifReadFacts("fn.clearSharedB", "block.clearSharedB", "sharedTimerRef", "block.clearSharedB.then", "sb1"),
    ...bareReadCallArgFacts("fn.clearSharedB", "block.clearSharedB.then", "sharedTimerRef", "window.clearTimeout", "sb2"),
    ...nullWriteFacts("fn.clearSharedB", "block.clearSharedB.then", "sharedTimerRef", "sb3"),
  ];
  const sceneFacts = [eventHandlerFact("clearSharedTimerA"), eventHandlerFact("clearSharedTimerB")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `two same-type declarations of the same ref name must not be treated as ambiguous: ${JSON.stringify(cht.skips)}`);
  assert.match(cht.code, /var __chtRef_sharedTimerRef: int64/, "must still get a single shared int64 slot, same as pre-fix behavior");
  assert.match(cht.code, /chengHostClearTimeout\(__chtRef_sharedTimerRef\)/);
});

// 9. ★Mechanism 14's ORIGINAL consumer (structBoxRefs classification, the FIRST consumer of
//    refDeclaredNullableType — mech16 is only the SECOND) under the same collision: `iceConfigRef`-
//    style ref declared `WebRtcIceConfig | null` (registered in CHT_STRUCT_REF_TYPES) collides with
//    a second, unrelated declared type for the SAME name. Proves the fix is NOT a mech16-only patch
//    (COMMON's explicit "只堵机制16 一侧=打地鼠" warning) — the pre-existing struct box-ref family
//    must ALSO fail closed to fv-unknown under the same ambiguous declaration, sharing the identical
//    single source-of-truth fix (refDeclaredNullableType.delete on conflict), not a second bespoke
//    guard.
await check("r2 collision (mechanism 14 first consumer): same-named ref, conflicting declared types where ONE side is a registered struct type (WebRtcIceConfig) — structBoxRefs classification must also go fv-unknown, not silently classify via either side", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFactsAt("iceConfigRefCollide", "icA", 1, "WebRtcIceConfig"),
    ...handlerBindingFacts("touchIceConfig", "fn.touchIce", 10),
    ...ifReadFacts("fn.touchIce", "block.touchIce", "iceConfigRefCollide", "block.touchIce.then", "ic1"),
    ...nullWriteFacts("fn.touchIce", "block.touchIce.then", "iceConfigRefCollide", "ic2"),
    ...useRefFactsAt("iceConfigRefCollide", "icB", 20, "SomeOtherConflictingIceType"),
  ];
  const sceneFacts = [eventHandlerFact("touchIceConfig")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const skip = cht.skips.find((s) => s.name === "touchIceConfig");
  assert.ok(skip, `mechanism 14's structBoxRefs must not classify an ambiguously-declared ref, even when one side is a registered struct type: ${JSON.stringify(cht.skips)}`);
  assert.match(skip.reason, /fv-unknown:iceConfigRefCollide/, `must fail with the honest classification reason: ${JSON.stringify(skip)}`);
  assert.doesNotMatch(cht.code || "", /__chtRef_iceConfigRefCollide/, "must never declare ANY slot (struct or scalar) for the ambiguous ref name");
});

// ---------------------------------------------------------------------------
// r3 round (mech16_r2v_b_m16r2_verdict.md, independent adversarial review of r2 — REFUTED): r2 fixed
// refDeclaredNullableType's same-name cross-component collision but left its architecturally
// IDENTICAL sibling table, refDeclaredArrayElemType (mechanism 12's arrBoxRefs consumer), completely
// unaddressed — same bare-refName key, same last-write-wins semantics, same "coreFacts flattens
// every component into one shared op graph" root cause. Checks 10-11 below absorb + correct
// adv-mech16r2-arrelem-collision-probe.mjs (the review's own repro, which deliberately asserts the
// BROKEN behavior to make a repeatable pre-fix signal) into a normal PASS-means-correct regression
// pair, mirroring checks 7-8's collision/regression structure for refDeclaredNullableType exactly —
// both tables now go through the same shared registerDeclaredRefType() helper.
// ---------------------------------------------------------------------------

// 10. ★arrBoxRefs collision (mechanism 12 consumer of refDeclaredArrayElemType): two DIFFERENT
//     components each declare a `useRef<T[]>([])` named `collidingRef` — component A (processed
//     FIRST) with an UNREGISTERED element type (`SomeUnrelatedRecord`, no CHT_ARRAY_REF_ELEM_TYPES
//     entry), component B (processed SECOND) with the ONE registered element type
//     (`RTCIceCandidateInit`) — the exact declaration order mech16_r2v_b_m16r2_verdict.md's own
//     repro used (the order the real bug shape needs: an unrelated, undeclared-as-registered ref
//     ends up wired to ANOTHER component's real codec). Component A's own handler only ever touches
//     the ref via the whitelisted clear-reassign shape (`.current = []`), which carries zero
//     per-element-type information. Pre-r3, this silently wired component A's ref to component B's
//     REAL production struct parse/encode codec (WebSceneParseIceCandidateArrayState/
//     WebSceneEncodeIceCandidateArrayState) — zero skip, zero diagnostic, a genuine cross-component
//     type confusion (not a fabricated guess: a real, syntactically valid, already-registered codec
//     borrowed from an unrelated component). Must go fv-unknown, exactly like refDeclaredNullableType's
//     own collision (checks 7/9) — never silently pick either side's element type.
//
//     Three-state note (honest scope boundary): CHT_ARRAY_REF_ELEM_TYPES currently registers exactly
//     ONE element type (RTCIceCandidateInit), so — unlike checks 7/9, which pit two REGISTERED types
//     against each other (`number`/`string`, both valid CHT_NATIVE_SCALAR_TYPES entries; or a
//     registered struct vs. an unregistered one) — this fixture cannot construct "two registered,
//     conflicting array element types" to independently re-prove `.delete()`'s necessity on THIS
//     table with this specific declaration order. That property (marking ambiguous alone is
//     insufficient; the stale first value must also be deleted) is proven once, at the SHARED
//     `registerDeclaredRefType()` helper itself, by checks 7/9 (both go red under the r3 three-state
//     surgical-short-circuit probe) — arrBoxRefs calls the identical function, so the property
//     transfers. What THIS check independently proves is narrower but still real: detection fires at
//     all for refDeclaredArrayElemType specifically (red under full short-circuit — verified via an
//     isolated probe, since this ordering's stale SECOND value is the registered one and would let a
//     no-detection-at-all implementation silently wire it in).
await check("r3 collision (mechanism 12 consumer, arrBoxRefs): same-named ref, conflicting declared array element types across two components (one unregistered, one registered RTCIceCandidateInit) — must go fv-unknown, never silently wire an unrelated component's real struct codec", async () => {
  const coreFacts = [
    componentFn(),
    { kind: "csg.function", id: "fn.componentA", name: "UnrelatedComponentA", parameters: [], returnType: "void" },
    { kind: "csg.function", id: "fn.componentB", name: "ChessPageLike", parameters: [], returnType: "void" },
    ...arrUseRefFactsAt("collidingRef", "fn.componentA", "arrA", 1, "SomeUnrelatedRecord"),
    ...arrUseRefFactsAt("collidingRef", "fn.componentB", "arrB", 3, "RTCIceCandidateInit"),
    ...handlerBindingFacts("clearCollidingRef", "fn.clearHandler", 10),
    ...arrClearFacts("fn.clearHandler", "block.clearHandler", "collidingRef", "clear"),
  ];
  const sceneFacts = [eventHandlerFact("clearCollidingRef")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const skip = cht.skips.find((s) => s.name === "clearCollidingRef");
  assert.ok(skip, `an ambiguous declared array-element-type ref must fail to compile, never silently borrow either side's codec: ${JSON.stringify(cht.skips)}`);
  assert.match(skip.reason, /fv-unknown:collidingRef/, `must fail with the honest classification reason, not a codegen-fail: ${JSON.stringify(skip)}`);
  assert.doesNotMatch(cht.code || "", /WebSceneParseIceCandidateArrayState|WebSceneEncodeIceCandidateArrayState|__chtRef_collidingRef/, "must never wire in ANY component's array codec (nor declare any slot at all) for an ambiguous ref name");
});

// 11. Regression (real precedent — every EXISTING array-of-struct ref in production today,
//     `pendingIceCandidatesRef`, only has ONE declaration): TWO declarations of the SAME name that
//     agree on the SAME declared array element type must NOT be marked ambiguous — the handler must
//     keep compiling exactly as before this fix, wiring the real RTCIceCandidateInit codec.
await check("r3 regression: same-named ref, SAME declared array element type across two declarations must still compile normally via arrBoxRefs, not be swept into ambiguous", async () => {
  const coreFacts = [
    componentFn(),
    { kind: "csg.function", id: "fn.componentA", name: "ComponentA", parameters: [], returnType: "void" },
    { kind: "csg.function", id: "fn.componentB", name: "ComponentB", parameters: [], returnType: "void" },
    ...arrUseRefFactsAt("sharedArrRef", "fn.componentA", "arrA2", 1, "RTCIceCandidateInit"),
    ...arrUseRefFactsAt("sharedArrRef", "fn.componentB", "arrB2", 3, "RTCIceCandidateInit"),
    ...handlerBindingFacts("clearSharedArrRef", "fn.clearHandler2", 10),
    ...arrClearFacts("fn.clearHandler2", "block.clearHandler2", "sharedArrRef", "clear2"),
  ];
  const sceneFacts = [eventHandlerFact("clearSharedArrRef")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `two same-type array-element declarations of the same ref name must not be treated as ambiguous: ${JSON.stringify(cht.skips)}`);
  assert.match(cht.code, /var __chtRef_sharedArrRef: scene\.WebSceneIceCandidateRecord\[\]/, "must still get a single shared array slot, same as pre-fix behavior");
  assert.match(cht.code, /WebSceneParseIceCandidateArrayState/);
  assert.match(cht.code, /WebSceneEncodeIceCandidateArrayState/);
});

// ---------------------------------------------------------------------------
// r4 round (mech16_r3v_a_m16r3b_verdict.md, independent adversarial review of r3 — REFUTED): r3's
// own §3 full-table audit marked `stateType` (the project-wide useState-name -> Cheng-type map built
// by emitStateSlots in csg-cheng-transpiler.ts, consumed by resolveOneFreeVar) "超出范围" without
// ever reading emitStateSlots' own source — it has the IDENTICAL bare-name-key, cross-component,
// first-scanned-wins collision hazard as refDeclaredNullableType/refDeclaredArrayElemType, fixed at
// the shared source of truth itself (emitStateSlots, not a copy in this .mjs file) the same way: on
// a conflicting second mappable type for a name already accepted, mark it ambiguous and DELETE its
// slot, so `stateType.get(name)` misses exactly like an unregistered name and every consumer falls
// through to its own honest fv-unknown path. Checks 12-13 absorb + correct
// adv-stateType-collision-probe.mjs (the review's own repro, which deliberately asserted the BROKEN
// pre-fix behavior to make a repeatable pre-fix signal) into normal PASS-means-correct regressions,
// mirroring checks 10-11's collision/regression structure exactly.
// ---------------------------------------------------------------------------

// 12. ★stateType collision (emitStateSlots, csg-cheng-transpiler.ts — the project-wide `stateType`
//     map's single source of truth): two DIFFERENT components each declare `const [count, setX] =
//     useState<T>(...)` with the SAME destructured name `count` but DIFFERENT declared types
//     (component A: number, component B: string). Component A is scanned first (appears first in
//     coreFacts / opsById insertion order). Pre-fix: component B's own handler — which reads `count`
//     as a free var and returns it — compiled CLEAN with component A's type (int64) baked into its
//     parameter while its own declared return type stayed `str`, a self-contradictory generated
//     Cheng function signature (`fn readCountB(count: int64): str = return count`) that a real
//     cheng.stage3 build accepted with ZERO diagnostics and, at runtime, read an int64 bit pattern
//     as a str struct — a real memory-unsafe type confusion, not a mere skip (see the review's
//     stage3 probe, adv-stateType-collision-stage3-probe.mjs, preserved verbatim as this repo's
//     stage3 evidence for the pre-fix defect shape). Post-fix: BOTH readCountA and readCountB — not
//     just the second-scanned one — must go fv-unknown and must NOT be compiled at all, the same
//     all-consumers-poisoned shape checks 7/9 already established for the ref family (the state slot
//     itself no longer resolves for anyone once its name is ambiguous, not just for the declaration
//     that lost the race).
await check("r4 collision: stateType map (emitStateSlots), same-named useState across two components, conflicting declared types (number vs string) — both handlers must go fv-unknown, never let one component's type leak into another's self-contradictory signature", async () => {
  const coreFacts = [
    componentFn(),
    { kind: "csg.function", id: "fn.componentA", name: "ComponentA", parameters: [], returnType: "void" },
    { kind: "csg.function", id: "fn.componentB", name: "ComponentB", parameters: [], returnType: "void" },
    ...useStateFactsAt("count", "setCountA", "fn.componentA", "stA", 1, "number"),
    ...handlerBindingFacts("readCountA", "fn.readA", 10),
    ...returnFreeVarFacts("fn.readA", "block.readA", "count", "ra1"),
    { kind: "csg.function", id: "fn.readA", name: "<anonymous>", parameters: [], returnType: "number" },
    ...useStateFactsAt("count", "setCountB", "fn.componentB", "stB", 20, "string"),
    ...handlerBindingFacts("readCountB", "fn.readB", 30),
    ...returnFreeVarFacts("fn.readB", "block.readB", "count", "rb1"),
    { kind: "csg.function", id: "fn.readB", name: "<anonymous>", parameters: [], returnType: "string" },
  ];
  const sceneFacts = [eventHandlerFact("readCountA"), eventHandlerFact("readCountB")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const skipA = cht.skips.find((s) => s.name === "readCountA");
  const skipB = cht.skips.find((s) => s.name === "readCountB");
  assert.ok(skipA, `component A's own handler must also fail once its state name is ambiguous — the slot no longer resolves for anyone: ${JSON.stringify(cht.skips)}`);
  assert.ok(skipB, `component B's handler must fail rather than compile with component A's type silently substituted: ${JSON.stringify(cht.skips)}`);
  assert.match(skipA.reason, /fv-unknown:count/, `must fail with the honest classification reason: ${JSON.stringify(skipA)}`);
  assert.match(skipB.reason, /fv-unknown:count/, `must fail with the honest classification reason: ${JSON.stringify(skipB)}`);
  assert.deepEqual(cht.names, [], `neither handler may be compiled once "count" is ambiguous: ${JSON.stringify(cht.names)}`);
  assert.doesNotMatch(cht.code || "", /fn readCountA\b|fn readCountB\b/, "must never generate a compiled function (with either component's baked-in type) for a consumer of an ambiguous state name");
});

// 13. Regression (established same-name-same-type sharing precedent, already regression-tested for
//     the useRef family — checks 8/11): TWO useState declarations of the SAME name that agree on the
//     SAME declared type must NOT be marked ambiguous — both handlers must keep compiling exactly as
//     before this fix, each reading "count" via the shared stateType entry.
await check("r4 regression: stateType map, same-named useState across two components, SAME declared type — must still compile normally, not be swept into ambiguous", async () => {
  const coreFacts = [
    componentFn(),
    { kind: "csg.function", id: "fn.componentA", name: "ComponentA", parameters: [], returnType: "void" },
    { kind: "csg.function", id: "fn.componentB", name: "ComponentB", parameters: [], returnType: "void" },
    ...useStateFactsAt("count", "setCountA", "fn.componentA", "stA2", 1, "number"),
    ...handlerBindingFacts("readCountA2", "fn.readA2", 10),
    ...returnFreeVarFacts("fn.readA2", "block.readA2", "count", "ra2"),
    { kind: "csg.function", id: "fn.readA2", name: "<anonymous>", parameters: [], returnType: "number" },
    ...useStateFactsAt("count", "setCountB", "fn.componentB", "stB2", 20, "number"),
    ...handlerBindingFacts("readCountB2", "fn.readB2", 30),
    ...returnFreeVarFacts("fn.readB2", "block.readB2", "count", "rb2"),
    { kind: "csg.function", id: "fn.readB2", name: "<anonymous>", parameters: [], returnType: "number" },
  ];
  const sceneFacts = [eventHandlerFact("readCountA2"), eventHandlerFact("readCountB2")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `two same-type useState declarations of the same state name must not be treated as ambiguous: ${JSON.stringify(cht.skips)}`);
  assert.deepEqual(cht.names.sort(), ["readCountA2", "readCountB2"], `both handlers must compile normally: ${JSON.stringify(cht.names)}`);
  assert.match(cht.code, /fn readCountA2\(count: int64\): int64 =/, "handler A must still resolve 'count' via the shared stateType entry, same as pre-fix behavior");
  assert.match(cht.code, /fn readCountB2\(count: int64\): int64 =/, "handler B must still resolve 'count' via the shared stateType entry, same as pre-fix behavior");
});

process.stdout.write(`PASS (${passed}/${passed})\n`);
