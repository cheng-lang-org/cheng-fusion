// mech13-adversarial-audiocontext-reject.test.mjs
//
// Adversarial regression (reviewer-authored, independent of implementer's own test suite): confirms
// fail-closed rejection generalizes beyond RTCPeerConnection (the ONLY negative handle-type the
// implementer's own scene-runtime-smoke-source.mech13.test.mjs exercises) -- try a totally different
// unregistered opaque-handle-shaped TS type ("AudioContext") with the IDENTICAL whitelisted shape set
// (null-write + typed-identifier-write) that DOES successfully compile for MediaStream. Proves the
// CHT_HANDLE_REF_TYPES gate is a genuine allowlist-by-membership check, not a check special-cased
// against the one negative string the implementer happened to test.
//
// Usage: node scripts/mech13-adversarial-audiocontext-reject.test.mjs   (after `npm run build`)
import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

function componentFn() { return { kind: "csg.function", id: "fn.component", name: "T", parameters: [], returnType: "void" }; }
function useRefFacts(refName, ordinalBase, declaredTypeText) {
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
function eventHandlerFact(handlerName) { return { kind: "csg.web.scene.event_handler", effect: `invoke:${handlerName}`, routeIndex: 0, nodeId: 0 }; }
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
function nullWriteFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.data", id: `${idBase}.null`, dataKind: "null", value: null },
    { kind: "csg.op", id: `${idBase}.nulllit`, function: fid, block, opKind: "literal", data: `${idBase}.null` },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.nulllit` },
  ];
}

const coreFacts = [
  componentFn(),
  ...useRefFacts("audioCtxRef", 1, "AudioContext"),
  ...handlerBindingFacts("releaseAudio", "fn.releaseAudio", 10),
  ...nullWriteFacts("fn.releaseAudio", "block.ra", "audioCtxRef", "ra1"),
  ...typedIdentifierWriteFacts("fn.releaseAudio", "block.ra", "audioCtxRef", "ctx", "AudioContext", "ra2"),
];
const sceneFacts = [eventHandlerFact("releaseAudio")];
const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
console.log("skips:", JSON.stringify(cht.skips));
console.log("count:", cht.count);
assert.equal(cht.count, 0, "AudioContext (unregistered) must not compile");
assert.match(cht.skips[0]?.reason || "", /fv-unknown:audioCtxRef/, "must fail honestly with fv-unknown, not fabricate an int64 slot for an unregistered handle type");
console.log("OK: unregistered AudioContext type correctly fails closed (generalizes beyond the implementer's own RTCPeerConnection-only negative test)");
