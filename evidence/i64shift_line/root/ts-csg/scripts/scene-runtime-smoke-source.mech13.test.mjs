// scene-runtime-smoke-source.mech13.test.mjs
//
// 离线单测: mechanism 13 (React useRef opaque host-handle ref — localStreamRef family) — hand-
// authored synthetic CsgFact fixtures, same convention as scene-runtime-smoke-source.mech11/
// mech12.test.mjs (import the target .mjs's exported pure entry point, feed it a minimal fixture,
// assert on the real return value — no mocking of the mechanism itself).
//
// Mirrors ChessPage.tsx:379 `const localStreamRef = useRef<MediaStream | null>(null)`, used only
// via the whitelisted shapes (all verified against a REAL extraction of UniMaker's own ChessPage.tsx
// via unimaker-one-click.mjs --stop-after materialize, cross-checked op-by-op, not assumed):
//   ① bare read as a call argument : stopStreamTracks(localStreamRef.current)   (ChessPage.tsx:702)
//   ② null write (release)         : localStreamRef.current = null             (ChessPage.tsx:704)
//   ③ bare read as an if-condition : if (localStreamRef.current) { ... }       (ChessPage.tsx:726)
//   ④ bare read as a return value  : return localStreamRef.current             (ChessPage.tsx:727)
//   ⑤ typed-identifier write       : localStreamRef.current = stream           (ChessPage.tsx:737,
//        `stream`'s OWN declaring local_write carries typeText:"MediaStream" — verified real
//        extractor output, ChessPage.tsx:729-736's `const stream = await
//        navigator.mediaDevices.getUserMedia(...)`)
//
// Op-shape provenance (verified against the REAL ts-csg extractor output on UniMaker's own
// ChessPage.tsx via `unimaker-one-click.mjs --stop-after materialize`, op-by-op, not a standalone
// fixture guess):
//   - A bare function-call argument (`stopStreamTracks(localStreamRef.current)`) puts the CALL op
//     immediately after the `.current` property_read in the flat per-function ops array (ts-csg's
//     emitCall emits the argument sub-expression right before the call op itself) — but that call
//     op carries NO `receiver` field (only a genuine member-call op like `.current.method()` does,
//     pointing at the `.current` read's own id). The pre-mechanism-13 classifier flipped
//     `objectLike` on ANY call positionally adjacent to `.current`, misclassifying this shape as a
//     DOM/object ref. Fixed by requiring `nx2.receiver === nx.id` (ID-backreference, mirrors
//     mechanism 12's own push-detection fix) — see test 5 below for the regression lock.
//   - `const stream = await navigator.mediaDevices.getUserMedia(...)`'s `local_write` op carries
//     `typeText: "MediaStream"` (TS-checker-resolved) verbatim — the sole anchor
//     scalarTypeOfValueOp's new identifier branch reads, matched against CHT_HANDLE_REF_TYPES.
//
// Usage: node scripts/scene-runtime-smoke-source.mech13.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

function componentFn() {
  return { kind: "csg.function", id: "fn.component", name: "ChessPageTest", parameters: [], returnType: "void" };
}

// `const <refName> = useRef<T | null>(null)`. Unlike mechanism 12's array-ref classifier, the
// scalar box-ref family (which this mechanism reuses — see CHT_HANDLE_REF_TYPES's own comment)
// infers its Cheng type ENTIRELY from write-value shapes, never from the useRef call's own
// returnType text — so the exact returnType string here is documentation only, not load-bearing.
function useRefFacts(refName, ordinalBase, declaredTypeText = "MediaStream") {
  return [
    { kind: "csg.op", id: `op.useRef.call.${refName}`, function: "fn.component", block: "block.component", opKind: "call", ordinal: ordinalBase, callee: "useRef", arguments: [], returnType: `MutableRefObject<${declaredTypeText} | null>` },
    { kind: "csg.op", id: `op.useRef.write.${refName}`, function: "fn.component", block: "block.component", opKind: "local_write", ordinal: ordinalBase + 1, name: refName, value: `op.useRef.call.${refName}` },
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

// Shape ① `<calleeName>(<refName>.current)` — bare read passed BY VALUE as a call argument (the
// exact shape that broke the pre-fix positional objectLike scan; see file header).
function bareReadCallArgFacts(fid, block, refName, calleeName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.call`, function: fid, block, opKind: "call", callee: calleeName, arguments: [`${idBase}.cur`] },
  ];
}

// Shape ② `<refName>.current = null`.
function nullWriteFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.data", id: `${idBase}.null`, dataKind: "null", value: null },
    { kind: "csg.op", id: `${idBase}.nulllit`, function: fid, block, opKind: "literal", data: `${idBase}.null` },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.nulllit` },
  ];
}

// Shape ③ `if (<refName>.current) { <thenBlock> }` (bare read as a branch condition).
function ifReadFacts(fid, block, refName, thenBlock, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.branch`, function: fid, block, opKind: "branch_if", condition: `${idBase}.cur`, thenBlock },
  ];
}

// Shape ④ `return <refName>.current;` (bare read as a return value).
function returnReadFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.ret`, function: fid, block, opKind: "return", value: `${idBase}.cur` },
  ];
}

// Shape ⑤ `const <localName>: <declTypeText> = <literal 0>; <refName>.current = <localName>;`
// (typed-identifier write — the shape that carries real type evidence for the handle slot).
function typedIdentifierWriteFacts(fid, block, refName, localName, declTypeText, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.data", id: `${idBase}.zero`, dataKind: "number", value: 0 },
    { kind: "csg.op", id: `${idBase}.zerolit`, function: fid, block, opKind: "literal", data: `${idBase}.zero` },
    { kind: "csg.op", id: `${idBase}.decl`, function: fid, block, opKind: "local_write", name: localName, value: `${idBase}.zerolit`, typeText: declTypeText, declarationKind: "const" },
    { kind: "csg.op", id: `${idBase}.src`, function: fid, block, opKind: "identifier", name: localName },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.src` },
  ];
}

// An unmodeled shape on `.current`: a genuine chained member call (`.current.getTracks()`) — a
// REAL DOM/host chain, receiver correctly points at the `.current` read's own id. Must still trip
// objectLike (proving the mechanism-13 receiver fix narrows FALSE positives only, not detection of
// TRUE chains) and so must NOT be admitted to any box-ref family.
function chainedCallFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.call`, function: fid, block, opKind: "call", callee: `${refName}.current.getTracks`, memberName: "getTracks", receiver: `${idBase}.cur`, arguments: [] },
  ];
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

// ---------------------------------------------------------------------------
// 1. Positive: all five whitelisted shapes on the SAME ref, across two handlers (mirrors
//    ChessPage.tsx's releaseVoiceRuntime + ensureLocalVoiceMedia split), compile — and the
//    generated code declares a single KV-synced int64 slot var, both handlers share it, and the
//    typed-identifier write (⑤) actually assigns the local var by name (no fabricated coercion).
await check("positive: all five localStreamRef shapes (bare-arg/null-write/if/return/typed-write) compile against a shared int64 slot", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("localStreamRef", 1),
    ...handlerBindingFacts("releaseVoiceRuntime", "fn.release", 10),
    ...bareReadCallArgFacts("fn.release", "block.rel", "localStreamRef", "stopStreamTracks", "r1"),
    ...nullWriteFacts("fn.release", "block.rel", "localStreamRef", "r2"),
    ...handlerBindingFacts("ensureLocalVoiceMedia", "fn.ensure", 20),
    ...ifReadFacts("fn.ensure", "block.ens", "localStreamRef", "block.then", "e1"),
    ...returnReadFacts("fn.ensure", "block.thenbody", "localStreamRef", "e2"),
    { kind: "csg.op", id: "op.e1.blockwrap", function: "fn.ensure", block: "block.ens", opKind: "block", nestedBlock: "block.thenbody" },
    ...typedIdentifierWriteFacts("fn.ensure", "block.ens", "localStreamRef", "stream", "MediaStream", "e3"),
  ];
  const sceneFacts = [eventHandlerFact("releaseVoiceRuntime"), eventHandlerFact("ensureLocalVoiceMedia")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 2);
  assert.deepEqual(cht.names.slice().sort(), ["ensureLocalVoiceMedia", "releaseVoiceRuntime"]);
  assert.match(cht.code, /var __chtRef_localStreamRef: int64/, "must declare a KV-synced int64 slot var for localStreamRef");
  // shape ① — bare read passed as a call argument to the (bridged) stopStreamTracks
  assert.match(cht.code, /chengMediaStreamStopTracks\(__chtRef_localStreamRef\)/, "bare-arg read must resolve to the slot var passed into the bridge call");
  // shape ② — null write is uninformative (no assertion on its own codegen text beyond compiling)
  // shape ③/④ — bare read as condition / return value, same slot var
  assert.match(cht.code, /if __chtRef_localStreamRef/, "if-condition read must resolve to the slot var");
  assert.match(cht.code, /return __chtRef_localStreamRef/, "return-value read must resolve to the slot var");
  // shape ⑤ — typed-identifier write assigns the slot var from the real local var by name
  assert.match(cht.code, /__chtRef_localStreamRef = stream/, "typed-identifier write must assign the slot var from the local var");
  // KV wiring: int64 slot uses the existing scalar box-ref codec (chtStrToInt64/Int64ToStr), no
  // new storage mechanism introduced.
  assert.match(cht.code, /__chtRef_localStreamRef = chtStrToInt64\(scene\.WebSceneStateValueForRef\(graph, "ref:localStreamRef"\)\)/);
  assert.match(cht.code, /scene\.WebSceneSetStateValueInternal\(graph, "ref:localStreamRef", strings\.Int64ToStr\(__chtRef_localStreamRef\), true\)/);
});

// ---------------------------------------------------------------------------
// 2. The stopStreamTracks host-bridge redirect: the ORIGINAL TS helper's own body (a for-of loop
//    over stream.getTracks() + try/catch track.stop()) must NEVER be transpiled — the call site
//    redirects straight to the bridge, and the bridge's own @importc contract-head text is pulled
//    in via the existing dependency-closure mechanism (same as any other CHT_BRIDGE_IMPLS entry).
await check("stopStreamTracks call site redirects to the chengMediaStreamStopTracks bridge, never transpiles the TS helper's own for-of/try-catch body", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("localStreamRef", 1),
    ...handlerBindingFacts("releaseVoiceRuntime", "fn.release", 10),
    ...bareReadCallArgFacts("fn.release", "block.rel", "localStreamRef", "stopStreamTracks", "r1"),
    // A ref that is only ever READ (never written a typed value) honestly carries no type
    // evidence anywhere in the component — same requirement scalarBoxRefs already imposes on
    // every other scalar box-ref family (mirrors real ChessPage.tsx: ensureLocalVoiceMedia's
    // typed write is what makes releaseVoiceRuntime's own bare reads resolvable component-wide).
    ...handlerBindingFacts("ensureLocalVoiceMedia", "fn.ensure", 20),
    ...typedIdentifierWriteFacts("fn.ensure", "block.ens", "localStreamRef", "stream", "MediaStream", "e1"),
  ];
  const sceneFacts = [eventHandlerFact("releaseVoiceRuntime"), eventHandlerFact("ensureLocalVoiceMedia")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.match(cht.code, /@importc\("cheng_host_media_stream_stop_tracks"\)/, "the bridge's own @importc contract head must be pulled into the generated program");
  assert.match(cht.code, /fn chengMediaStreamStopTracks\(handle: int64\): void =/, "the bridge wrapper function must be emitted");
  assert.doesNotMatch(cht.code, /getTracks/, "the TS helper's own .getTracks() call must never be transpiled (host-bridge redirect, not a modeled loop)");
  assert.doesNotMatch(cht.code, /track\.stop|\btrack\b/, "the TS helper's own per-track .stop() loop must never be transpiled");
});

// ---------------------------------------------------------------------------
// 3. Fail-fast: an unregistered handle TS type (RTCDataChannel — NOT in CHT_HANDLE_REF_TYPES; note
//    RTCPeerConnection itself WAS this test's example before mechanism 15 registered it via its own
//    CHT_HANDLE_TEARDOWN_BRIDGES/CHT_HANDLE_DEREF_WHITELIST — see scene-runtime-smoke-source.mech15
//    .test.mjs for that mechanism's own coverage) is never admitted, even with the identical shape
//    set that DOES work for MediaStream. Same null-write + typed-identifier-write pair as
//    localStreamRef, only the declared type differs.
await check("fail-fast: an unregistered handle type (RTCDataChannel) never gets swept into the int64 slot family", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("dataChannelRef", 1, "RTCDataChannel"),
    ...handlerBindingFacts("releaseChannel", "fn.releaseChannel", 10),
    ...nullWriteFacts("fn.releaseChannel", "block.rp", "dataChannelRef", "rp1"),
    ...typedIdentifierWriteFacts("fn.releaseChannel", "block.rp", "dataChannelRef", "channel", "RTCDataChannel", "rp2"),
  ];
  const sceneFacts = [eventHandlerFact("releaseChannel")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, "must not compile: RTCDataChannel is not a registered handle type");
  assert.equal(cht.skips.length, 1);
  assert.match(cht.skips[0].reason, /fv-unknown:dataChannelRef/, `must fail with fv-unknown, never fabricate an int64 slot for an unregistered type: ${JSON.stringify(cht.skips)}`);
});

// ---------------------------------------------------------------------------
// 4. Fail-fast: a genuine DOM/host chained call on `.current` (`.current.getTracks()`) still trips
//    objectLike and is excluded from every box-ref family — proves the mechanism-13 receiver fix
//    (test 5 below) only narrows FALSE positives, it does not blind the classifier to TRUE chains.
await check("fail-fast: a genuine chained call on .current (.current.getTracks()) is excluded (objectLike), not swept into the int64 slot family", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("chainedStreamRef", 1),
    ...handlerBindingFacts("touchChained", "fn.touchChained", 10),
    ...chainedCallFacts("fn.touchChained", "block.tc", "chainedStreamRef", "tc1"),
  ];
  const sceneFacts = [eventHandlerFact("touchChained")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, "must not compile: .current.getTracks() is a DOM/host chain, not a whitelisted bare-read shape");
  assert.equal(cht.skips.length, 1);
  assert.match(cht.skips[0].reason, /fv-unknown:chainedStreamRef/, `must fail honestly, not silently misroute a real chain into the scalar family: ${JSON.stringify(cht.skips)}`);
});

// ---------------------------------------------------------------------------
// 5. Multi-ref isolation: two independent MediaStream refs get independent KV keys/slot vars, no
//    cross-talk (mirrors mech11/mech12's own isolation cases).
await check("multi-ref isolation: two named MediaStream refs get independent KV keys/slot vars", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("localStreamRef", 1),
    ...useRefFacts("remoteStreamRef", 3),
    ...handlerBindingFacts("releaseBoth", "fn.releaseBoth", 10),
    ...bareReadCallArgFacts("fn.releaseBoth", "block.rb", "localStreamRef", "stopStreamTracks", "rb1"),
    ...nullWriteFacts("fn.releaseBoth", "block.rb", "localStreamRef", "rb2"),
    ...bareReadCallArgFacts("fn.releaseBoth", "block.rb", "remoteStreamRef", "stopStreamTracks", "rb3"),
    ...nullWriteFacts("fn.releaseBoth", "block.rb", "remoteStreamRef", "rb4"),
    ...typedIdentifierWriteFacts("fn.releaseBoth", "block.rb", "localStreamRef", "localStream", "MediaStream", "rb5"),
    ...typedIdentifierWriteFacts("fn.releaseBoth", "block.rb", "remoteStreamRef", "remoteStream", "MediaStream", "rb6"),
  ];
  const sceneFacts = [eventHandlerFact("releaseBoth")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.match(cht.code, /var __chtRef_localStreamRef: int64/);
  assert.match(cht.code, /var __chtRef_remoteStreamRef: int64/);
  assert.match(cht.code, /chengMediaStreamStopTracks\(__chtRef_localStreamRef\)/);
  assert.match(cht.code, /chengMediaStreamStopTracks\(__chtRef_remoteStreamRef\)/);
  assert.match(cht.code, /"ref:localStreamRef"/);
  assert.match(cht.code, /"ref:remoteStreamRef"/);
});

process.stdout.write(`PASS (${passed}/${passed})\n`);
