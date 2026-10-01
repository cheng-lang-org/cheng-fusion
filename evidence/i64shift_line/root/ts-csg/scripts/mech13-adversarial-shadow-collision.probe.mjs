// mech13-adversarial-shadow-collision.probe.mjs
//
// KNOWN-DEFECT PROBE (reviewer-authored, independent adversarial construction, NOT a green-required
// regression test — exits 1 on purpose because the defect is CONFIRMED and NOT yet fixed).
//
// Finding: mechanism 13's `localVarTypeTextByFnAndName` map (scene-runtime-smoke-source.mjs, added
// by mech13_impl.patch) is keyed ONLY by `${functionId} ${localVarName}` — it has no block-scope
// disambiguation. Within a single function, if TWO lexically-distinct local vars happen to share the
// same NAME but carry DIFFERENT declared TS types (one "MediaStream", the other anything else), the
// LAST one encountered in the coreFacts array order silently overwrites the map entry for BOTH. Any
// `.current = x` write elsewhere in that function whose `x` resolves (by name) to the map is then
// typed using whichever declaration happened to win the collision — NOT the declaration that
// actually, lexically, is in scope at that write site.
//
// This directly falsifies the invariant mech13_impl_verdict.md repeats verbatim across every design
// section ("An identifier write whose declaring op's typeText is NOT in this set stays unresolved,
// no fabricated handle" / "hand-audited, never guess"): a ref whose OWN write value's real declared
// type is NOT "MediaStream" can still get silently swept into the int64/MediaStream handle family,
// with zero error, zero skip, purely because an unrelated same-named local elsewhere in the same
// function happens to be MediaStream-typed. Numeric-literal locals (the overwhelmingly common case
// for short generic names like "id"/"value"/"handle"/"count"/"stream") make this a SILENT wrong-value
// bug, not a hard cold-compile type-mismatch crash: Cheng's own type inference for `x` itself derives
// from its literal RHS (int64 for any bare number), which happens to coincide with the wrongly
// inferred slot type, so nothing catches the mismatch at compile time either.
//
// Not observed to currently misfire against real UniMaker source (independently verified via a
// same-HEAD before/after `unimaker-one-click.mjs --stop-after materialize --retained-scene-only`
// extraction: `unimaker-react.csgc`/`.scene.csgc`/`.scene-runtime.cheng` are byte-identical with the
// patch applied or not) — this is a latent architectural defect in the newly-introduced identifier-
// type-lookup helper, not a live miscompile of ChessPage.tsx today. Recommended fix (not applied by
// this review, out of this task's mandate): when two `local_write`/`binding_extract` ops in the same
// function share a name but disagree on typeText, the map must record "ambiguous" (omit the entry)
// rather than last-write-wins — mirrors the existing scalarOk fail-closed contract used everywhere
// else in this classifier family (mech8/11/12) for conflicting-type writes to the SAME ref.
import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

function componentFn() {
  return { kind: "csg.function", id: "fn.component", name: "ChessPageTest", parameters: [], returnType: "void" };
}
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

// ONE function `fn.mixed` with TWO block scopes, each independently declaring a local var named
// `x`, with DIFFERENT declared types, each feeding a DIFFERENT ref's `.current = x` write:
//   blockUnrelated (ordinal 1): const x: SomeUnrelatedThing = 0; unrelatedRef.current = x;
//   blockMedia     (ordinal 5, LATER in fact-array order): const x: MediaStream = 0; localStreamRef.current = x;
// A block-scope-correct classifier must leave `unrelatedRef` UNCLASSIFIED (SomeUnrelatedThing is
// not in CHT_HANDLE_REF_TYPES, and the two `x`s are lexically distinct). If the classifier instead
// resolves purely by (function,name), unrelatedRef's write will incorrectly inherit MediaStream's
// "int64" typing from the LATER, unrelated `x` declaration purely by array-position collision.
function xDeclFacts(fid, block, typeText, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.data", id: `${idBase}.lit`, dataKind: "number", value: 0 },
    { kind: "csg.op", id: `${idBase}.litop`, function: fid, block, opKind: "literal", data: `${idBase}.lit` },
    { kind: "csg.op", id: `${idBase}.decl`, function: fid, block, opKind: "local_write", name: "x", value: `${idBase}.litop`, typeText, declarationKind: "const" },
  ];
}
function refWriteFromXFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.src`, function: fid, block, opKind: "identifier", name: "x" },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.src` },
  ];
}

const coreFacts = [
  componentFn(),
  ...useRefFacts("unrelatedRef", 1, "SomeUnrelatedThing"),
  ...useRefFacts("localStreamRef", 3, "MediaStream"),
  ...handlerBindingFacts("handleMixed", "fn.mixed", 10),
  // block A (unrelated x, FIRST in fact-array order) writes unrelatedRef
  ...xDeclFacts("fn.mixed", "block.a", "SomeUnrelatedThing", "xa"),
  ...refWriteFromXFacts("fn.mixed", "block.a", "unrelatedRef", "wa"),
  // block B (MediaStream x, LATER in fact-array order, shadows block A's `x` in the flat per-fn map) writes localStreamRef
  ...xDeclFacts("fn.mixed", "block.b", "MediaStream", "xb"),
  ...refWriteFromXFacts("fn.mixed", "block.b", "localStreamRef", "wb"),
];
const sceneFacts = [eventHandlerFact("handleMixed")];

const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
console.log("skips:", JSON.stringify(cht.skips));
console.log("count:", cht.count);
console.log("--- generated code (relevant slice) ---");
const lines = cht.code.split("\n").filter(l => /unrelatedRef|localStreamRef|__chtRef_/.test(l));
console.log(lines.join("\n"));

const unrelatedGotTyped = /var __chtRef_unrelatedRef: int64/.test(cht.code);
if (unrelatedGotTyped) {
  console.log("\n*** BUG REPRODUCED: unrelatedRef (SomeUnrelatedThing-typed local) was WRONGLY classified as int64/MediaStream handle family due to (fid,name)-only keying colliding with an UNRELATED block-scoped `x` elsewhere in the same function. ***");
  process.exit(1);
} else {
  console.log("\nNo collision observed: unrelatedRef correctly stayed unclassified (or failed some other way) despite the shared local-var name.");
  process.exit(0);
}
