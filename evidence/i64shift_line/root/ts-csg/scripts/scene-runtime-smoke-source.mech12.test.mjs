// scene-runtime-smoke-source.mech12.test.mjs
//
// 离线单测: mechanism 12 (React useRef array-of-struct ref — pendingIceCandidatesRef family) — hand-
// authored synthetic CsgFact fixtures, same convention as scene-runtime-smoke-source.mech11.test.mjs
// (import the target .mjs's exported pure entry point, feed it a minimal fixture, assert on the real
// return value — no mocking of the mechanism itself).
//
// Mirrors ChessPage.tsx:385 `const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([])`, used
// only via the three whitelisted shapes (+ length read):
//   ① clear-reassign : pendingIceCandidatesRef.current = []                    (ChessPage.tsx:706)
//   ② spread-push     : pendingIceCandidatesRef.current.push(...candidates)    (ChessPage.tsx:993)
//   ③ spread-copy-read: const pending = [...pendingIceCandidatesRef.current]   (ChessPage.tsx:938)
//   ④ length read     : pendingIceCandidatesRef.current.length                (whitelist "如有" extra)
//
// Op-shape provenance (verified against REAL ts-csg extractor output on a standalone .tsx fixture
// with a local `declare function useRef<T>(v: T): MutableRefObject<T>` shim — not assumed):
//   - `useRef<T[]>([])`'s CALL op carries `returnType: "MutableRefObject<T[]>"` (checker-resolved,
//     NoTruncation|UseFullyQualifiedType) — the sole anchor for the array element TS type name.
//   - `.push(...xs)` — the spread ARGUMENT wraps in its own `"spread"` op (opKind:"spread",
//     value:<xs's op id>), referenced via the call op's `arguments[0]`. DIFFERENT representation
//     from array-literal spread (see next bullet) — call-argument spreads always go through
//     `ts.isSpreadElement` -> `emitExpression`'s own wrapper, array-literal elements do not.
//   - `.push(...xs)`'s CALL op is NOT positionally adjacent to `.current` (`ops[i+2]` off the ref
//     identifier) — re-verified against a REAL UniMaker extraction (ChessPage.tsx/ChatPage.tsx),
//     which caught a real bug the standalone-fixture check above missed: ts-csg's emitCall
//     (csg-core.ts:2010-2033) emits the receiver sub-expr, THEN the argument sub-exprs (here:
//     `identifier(candidates)` + `spread`), THEN the call op itself LAST — so `ops[i+2]` is the
//     argument's OWN identifier op, not the call. The classifier therefore finds the push call by
//     ID-backreference (`op2.receiver === <the .current property_read's own id>`), not by array
//     position — see `arrPushFactsRealistic` below, which reproduces this exact real-world
//     ordering (as opposed to `arrPushFacts`, which keeps the old artificially-adjacent order and
//     still must pass too, since the classifier no longer depends on either ordering).
//   - `[...ref.current]` — NO "spread" wrapper op. The array_literal op's `elements[0]` IS the
//     `.current` property_read op's own id directly, with `spreadFlags[0] === true`. Confirmed
//     positionally adjacent (`ops[i+2]`) in BOTH the standalone fixture AND the real extraction —
//     a single-spread array literal has no argument sub-expressions of its own to interleave.
//   - `.current.length` — an ordinary property_read(name:"length", receiver:<the `.current` op>),
//     also positionally adjacent (no sub-expressions of its own).
//
// Usage: node scripts/scene-runtime-smoke-source.mech12.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

function componentFn() {
  return { kind: "csg.function", id: "fn.component", name: "ChessPageTest", parameters: [], returnType: "void" };
}

// `const <refName> = useRef<RTCIceCandidateInit[]>([])` — returnType is the ONLY thing the
// classifier reads off the useRef call op (see REF_ARRAY_RETURN_TYPE_RE in the target .mjs); the
// constructor's own `[]` argument isn't inspected (kept minimal, mirrors mech11's useRefFacts).
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

// Shape ① `<refName>.current = []` (clear-reassign). Must be pushed as its own contiguous
// identifier -> property_write group (the classifier's `.current = value` scan is positional:
// `ops[i+1]` off the ref identifier).
// The value op is emitted BEFORE the ref/write pair — the classifier's `.current = value` scan is
// positional (`ops[i+1]` off the ref identifier must be the property_write itself), matching the
// same fix applied to arrPushFacts above (the value is found by `nx.value` ID lookup, not position).
function arrClearFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.arrlit`, function: fid, block, opKind: "array_literal", elementCount: 0, elements: [], spreadFlags: [] },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.arrlit` },
  ];
}

// Shape ① with an explicit non-empty-array (or otherwise non-clear) value — for the fail-fast case.
function arrBadWriteFacts(fid, block, refName, tag, valueOpId) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: valueOpId },
  ];
}

// Shape ③ `const <localName> = [...<refName>.current]` (spread-copy-read into a fresh local).
function arrCopyReadFacts(fid, block, refName, localName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.arrlit`, function: fid, block, opKind: "array_literal", elementCount: 1, elements: [`${idBase}.cur`], spreadFlags: [true] },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "local_write", name: localName, value: `${idBase}.arrlit` },
  ];
}

// Shape ② `<refName>.current.push(...<srcIdentifierName>)` — the spread's source must be a plain
// identifier already bound (a param, or a local bound by arrCopyReadFacts above), matching the
// REAL source shape exactly (ChessPage.tsx never spreads `.current` directly into `.push`). Src
// identifier + spread emitted BEFORE the ref/property_read/call trio (the OPPOSITE of ts-csg's own
// real emission order — see arrPushFactsRealistic below for that). The classifier finds the push
// call by ID-backreference (receiver === the `.current` op's own id), not by array position, so
// BOTH orderings must classify identically — this one exists to prove position genuinely does not
// matter, not because it's the realistic shape.
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

// Shape ② with the REAL ts-csg emission order (verified against an actual UniMaker extraction —
// see the file header): ref identifier, property_read("current"), THEN the argument's own
// identifier + spread op, THEN the call op LAST. `ops[i+2]` off the ref identifier is the
// argument's identifier, NOT the call — this is the exact shape that broke a purely-positional
// classifier scan during self-test (regression lock for that specific bug).
function arrPushFactsRealistic(fid, block, refName, srcIdentifierName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.src`, function: fid, block, opKind: "identifier", name: srcIdentifierName },
    { kind: "csg.op", id: `${idBase}.spread`, function: fid, block, opKind: "spread", value: `${idBase}.src` },
    { kind: "csg.op", id: `${idBase}.call`, function: fid, block, opKind: "call", callee: `${refName}.current.push`, memberName: "push", receiver: `${idBase}.cur`, arguments: [`${idBase}.spread`] },
  ];
}

// A `.push(item)` call with a SINGLE non-spread argument — "append exactly one element"
// (ChessPage.tsx:847 `queueOutgoingVoiceIceCandidate`, mech17 r1's "pushOne" shape). Admitted at the
// classifier level (arrOk stays true — see the updated "fail-fast" test 3 below, now a two-stage
// check), but codegen for this specific call shape is still `this.fail()` in the transpiler
// (csg-cheng-transpiler.ts) — deliberately deferred, no reachable real call site to verify a
// per-element struct constructor against yet (mech17 r1 verdict §4/§5).
function arrNonSpreadPushFacts(fid, block, refName, argOpId, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.call`, function: fid, block, opKind: "call", callee: `${refName}.current.push`, memberName: "push", receiver: `${idBase}.cur`, arguments: [argOpId] },
  ];
}

// Shape ④ `<refName>.current.length` (used as the condition of an `if`, so it isn't discarded as a
// dead bare-expression statement).
function arrLengthGateFacts(fid, block, refName, thenBlock, elseBlock, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.data", id: `${idBase}.zero`, dataKind: "number", value: 0 },
    { kind: "csg.op", id: `${idBase}.zerolit`, function: fid, block, opKind: "literal", data: `${idBase}.zero`, literalKind: "number" },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.len`, function: fid, block, opKind: "property_read", name: "length", receiver: `${idBase}.cur` },
    { kind: "csg.op", id: `${idBase}.gt`, function: fid, block, opKind: "binary", operator: "GreaterThanToken", left: `${idBase}.len`, right: `${idBase}.zerolit` },
    { kind: "csg.op", id: `${idBase}.branch`, function: fid, block, opKind: "branch_if", condition: `${idBase}.gt`, thenBlock, elseBlock },
  ];
}

// An unmodeled call shape on `.current` — `.splice(1)` (a PARTIAL remove starting at a non-zero
// index — real `Array.prototype.splice(1)` drops everything from index 1 on, a materially
// different operation than drain-all). mech17 r1 narrowly whitelists ONLY `.splice(0)` (drain-all,
// see arrDrainFacts below) — any other splice start index stays unmodeled and must still fail BOTH
// setOk and arrOk closed, proving the new whitelist entry is exactly as narrow/hand-audited as the
// three it joins (not a generic "any splice call" acceptance).
function arrUnmodeledCallFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.data", id: `${idBase}.one`, dataKind: "number", value: 1 },
    { kind: "csg.op", id: `${idBase}.onelit`, function: fid, block, opKind: "literal", data: `${idBase}.one`, literalKind: "number" },
    { kind: "csg.op", id: `${idBase}.call`, function: fid, block, opKind: "call", callee: `${refName}.current.splice`, memberName: "splice", receiver: `${idBase}.cur`, arguments: [`${idBase}.onelit`] },
  ];
}

// mech17 r1: `<refName>.current.splice(0)` (drain-all) — the call's OWN `0` argument literal is
// emitted BEFORE the call op itself (same emitCall ordering as arrPushFactsRealistic's spread
// argument), found by ID-backreference, NOT position — matches the REAL ts-csg extraction shape
// (ChessPage.tsx:828 `flushQueuedVoiceIceCandidates`). Binds the call's return value (the drained
// snapshot) to `localName`, same convention as arrCopyReadFacts.
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

// Adversarial: `<refName>.current.push(a, b)` — TWO arguments, neither spread. Real JS
// `Array.prototype.push` accepts multiple arguments, but mech17 r1's audited "pushOne" shape is
// deliberately narrower (exactly one non-spread argument, the one real call site's own shape) — a
// 2-argument push must stay unmodeled and fail the ref closed, same narrowness guard as
// arrUnmodeledCallFacts above.
function arrTwoArgPushFacts(fid, block, refName, arg1OpId, arg2OpId, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.call`, function: fid, block, opKind: "call", callee: `${refName}.current.push`, memberName: "push", receiver: `${idBase}.cur`, arguments: [arg1OpId, arg2OpId] },
  ];
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

// ---------------------------------------------------------------------------
// 1. Positive: a single realistic composed handler (mirrors ChessPage.tsx's
//    flushPendingIceCandidates: copy-read, clear, length-gate, push-into-a-different-ref) compiles,
//    and the generated code carries a REAL independent copy loop (not the generic alias shortcut),
//    a `setLen(slot, 0)` clear, an `int64(slot.len)` length read, and a push loop against the
//    SECOND ref's own slot var — plus correct KV decl/load/store wiring for BOTH refs.
await check("positive: copy-read + clear + length-gate + push-into-another-ref all compile", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("pendingIceCandidatesRef", 1),
    ...arrUseRefFacts("archiveRef", 3),
    ...handlerBindingFacts("flushPending", "fn.flushPending", 10),
    ...arrCopyReadFacts("fn.flushPending", "block.h", "pendingIceCandidatesRef", "pending", "h1"),
    ...arrClearFacts("fn.flushPending", "block.h", "pendingIceCandidatesRef", "h2"),
    ...arrLengthGateFacts("fn.flushPending", "block.h", "pendingIceCandidatesRef", "block.then", "block.else", "h3"),
    ...arrPushFacts("fn.flushPending", "block.h", "archiveRef", "pending", "h4"),
  ];
  const sceneFacts = [eventHandlerFact("flushPending")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.deepEqual(cht.names, ["flushPending"]);
  assert.match(cht.code, /var __chtRef_pendingIceCandidatesRef: scene\.WebSceneIceCandidateRecord\[\]/, "must declare the KV-synced struct-array slot var for pendingIceCandidatesRef");
  assert.match(cht.code, /var __chtRef_archiveRef: scene\.WebSceneIceCandidateRecord\[\]/, "must declare the KV-synced struct-array slot var for archiveRef");
  // shape ③: a REAL copy loop (fresh array + while + add), never the generic single-spread alias
  // shortcut (`return this.emitExpr(elementIds[0])`, which would just emit the bare slot var name
  // with no `var ... : scene.WebSceneIceCandidateRecord[]` / `while` / `add(` around it at all).
  assert.match(cht.code, /var (\w+): scene\.WebSceneIceCandidateRecord\[\]\n\s+var (\w+) = 0\n\s+while \2 < __chtRef_pendingIceCandidatesRef\.len:\n\s+add\(\1, __chtRef_pendingIceCandidatesRef\[int32\(\2\)\]\)/, "copy-read must be a real element-by-element copy loop, not an alias");
  // shape ①
  assert.match(cht.code, /setLen\(__chtRef_pendingIceCandidatesRef, 0\)/, "clear must lower to setLen(slot, 0)");
  // shape ④
  assert.match(cht.code, /int64\(__chtRef_pendingIceCandidatesRef\.len\)/, "length must lower to int64(slot.len)");
  // shape ② — push loop against archiveRef's OWN slot var (not pendingIceCandidatesRef's)
  assert.match(cht.code, /let (\w+) = pending\n\s+var (\w+) = 0\n\s+while \2 < \1\.len:\n\s+add\(__chtRef_archiveRef, \1\[int32\(\2\)\]\)/, "push must be a real element-by-element append loop into archiveRef's slot");
  // KV wiring for both refs, correct per-ref keys and codec function names
  assert.match(cht.code, /scene\.WebSceneParseIceCandidateArrayState\(scene\.WebSceneStateValueForRef\(graph, "arr:pendingIceCandidatesRef"\), __chtRef_pendingIceCandidatesRef\)/);
  assert.match(cht.code, /scene\.WebSceneSetStateValueInternal\(graph, "arr:pendingIceCandidatesRef", scene\.WebSceneEncodeIceCandidateArrayState\(__chtRef_pendingIceCandidatesRef\), true\)/);
  assert.match(cht.code, /scene\.WebSceneParseIceCandidateArrayState\(scene\.WebSceneStateValueForRef\(graph, "arr:archiveRef"\), __chtRef_archiveRef\)/);
  assert.match(cht.code, /scene\.WebSceneSetStateValueInternal\(graph, "arr:archiveRef", scene\.WebSceneEncodeIceCandidateArrayState\(__chtRef_archiveRef\), true\)/);
});

// ---------------------------------------------------------------------------
// 1b. Regression lock for a REAL bug caught by A/B testing against the actual UniMaker extraction
//     (not just this file's own fixtures): a purely-positional classifier scan (`ops[i+2]` off the
//     ref identifier) misses `.push(...xs)` whenever `xs` isn't a bare literal, because ts-csg
//     emits the push call's OWN argument sub-expressions (the source identifier + its spread
//     wrapper) BETWEEN the `.current` property_read and the call op — `ops[i+2]` lands on the
//     argument's identifier, not the call. This exact shape (arrPushFactsRealistic) is what
//     ChessPage.tsx/ChatPage.tsx's real `pendingIceCandidatesRef.current.push(...candidates)`
//     compiles down to. Must classify identically to the artificially-reordered arrPushFacts above.
await check("positive (realistic op order): push survives ts-csg's real argument-before-call emission order", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("pendingIceCandidatesRef", 1),
    ...arrUseRefFacts("payloadRef", 3),
    ...handlerBindingFacts("pushRealistic", "fn.pushRealistic", 10),
    // `candidates` needs a real Cheng array type to push — bound via a copy-read from a second ref
    // (same technique test 1 uses for `pending`/`staged`/`fresh`), matching the real source shape
    // (`candidates` in ChessPage.tsx comes from a typed local, never an unresolvable free var).
    ...arrCopyReadFacts("fn.pushRealistic", "block.pr", "payloadRef", "candidates", "pr0"),
    ...arrPushFactsRealistic("fn.pushRealistic", "block.pr", "pendingIceCandidatesRef", "candidates", "pr1"),
  ];
  const sceneFacts = [eventHandlerFact("pushRealistic")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile with zero skips (real op ordering must classify push): ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.match(cht.code, /var __chtRef_pendingIceCandidatesRef: scene\.WebSceneIceCandidateRecord\[\]/);
  assert.match(cht.code, /let (\w+) = candidates\n\s+var (\w+) = 0\n\s+while \2 < \1\.len:\n\s+add\(__chtRef_pendingIceCandidatesRef, \1\[int32\(\2\)\]\)/, "push must be a real append loop even with the realistic (argument-before-call) op order");
});

// ---------------------------------------------------------------------------
// 2. Fail-fast: an unmodeled call shape (`.current.splice(1)`, a partial remove — NOT the narrowly
//    whitelisted `.splice(0)` drain-all, see test 2b below) anywhere on the SAME ref flips arrOk
//    closed for the WHOLE ref — the handler using clear/push/copy on it must fail fv-unknown, never
//    a partially-modeled slot. Mirrors mech11 case 2 exactly. Regression lock for mech17 r1's
//    narrowness: widening the whitelist to admit `.splice(0)` must NOT admit every splice call.
await check("fail-fast: an unmodeled call (.splice(1), non-zero start) fails the whole ref closed", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("pendingIceCandidatesRef", 1),
    ...handlerBindingFacts("flushPending", "fn.flushPending", 10),
    ...handlerBindingFacts("spliceIt", "fn.spliceIt", 20),
    ...arrClearFacts("fn.flushPending", "block.h", "pendingIceCandidatesRef", "h1"),
    ...arrUnmodeledCallFacts("fn.spliceIt", "block.s", "pendingIceCandidatesRef", "s1"),
  ];
  const sceneFacts = [eventHandlerFact("flushPending"), eventHandlerFact("spliceIt")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, "neither handler may compile once the ref is disqualified");
  const reasons = cht.skips.map((s) => s.reason);
  assert.ok(reasons.includes("fv-unknown:pendingIceCandidatesRef"), `expected fv-unknown:pendingIceCandidatesRef in ${JSON.stringify(reasons)}`);
  assert.equal(cht.code, "", "zero handlers compiled -> zero generated code, nothing fabricated");
});

// ---------------------------------------------------------------------------
// 2b. mech17 r1 positive: `.current.splice(0)` (drain-all) is now a whitelisted mechanism-12 shape
//     — real codegen (element-by-element copy loop + `setLen(slot, 0)`, mirroring the copy-read +
//     clear-reassign codegen tested in test 1), not just a classifier-level admission. Mirrors
//     ChessPage.tsx:828 `flushQueuedVoiceIceCandidates` (`const candidates =
//     queuedVoiceIceCandidatesRef.current.splice(0)`).
await check("mech17 r1 positive: splice(0) drain compiles to a real copy-loop + setLen(0), returns the snapshot", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("queuedRef", 1),
    ...handlerBindingFacts("drainQueue", "fn.drainQueue", 10),
    ...arrDrainFacts("fn.drainQueue", "block.dq", "queuedRef", "drained", "dq1"),
  ];
  const sceneFacts = [eventHandlerFact("drainQueue")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.match(cht.code, /var __chtRef_queuedRef: scene\.WebSceneIceCandidateRecord\[\]/, "must declare the KV-synced slot var for queuedRef");
  // Real element-by-element copy loop (same shape as the copy-read assertion in test 1), never an
  // alias of the slot var.
  assert.match(cht.code, /var (\w+): scene\.WebSceneIceCandidateRecord\[\]\n\s+var (\w+) = 0\n\s+while \2 < __chtRef_queuedRef\.len:\n\s+add\(\1, __chtRef_queuedRef\[int32\(\2\)\]\)/, "drain must be a real element-by-element copy loop, not an alias");
  // The slot must be cleared in place afterwards, same as clear-reassign.
  assert.match(cht.code, /setLen\(__chtRef_queuedRef, 0\)/, "drain must clear the slot via setLen(slot, 0)");
});

// ---------------------------------------------------------------------------
// 3. mech17 r1 changed this from a ref-level "fail-fast" (single-item push used to disqualify the
//    WHOLE ref) to a two-stage check: the classifier now admits a ref with a non-spread `.push(item)`
//    call site (arrOk stays true), but codegen for THIS SPECIFIC call shape is still deferred
//    (`this.fail()` in the transpiler) — so the ONE handler that actually calls `.push(item)` still
//    fails to compile, just with a DIFFERENT reason (`transpile-fail:`, not `fv-unknown:`). Test 3b
//    right below is the decisive readHealthy check: a SIBLING handler on the SAME ref that only uses
//    an already-lowered shape (clear) must NOT be dragged down by the unlowered one.
await check("mech17 r1: single-item .push(item) is classified (arrOk) but its OWN handler still fails at transpile (not ref-exclusion)", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("pendingIceCandidatesRef", 1),
    ...handlerBindingFacts("pushOne", "fn.pushOne", 10),
    // A bare literal argument (not an unresolved free var) so the ONLY reason this handler can fail
    // is the push(item) call shape itself, isolated from an unrelated fv-unknown.
    { kind: "csg.data", id: "data.itemlit", dataKind: "number", value: 0 },
    { kind: "csg.op", id: "op.item", function: "fn.pushOne", block: "block.h", opKind: "literal", data: "data.itemlit", literalKind: "number" },
    ...arrNonSpreadPushFacts("fn.pushOne", "block.h", "pendingIceCandidatesRef", "op.item", "h1"),
  ];
  const sceneFacts = [eventHandlerFact("pushOne")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, "the push(item) handler itself must still fail to compile");
  assert.ok(cht.skips.some((s) => s.reason.startsWith("transpile-fail:")), `expected a transpile-fail: reason (ref-level exclusion no longer applies), got ${JSON.stringify(cht.skips)}`);
  assert.ok(!cht.skips.some((s) => s.reason === "fv-unknown:pendingIceCandidatesRef"), `must NOT be excluded at the ref level anymore, got ${JSON.stringify(cht.skips)}`);
});

// ---------------------------------------------------------------------------
// 3b. readHealthy non-interference (decisive): a SECOND handler on the SAME ref, using ONLY the
//     already-lowered "clear" shape, must compile successfully — the unlowered push(item) call site
//     in a DIFFERENT handler must not drag it down. This is exactly the failure mode mech16's
//     writeonly-setter round found and fixed for stateType — mech17 r1 must not reintroduce it for
//     arrBoxRefs.
await check("mech17 r1 readHealthy: a healthy clear-only handler on the SAME ref is unaffected by a sibling's unlowered push(item)", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("pendingIceCandidatesRef", 1),
    ...handlerBindingFacts("pushOne", "fn.pushOne", 10),
    ...handlerBindingFacts("clearHealthy", "fn.clearHealthy", 20),
    { kind: "csg.data", id: "data.itemlit2", dataKind: "number", value: 0 },
    { kind: "csg.op", id: "op.item2", function: "fn.pushOne", block: "block.h", opKind: "literal", data: "data.itemlit2", literalKind: "number" },
    ...arrNonSpreadPushFacts("fn.pushOne", "block.h", "pendingIceCandidatesRef", "op.item2", "h1"),
    ...arrClearFacts("fn.clearHealthy", "block.ch", "pendingIceCandidatesRef", "ch1"),
  ];
  const sceneFacts = [eventHandlerFact("pushOne"), eventHandlerFact("clearHealthy")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 1, `exactly one handler (clearHealthy) must compile: ${JSON.stringify(cht.skips)}`);
  assert.deepEqual(cht.names, ["clearHealthy"]);
  assert.match(cht.code, /setLen\(__chtRef_pendingIceCandidatesRef, 0\)/, "clearHealthy's own clear codegen must still be present");
  // The failed sibling must not leave any trace (variable, call) in the surviving code.
  assert.doesNotMatch(cht.code, /pushOne/, "the unlowered pushOne handler must not appear anywhere in the surviving compiled code");
});

// ---------------------------------------------------------------------------
// 3c. Adversarial narrowness guard: `.push(a, b)` (two non-spread arguments) is NOT the audited
//     "exactly one" pushOne shape — must stay unmodeled and fail the whole ref closed (same
//     ref-level exclusion as the pre-mech17-r1 single-arg case used to get, proving the widened
//     whitelist did not accidentally become "any push arity").
await check("fail-fast: two-argument .push(a, b) fails the ref closed (narrowness guard)", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("pendingIceCandidatesRef", 1),
    ...handlerBindingFacts("pushTwo", "fn.pushTwo", 10),
    { kind: "csg.data", id: "data.a", dataKind: "number", value: 0 },
    { kind: "csg.op", id: "op.a", function: "fn.pushTwo", block: "block.h", opKind: "literal", data: "data.a", literalKind: "number" },
    { kind: "csg.data", id: "data.b", dataKind: "number", value: 1 },
    { kind: "csg.op", id: "op.b", function: "fn.pushTwo", block: "block.h", opKind: "literal", data: "data.b", literalKind: "number" },
    ...arrTwoArgPushFacts("fn.pushTwo", "block.h", "pendingIceCandidatesRef", "op.a", "op.b", "h1"),
  ];
  const sceneFacts = [eventHandlerFact("pushTwo")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0);
  assert.ok(cht.skips.some((s) => s.reason === "fv-unknown:pendingIceCandidatesRef"), JSON.stringify(cht.skips));
});

// ---------------------------------------------------------------------------
// 4. Fail-fast: a non-empty-array write (`.current = [x]`, or any non-array-literal replacement) is
//    a DIFFERENT shape than the whitelisted clear-reassign `.current = []` — must fail closed.
await check("fail-fast: non-empty-array .current write fails the ref closed", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("pendingIceCandidatesRef", 1),
    ...handlerBindingFacts("badClear", "fn.badClear", 10),
    { kind: "csg.data", id: "data.item2lit", dataKind: "number", value: 0 },
    { kind: "csg.op", id: "op.item2", function: "fn.badClear", block: "block.h", opKind: "literal", data: "data.item2lit", literalKind: "number" },
    { kind: "csg.op", id: "op.arrlit1", function: "fn.badClear", block: "block.h", opKind: "array_literal", elementCount: 1, elements: ["op.item2"], spreadFlags: [false] },
    ...arrBadWriteFacts("fn.badClear", "block.h", "pendingIceCandidatesRef", "h1", "op.arrlit1"),
  ];
  const sceneFacts = [eventHandlerFact("badClear")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0);
  assert.ok(cht.skips.some((s) => s.reason === "fv-unknown:pendingIceCandidatesRef"), JSON.stringify(cht.skips));
});

// ---------------------------------------------------------------------------
// 5. Multi-ref isolation: two independently-named array box-refs, each used by its own handler,
//    compile together with fully independent KV keys and slot vars — no cross-ref interference.
await check("multi-ref isolation: two named array box-refs get independent KV keys/slot vars", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("refA", 1),
    ...arrUseRefFacts("refB", 3),
    ...handlerBindingFacts("clearA", "fn.clearA", 10),
    ...handlerBindingFacts("clearB", "fn.clearB", 20),
    ...arrClearFacts("fn.clearA", "block.a", "refA", "a1"),
    ...arrClearFacts("fn.clearB", "block.b", "refB", "b1"),
  ];
  const sceneFacts = [eventHandlerFact("clearA"), eventHandlerFact("clearB")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 2);
  assert.deepEqual([...cht.names].sort(), ["clearA", "clearB"]);
  assert.match(cht.code, /var __chtRef_refA: scene\.WebSceneIceCandidateRecord\[\]/);
  assert.match(cht.code, /var __chtRef_refB: scene\.WebSceneIceCandidateRecord\[\]/);
  assert.match(cht.code, /"arr:refA"/);
  assert.match(cht.code, /"arr:refB"/);
  const clearABranch = cht.code.slice(cht.code.indexOf('__chtName == "clearA"'), cht.code.indexOf('__chtName == "clearB"'));
  assert.match(clearABranch, /__chtRef_refA/);
  assert.doesNotMatch(clearABranch, /__chtRef_refB/, "clearA's dispatch branch must never touch refB's slot");
});

// ---------------------------------------------------------------------------
// 6. Unregistered element type: a `useRef<SomeUnregisteredThing[]>([])` used via the SAME three
//    whitelisted shapes must NOT be classified as an array box-ref (no native codec exists for it —
//    CHT_ARRAY_REF_ELEM_TYPES has no entry) — it is left unclassified and the handler fails honestly
//    elsewhere, never a fabricated/guessed codec.
await check("unregistered element type: ref is left unclassified, never fabricates a codec", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("otherThingsRef", 1, "SomeUnregisteredThing"),
    ...handlerBindingFacts("clearOther", "fn.clearOther", 10),
    ...arrClearFacts("fn.clearOther", "block.h", "otherThingsRef", "h1"),
  ];
  const sceneFacts = [eventHandlerFact("clearOther")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, "an unregistered element type must never compile via a fabricated codec");
  assert.doesNotMatch(cht.code, /WebSceneIceCandidateRecord/, "must not accidentally reuse the ICE-candidate codec for an unrelated type");
});

process.stdout.write(`PASS (${passed}/10)\n`);
