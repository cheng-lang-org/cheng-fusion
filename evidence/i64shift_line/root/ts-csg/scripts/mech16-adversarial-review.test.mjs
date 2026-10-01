// mech16-adversarial-review.test.mjs
//
// ADVERSARIAL REVIEW absorption (mech16_review_a_m16r1_verdict.md, independent complete review of
// mechanism 16 — the `useRef<T | null>` native-scalar declared-type fallback in scalarTypeOfValueOp).
// The review's own diagnostic script (adv-mech16-review.mjs, print-only, no assertions — a manual-
// inspection investigation tool, not a regression gate) probed 5 dimensions; 4 of them (ADV-1
// through ADV-4) came back genuinely NEGATIVE (no defect found) and are absorbed here as permanent,
// REAL-ASSERTING regression locks, same convention as mech12-adversarial-review.test.mjs. ADV-5 (the
// dimension that came back POSITIVE — same-named ref, conflicting declared types — the sole reason
// for the REFUTED verdict) is deliberately NOT duplicated here: its own fixture in
// adv-mech16-review.mjs aliased both conflicting declarations onto the SAME op id via a
// `refName`-derived id string, which collided at the id-keyed `opsById` Map itself (upstream of and
// unrelated to the name-keyed collision under test) — so it never actually exercised two
// independently-surviving declarations. The corrected version (two declarations, each its own real
// op id, sharing only the ref NAME field) lives as checks 7-9 in
// scene-runtime-smoke-source.mech16.test.mjs instead, alongside the rest of mechanism 16's own
// regression suite.
//
// Usage: node scripts/mech16-adversarial-review.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

function componentFn() {
  return { kind: "csg.function", id: "fn.component", name: "AdvTest", parameters: [], returnType: "void" };
}
function useRefFacts(refName, ordinalBase, declaredTypeText = "number") {
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

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

// ADV-1: fractional-literal write (`ref.current = 3.14`) on a native-scalar-fallback ref. The
// literal branch's `Number.isInteger(d)` check misses non-integer numbers, so mechanism 16's
// fall-through fix means this now reaches the declared-type fallback (number -> int64) instead of
// staying unresolved. Must fail with the PRE-EXISTING (not mechanism-16-introduced) non-integer
// literal guard in csg-cheng-transpiler.ts, never silently truncate/corrupt.
await check("ADV-1: fractional literal write (.current = 3.14) on a native-scalar-fallback ref fails honestly, never silently truncates", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("fracRef", 1, "number"),
    ...handlerBindingFacts("writeFracHandler", "fn.writeFrac", 10),
    { kind: "csg.data", id: "op.frac.data", dataKind: "number", value: 3.14 },
    { kind: "csg.op", id: "op.frac.lit", function: "fn.writeFrac", block: "block.writeFrac", opKind: "literal", data: "op.frac.data" },
    { kind: "csg.op", id: "op.frac.ref", function: "fn.writeFrac", block: "block.writeFrac", opKind: "identifier", name: "fracRef" },
    { kind: "csg.op", id: "op.frac.write", function: "fn.writeFrac", block: "block.writeFrac", opKind: "property_write", name: "current", receiver: "op.frac.ref", value: "op.frac.lit" },
  ];
  const sceneFacts = [eventHandlerFact("writeFracHandler")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const skip = cht.skips.find((s) => s.name === "writeFracHandler");
  assert.ok(skip, `fractional literal write must not silently compile: ${JSON.stringify(cht.skips)}`);
  assert.match(skip.reason, /non-integer numeric literal/, `must fail with the pre-existing non-integer-literal guard, not a fabricated pass: ${JSON.stringify(skip)}`);
  assert.doesNotMatch(cht.code || "", /__chtRef_fracRef/, "must never declare a slot for the fractional write");
});

// ADV-2: alias-escape r3-style reassignment (mechanism 15's own three-round alias vector) replayed
// on a mechanism-16 fallback-typed ref: `const t = ref.current; t = 999; if (t) {
// window.clearTimeout(t); ref.current = null; }`. Mechanism 16 does not touch
// csg-cheng-transpiler.ts (zero diff there, no new folding/alias logic) — `t`'s OWN reassigned value
// must be used at the call site, never silently re-substituted with the ref's live slot value.
await check("ADV-2: r3-style local-alias reassignment before use on a mechanism-16 fallback-typed ref compiles with the alias's OWN reassigned value, not a re-substituted ref read", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("voiceIceFlushTimerRef", 1, "number"),
    ...handlerBindingFacts("aliasReassignHandler", "fn.aliasR", 10),
    { kind: "csg.op", id: "op.ar.ref1", function: "fn.aliasR", block: "block.aliasR", opKind: "identifier", name: "voiceIceFlushTimerRef" },
    { kind: "csg.op", id: "op.ar.cur1", function: "fn.aliasR", block: "block.aliasR", opKind: "property_read", name: "current", receiver: "op.ar.ref1" },
    { kind: "csg.op", id: "op.ar.decl", function: "fn.aliasR", block: "block.aliasR", opKind: "local_write", name: "t", value: "op.ar.cur1" },
    { kind: "csg.data", id: "op.ar.999data", dataKind: "number", value: 999 },
    { kind: "csg.op", id: "op.ar.999lit", function: "fn.aliasR", block: "block.aliasR", opKind: "literal", data: "op.ar.999data" },
    { kind: "csg.op", id: "op.ar.tident", function: "fn.aliasR", block: "block.aliasR", opKind: "identifier", name: "t" },
    { kind: "csg.op", id: "op.ar.reassign", function: "fn.aliasR", block: "block.aliasR", opKind: "assign", left: "op.ar.tident", right: "op.ar.999lit" },
    { kind: "csg.op", id: "op.ar.tread", function: "fn.aliasR", block: "block.aliasR", opKind: "identifier", name: "t" },
    { kind: "csg.op", id: "op.ar.branch", function: "fn.aliasR", block: "block.aliasR", opKind: "branch_if", condition: "op.ar.tread", thenBlock: "block.aliasR.then" },
    { kind: "csg.op", id: "op.ar.targ", function: "fn.aliasR", block: "block.aliasR.then", opKind: "identifier", name: "t" },
    { kind: "csg.op", id: "op.ar.call", function: "fn.aliasR", block: "block.aliasR.then", opKind: "call", callee: "window.clearTimeout", arguments: ["op.ar.targ"] },
    { kind: "csg.data", id: "op.ar.nulldata", dataKind: "null", value: null },
    { kind: "csg.op", id: "op.ar.nulllit", function: "fn.aliasR", block: "block.aliasR.then", opKind: "literal", data: "op.ar.nulldata" },
    { kind: "csg.op", id: "op.ar.ref2", function: "fn.aliasR", block: "block.aliasR.then", opKind: "identifier", name: "voiceIceFlushTimerRef" },
    { kind: "csg.op", id: "op.ar.write2", function: "fn.aliasR", block: "block.aliasR.then", opKind: "property_write", name: "current", receiver: "op.ar.ref2", value: "op.ar.nulllit" },
  ];
  const sceneFacts = [eventHandlerFact("aliasReassignHandler")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile: ${JSON.stringify(cht.skips)}`);
  assert.match(cht.code, /var t = __chtRef_voiceIceFlushTimerRef/, "t must be declared as a one-time copy of the ref's slot var");
  assert.match(cht.code, /t = int64\(999\)/, "t's reassignment must be its own local write");
  assert.match(cht.code, /if t != int64\(0\):/, "the branch condition must read t's OWN (reassigned) value, not the ref's live slot");
  assert.match(cht.code, /chengHostClearTimeout\(t\)/, "the call must pass t's own value, never a re-substituted ref.current read");
});

// ADV-3: white-list-external method call on `.current` (`window.cancelAnimationFrame(x.current)`,
// not a CHT_HOST_BRIDGES entry). The ref's classification (declared-type fallback) fires
// independent of the CALLEE, but the CALL itself must fail honestly (a real codegen error, never
// fv-unknown / never silently swallowed or no-op'd).
await check("ADV-3: non-whitelisted callee (window.cancelAnimationFrame) reading .current fails as a real codegen error, never fv-unknown", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("rafRef", 1, "number"),
    ...handlerBindingFacts("cancelRafHandler", "fn.cancelRaf", 10),
    { kind: "csg.op", id: "op.craf.ref", function: "fn.cancelRaf", block: "block.cancelRaf", opKind: "identifier", name: "rafRef" },
    { kind: "csg.op", id: "op.craf.cur", function: "fn.cancelRaf", block: "block.cancelRaf", opKind: "property_read", name: "current", receiver: "op.craf.ref" },
    { kind: "csg.op", id: "op.craf.call", function: "fn.cancelRaf", block: "block.cancelRaf", opKind: "call", callee: "window.cancelAnimationFrame", arguments: ["op.craf.cur"] },
    { kind: "csg.data", id: "op.craf.nulldata", dataKind: "null", value: null },
    { kind: "csg.op", id: "op.craf.nulllit", function: "fn.cancelRaf", block: "block.cancelRaf", opKind: "literal", data: "op.craf.nulldata" },
    { kind: "csg.op", id: "op.craf.ref2", function: "fn.cancelRaf", block: "block.cancelRaf", opKind: "identifier", name: "rafRef" },
    { kind: "csg.op", id: "op.craf.write", function: "fn.cancelRaf", block: "block.cancelRaf", opKind: "property_write", name: "current", receiver: "op.craf.ref2", value: "op.craf.nulllit" },
  ];
  const sceneFacts = [eventHandlerFact("cancelRafHandler")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const skip = cht.skips.find((s) => s.name === "cancelRafHandler");
  assert.ok(skip, "must fail (no codegen for window.cancelAnimationFrame)");
  assert.doesNotMatch(skip.reason, /fv-unknown/, `must be a real codegen error, not fv-unknown: ${JSON.stringify(skip)}`);
  assert.match(skip.reason, /unsupported callee 'window\.cancelAnimationFrame'/, JSON.stringify(skip));
});

// ADV-4: cross-handler contamination — Handler A does the clean clear-shape on `pollutedRef`
// (compiles fine standalone). Handler B (SAME ref name) does an objectLike usage
// (`pollutedRef.current.someMethod()`) that poisons classification GLOBALLY for the ref name
// (refUsageByName merges by name across ALL handlers, pre-existing mechanism-11-era architecture,
// unmodified by mechanism 16) — Handler A's otherwise-valid usage must ALSO be disqualified
// (fail closed), never silently split/partial.
await check("ADV-4: cross-handler contamination — objectLike usage in Handler B poisons Handler A's otherwise-valid classification of the SAME ref name", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("pollutedRef", 1, "number"),
    ...handlerBindingFacts("cleanHandlerA", "fn.cleanA", 10),
    { kind: "csg.op", id: "op.ca.ref", function: "fn.cleanA", block: "block.cleanA", opKind: "identifier", name: "pollutedRef" },
    { kind: "csg.op", id: "op.ca.cur", function: "fn.cleanA", block: "block.cleanA", opKind: "property_read", name: "current", receiver: "op.ca.ref" },
    { kind: "csg.op", id: "op.ca.branch", function: "fn.cleanA", block: "block.cleanA", opKind: "branch_if", condition: "op.ca.cur", thenBlock: "block.cleanA.then" },
    { kind: "csg.data", id: "op.ca.nulldata", dataKind: "null", value: null },
    { kind: "csg.op", id: "op.ca.nulllit", function: "fn.cleanA", block: "block.cleanA.then", opKind: "literal", data: "op.ca.nulldata" },
    { kind: "csg.op", id: "op.ca.ref2", function: "fn.cleanA", block: "block.cleanA.then", opKind: "identifier", name: "pollutedRef" },
    { kind: "csg.op", id: "op.ca.write", function: "fn.cleanA", block: "block.cleanA.then", opKind: "property_write", name: "current", receiver: "op.ca.ref2", value: "op.ca.nulllit" },
    ...handlerBindingFacts("dirtyHandlerB", "fn.dirtyB", 20),
    { kind: "csg.op", id: "op.db.ref", function: "fn.dirtyB", block: "block.dirtyB", opKind: "identifier", name: "pollutedRef" },
    { kind: "csg.op", id: "op.db.cur", function: "fn.dirtyB", block: "block.dirtyB", opKind: "property_read", name: "current", receiver: "op.db.ref" },
    { kind: "csg.op", id: "op.db.method", function: "fn.dirtyB", block: "block.dirtyB", opKind: "call", memberName: "someMethod", receiver: "op.db.cur", arguments: [] },
  ];
  const sceneFacts = [eventHandlerFact("cleanHandlerA"), eventHandlerFact("dirtyHandlerB")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const skipA = cht.skips.find((s) => s.name === "cleanHandlerA");
  assert.ok(skipA, `Handler A's otherwise-valid usage must be poisoned by Handler B's objectLike usage on the same ref name (fail closed): ${JSON.stringify(cht.skips)}`);
  assert.equal(skipA.reason, "fv-unknown:pollutedRef", JSON.stringify(skipA));
  assert.doesNotMatch(cht.code || "", /__chtRef_pollutedRef/, "must never partially compile a poisoned ref");
});

process.stdout.write(`PASS (${passed}/4)\n`);
