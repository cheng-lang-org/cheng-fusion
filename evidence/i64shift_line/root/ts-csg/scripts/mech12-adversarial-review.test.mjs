// mech12-adversarial-review.test.mjs
//
// ADVERSARIAL REVIEW (independent of the implementer) of mechanism 12 (React useRef
// array-of-struct ref translation). The implementer's own scene-runtime-smoke-source.mech12.test.mjs
// suite covers: clear/push/copy-read/length happy paths, `.splice(0)` as the one "unmodeled call"
// negative case, non-spread `.push(item)`, non-empty-array `.current=` write, multi-ref isolation,
// unregistered element type. It NEVER exercises `element_write`/`element_read` (bracket index
// access on `.current`) or `.map`/`.forEach` — confirmed by `grep -c "element_write\|element_read"
// ts-csg/scripts/scene-runtime-smoke-source.mjs` = 0 hits anywhere in the classifier. Those are
// exactly the shapes named in this review's brief ("白名单外数组方法(.map/.splice/索引写)必须响亮
// fail 非静默漏翻") that the implementer's own suite is silent on. This file probes them directly
// against the REAL buildCompiledHandlerTable (no mocking).
//
// Usage: node scripts/mech12-adversarial-review.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

function componentFn() {
  return { kind: "csg.function", id: "fn.component", name: "AdvTest", parameters: [], returnType: "void" };
}
function arrUseRefFacts(refName, ordinalBase, elemTypeText = "RTCIceCandidateInit") {
  return [
    { kind: "csg.op", id: `op.useRef.call.${refName}`, function: "fn.component", block: "block.component", opKind: "call", ordinal: ordinalBase, callee: "useRef", arguments: [], returnType: `MutableRefObject<${elemTypeText}[]>` },
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
function arrClearFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.arrlit`, function: fid, block, opKind: "array_literal", elementCount: 0, elements: [], spreadFlags: [] },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.arrlit` },
  ];
}
function litInt(fid, block, id, value) {
  return [
    { kind: "csg.data", id: `${id}.data`, dataKind: "number", value },
    { kind: "csg.op", id, function: fid, block, opKind: "literal", data: `${id}.data`, literalKind: "number" },
  ];
}
// `<refName>.current[idxOpId] = valueOpId` — element_write on `.current`. This is the shape the
// classifier NEVER special-cases (confirmed by grep). The ref/current pair is positionally
// identical to every other whitelisted read shape (`nx` = property_read("current")); the only
// question is whether the fail-closed default (no arrShapeMatched branch fires) actually holds for
// this specific opKind, since it was never explicitly tested.
function arrElementWriteFacts(fid, block, refName, idxOpId, valueOpId, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "element_write", receiver: `${idBase}.cur`, argument: idxOpId, index: idxOpId, value: valueOpId },
  ];
}
// `<refName>.current[idxOpId]` — element_read, used as an `if` condition operand so it isn't
// dropped as a dead bare-expression statement (mirrors arrLengthGateFacts' technique).
function arrElementReadGateFacts(fid, block, refName, idxOpId, thenBlock, elseBlock, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.elread`, function: fid, block, opKind: "element_read", receiver: `${idBase}.cur`, argument: idxOpId },
    { kind: "csg.op", id: `${idBase}.branch`, function: fid, block, opKind: "branch_if", condition: `${idBase}.elread`, thenBlock, elseBlock },
  ];
}
// `<refName>.current.<method>(args...)` for an arbitrary non-push/non-Set method name.
function arrMethodCallFacts(fid, block, refName, methodName, argOpIds, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.call`, function: fid, block, opKind: "call", callee: `${refName}.current.${methodName}`, memberName: methodName, receiver: `${idBase}.cur`, arguments: argOpIds },
  ];
}
// A no-op zero-param arrow (the `.map`/`.forEach` callback) — its own body content is irrelevant,
// only its presence as a call argument matters for classifier-level testing here.
function arrowArgFacts(fid, block, id, targetFid) {
  return [
    { kind: "csg.op", id, function: fid, block, opKind: "function_value", targetFunction: targetFid },
    { kind: "csg.function", id: targetFid, name: "<anonymous>", parameters: [{ name: "x" }], returnType: "void" },
  ];
}
function arrPushFacts(fid, block, refName, srcIdentifierName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.src`, function: fid, block, opKind: "identifier", name: srcIdentifierName },
    { kind: "csg.op", id: `${idBase}.spread`, function: fid, block, opKind: "spread", value: `${idBase}.src` },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.call`, function: fid, block, opKind: "call", callee: `${refName}.current.push`, memberName: "push", receiver: `${idBase}.cur`, arguments: [`${idBase}.spread`] },
  ];
}
function arrCopyReadFacts(fid, block, refName, localName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.arrlit`, function: fid, block, opKind: "array_literal", elementCount: 1, elements: [`${idBase}.cur`], spreadFlags: [true] },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "local_write", name: localName, value: `${idBase}.arrlit` },
  ];
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

// ---------------------------------------------------------------------------
// 1. Index WRITE `.current[0] = <struct literal-ish value>` alone on an otherwise-untouched ref:
//    the classifier must never admit this ref into arrBoxRefs (no arrShapeMatched branch covers
//    element_write), so the handler must fail honestly, not silently emit an out-of-bounds/aliased
//    write against the KV-synced slot.
await check("ADVERSARIAL: bare index-write '.current[0] = x' fails the ref closed (never silently translated)", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("pendingIceCandidatesRef", 1),
    ...handlerBindingFacts("badIdxWrite", "fn.badIdxWrite", 10),
    ...litInt("fn.badIdxWrite", "block.h", "op.idx0", 0),
    ...litInt("fn.badIdxWrite", "block.h", "op.val0", 0),
    ...arrElementWriteFacts("fn.badIdxWrite", "block.h", "pendingIceCandidatesRef", "op.idx0", "op.val0", "h1"),
  ];
  const sceneFacts = [eventHandlerFact("badIdxWrite")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, `index-write must never compile: ${JSON.stringify(cht.skips)}`);
  assert.ok(cht.skips.some((s) => s.reason === "fv-unknown:pendingIceCandidatesRef"), JSON.stringify(cht.skips));
  assert.equal(cht.code, "", "zero handlers compiled -> zero generated code, nothing fabricated");
});

// ---------------------------------------------------------------------------
// 2. Index READ `.current[0]` alone on an otherwise-untouched ref: must also fail closed (a raw
//    element read past a KV-synced slot's actual length is exactly the kind of "silent garbage
//    read" the whitelist exists to prevent).
await check("ADVERSARIAL: bare index-read '.current[0]' fails the ref closed", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("pendingIceCandidatesRef", 1),
    ...handlerBindingFacts("badIdxRead", "fn.badIdxRead", 10),
    ...litInt("fn.badIdxRead", "block.h", "op.idx0", 0),
    ...arrElementReadGateFacts("fn.badIdxRead", "block.h", "pendingIceCandidatesRef", "op.idx0", "block.then", "block.else", "h1"),
  ];
  const sceneFacts = [eventHandlerFact("badIdxRead")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, `index-read must never compile: ${JSON.stringify(cht.skips)}`);
  assert.ok(cht.skips.some((s) => s.reason === "fv-unknown:pendingIceCandidatesRef"), JSON.stringify(cht.skips));
  assert.equal(cht.code, "", "zero handlers compiled -> zero generated code, nothing fabricated");
});

// ---------------------------------------------------------------------------
// 3. `.current.map(fn)` — a real Array.prototype method the whitelist does not cover. Must fail
//    closed, not silently reduce to a no-op or alias the copy-read path.
await check("ADVERSARIAL: '.current.map(fn)' fails the ref closed", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("pendingIceCandidatesRef", 1),
    ...handlerBindingFacts("badMap", "fn.badMap", 10),
    ...arrowArgFacts("fn.badMap", "block.h", "op.arrow1", "fn.arrow1"),
    ...arrMethodCallFacts("fn.badMap", "block.h", "pendingIceCandidatesRef", "map", ["op.arrow1"], "h1"),
  ];
  const sceneFacts = [eventHandlerFact("badMap")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, `.map must never compile: ${JSON.stringify(cht.skips)}`);
  assert.ok(cht.skips.some((s) => s.reason === "fv-unknown:pendingIceCandidatesRef"), JSON.stringify(cht.skips));
  assert.equal(cht.code, "", "zero handlers compiled -> zero generated code, nothing fabricated");
});

// ---------------------------------------------------------------------------
// 4. `.current.forEach(fn)` — same family, different method name (verifies the fail-closed default
//    isn't accidentally keyed off "map" specifically).
await check("ADVERSARIAL: '.current.forEach(fn)' fails the ref closed", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("pendingIceCandidatesRef", 1),
    ...handlerBindingFacts("badForEach", "fn.badForEach", 10),
    ...arrowArgFacts("fn.badForEach", "block.h", "op.arrow1", "fn.arrow1"),
    ...arrMethodCallFacts("fn.badForEach", "block.h", "pendingIceCandidatesRef", "forEach", ["op.arrow1"], "h1"),
  ];
  const sceneFacts = [eventHandlerFact("badForEach")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, `.forEach must never compile: ${JSON.stringify(cht.skips)}`);
  assert.ok(cht.skips.some((s) => s.reason === "fv-unknown:pendingIceCandidatesRef"), JSON.stringify(cht.skips));
});

// ---------------------------------------------------------------------------
// 5. Cross-handler poisoning via INDEX WRITE specifically (the implementer's own cross-handler
//    poisoning test, case 2, only exercises `.splice` — a `call` op. This exercises the
//    `element_write` op family instead, which is structurally different classifier territory):
//    a valid clear-reassign in one handler + an index-write in a totally different handler on the
//    SAME ref must disqualify BOTH handlers, not just the offending one.
await check("ADVERSARIAL: index-write in one handler poisons a DIFFERENT handler's valid clear on the same ref", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("pendingIceCandidatesRef", 1),
    ...handlerBindingFacts("flushPending", "fn.flushPending", 10),
    ...handlerBindingFacts("corruptIt", "fn.corruptIt", 20),
    ...arrClearFacts("fn.flushPending", "block.h", "pendingIceCandidatesRef", "h1"),
    ...litInt("fn.corruptIt", "block.c", "op.idxC", 0),
    ...litInt("fn.corruptIt", "block.c", "op.valC", 0),
    ...arrElementWriteFacts("fn.corruptIt", "block.c", "pendingIceCandidatesRef", "op.idxC", "op.valC", "c1"),
  ];
  const sceneFacts = [eventHandlerFact("flushPending"), eventHandlerFact("corruptIt")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, `neither handler may compile once the ref is disqualified by the index-write elsewhere: ${JSON.stringify(cht.skips)}`);
  const reasons = cht.skips.map((s) => s.reason);
  assert.ok(reasons.includes("fv-unknown:pendingIceCandidatesRef"), JSON.stringify(reasons));
  assert.equal(cht.code, "", "zero handlers compiled -> zero generated code, nothing fabricated (the otherwise-valid clear must NOT partially compile)");
});

// ---------------------------------------------------------------------------
// 6. `.current = otherArrayIdentifier` — a write whose RHS is a variable holding a whole
//    replacement array (not an array literal at all, literal or otherwise). Different code path
//    from the implementer's own test 4 (`.current = [x]`, an array_literal with 1 element) — this
//    exercises the `vo.opKind !== "array_literal"` branch of the classifier AND the transpiler's
//    own redundant guard (`valOp.opKind === "array_literal" ? ... : -1` -> elementCount=-1 -> fail).
await check("ADVERSARIAL: '.current = someVariable' (non-literal whole-array replacement) fails the ref closed", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("pendingIceCandidatesRef", 1),
    ...arrUseRefFacts("donorRef", 3),
    ...handlerBindingFacts("badAliasWrite", "fn.badAliasWrite", 10),
    ...arrCopyReadFacts("fn.badAliasWrite", "block.h", "donorRef", "replacement", "h1"),
    { kind: "csg.op", id: "op.replacementId", function: "fn.badAliasWrite", block: "block.h", opKind: "identifier", name: "replacement" },
    { kind: "csg.op", id: "op.refId", function: "fn.badAliasWrite", block: "block.h", opKind: "identifier", name: "pendingIceCandidatesRef" },
    { kind: "csg.op", id: "op.badWrite", function: "fn.badAliasWrite", block: "block.h", opKind: "property_write", name: "current", receiver: "op.refId", value: "op.replacementId" },
  ];
  const sceneFacts = [eventHandlerFact("badAliasWrite")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, `whole-array-variable replacement write must never compile: ${JSON.stringify(cht.skips)}`);
  assert.ok(cht.skips.some((s) => s.reason === "fv-unknown:pendingIceCandidatesRef"), JSON.stringify(cht.skips));
});

// ---------------------------------------------------------------------------
// 7. `.current.push(a, b)` — two non-spread arguments (multi-arg push, not the single-non-spread-arg
//    case the implementer's test 3 already covers). Verifies the arity check (`argIds.length !== 1`
//    in the classifier's isArrPushCall AND the transpiler's own redundant `argIds.length !== 1` fail)
//    generalizes beyond exactly one extra argument.
await check("ADVERSARIAL: '.current.push(a, b)' (multi-arg, non-spread) fails the ref closed", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("pendingIceCandidatesRef", 1),
    ...handlerBindingFacts("badMultiPush", "fn.badMultiPush", 10),
    ...litInt("fn.badMultiPush", "block.h", "op.a", 1),
    ...litInt("fn.badMultiPush", "block.h", "op.b", 2),
    ...arrMethodCallFacts("fn.badMultiPush", "block.h", "pendingIceCandidatesRef", "push", ["op.a", "op.b"], "h1"),
  ];
  const sceneFacts = [eventHandlerFact("badMultiPush")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, `multi-arg push must never compile: ${JSON.stringify(cht.skips)}`);
  assert.ok(cht.skips.some((s) => s.reason === "fv-unknown:pendingIceCandidatesRef"), JSON.stringify(cht.skips));
});

// ---------------------------------------------------------------------------
// 8. `.current.push(...a, ...b)` — TWO spread arguments. isArrPushCall requires
//    `arguments.length === 1`, so this must fail exactly like the multi-arg case, not be
//    half-recognized because "both args happen to be spreads".
await check("ADVERSARIAL: '.current.push(...a, ...b)' (two spread args) fails the ref closed", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("pendingIceCandidatesRef", 1),
    ...arrUseRefFacts("donorRef", 3),
    ...handlerBindingFacts("badDoubleSpreadPush", "fn.badDoubleSpreadPush", 10),
    ...arrCopyReadFacts("fn.badDoubleSpreadPush", "block.h", "donorRef", "a", "h1"),
    { kind: "csg.op", id: "op.aId", function: "fn.badDoubleSpreadPush", block: "block.h", opKind: "identifier", name: "a" },
    { kind: "csg.op", id: "op.aSpread", function: "fn.badDoubleSpreadPush", block: "block.h", opKind: "spread", value: "op.aId" },
    ...arrCopyReadFacts("fn.badDoubleSpreadPush", "block.h", "donorRef", "b", "h2"),
    { kind: "csg.op", id: "op.bId", function: "fn.badDoubleSpreadPush", block: "block.h", opKind: "identifier", name: "b" },
    { kind: "csg.op", id: "op.bSpread", function: "fn.badDoubleSpreadPush", block: "block.h", opKind: "spread", value: "op.bId" },
    { kind: "csg.op", id: "op.refId2", function: "fn.badDoubleSpreadPush", block: "block.h", opKind: "identifier", name: "pendingIceCandidatesRef" },
    { kind: "csg.op", id: "op.cur2", function: "fn.badDoubleSpreadPush", block: "block.h", opKind: "property_read", name: "current", receiver: "op.refId2" },
    { kind: "csg.op", id: "op.pushCall", function: "fn.badDoubleSpreadPush", block: "block.h", opKind: "call", callee: "pendingIceCandidatesRef.current.push", memberName: "push", receiver: "op.cur2", arguments: ["op.aSpread", "op.bSpread"] },
  ];
  const sceneFacts = [eventHandlerFact("badDoubleSpreadPush")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, `two-spread push must never compile: ${JSON.stringify(cht.skips)}`);
  assert.ok(cht.skips.some((s) => s.reason === "fv-unknown:pendingIceCandidatesRef"), JSON.stringify(cht.skips));
});

// ---------------------------------------------------------------------------
// 9. Positive control (sanity check that this file's OWN fixture helpers are wired correctly, not
//    just permanently failing everything): a plain valid push must still compile fine, proving
//    tests 1-8 fail for the RIGHT reason (the specific bad shape), not because of a fixture bug.
await check("CONTROL: a plain valid push (this file's own fixture wiring) still compiles", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("pendingIceCandidatesRef", 1),
    ...arrUseRefFacts("donorRef", 3),
    ...handlerBindingFacts("goodPush", "fn.goodPush", 10),
    ...arrCopyReadFacts("fn.goodPush", "block.h", "donorRef", "staged", "h1"),
    ...arrPushFacts("fn.goodPush", "block.h", "pendingIceCandidatesRef", "staged", "h2"),
  ];
  const sceneFacts = [eventHandlerFact("goodPush")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `control case must compile clean: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
});

process.stdout.write(`PASS (${passed}/9)\n`);
