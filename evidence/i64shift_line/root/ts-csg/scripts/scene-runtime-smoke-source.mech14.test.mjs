// scene-runtime-smoke-source.mech14.test.mjs
//
// 离线单测: mechanism 14 (React useRef<T | null> struct ref — ChessPage.tsx iceConfigRef family)
// — hand-authored synthetic CsgFact fixtures, same convention as scene-runtime-smoke-source.mech11/
// mech12/mech13.test.mjs (import the target .mjs's exported pure entry point, feed it a minimal
// fixture, assert on the real return value — no mocking of the mechanism itself).
//
// Mirrors ChessPage.tsx:382 `const iceConfigRef = useRef<WebRtcIceConfig | null>(null)`, used only
// via the three whitelisted shapes (verified against a REAL extraction of UniMaker's own
// ChessPage.tsx via unimaker-one-click.mjs --stop-after materialize, op-by-op — see the mechanism
// 14 recon verdict §2.1):
//   ① bare read as an if-condition (truthy) : if (iceConfigRef.current) { ... }   (ChessPage.tsx:617)
//   ② bare read as a return value            : return iceConfigRef.current       (ChessPage.tsx:618)
//   ③ null write (release)                   : iceConfigRef.current = null       (implicit shape,
//        same "= null | undefined" sentinel every other box-ref family already supports)
//   ④ typed-identifier write                 : iceConfigRef.current = config     (ChessPage.tsx:621,
//        `config`'s OWN declaring local_write carries typeText — real extractor output shows an
//        import("...").-prefixed form for a cross-file-inferred type, see test 5 below)
//
// Op-shape provenance mirrors mech13's own file header exactly (same `nx`/`nx2` positional-vs-ID-
// backreference contract already established/regression-locked there) — this file adds no new
// extraction-side shape, only a new TS TYPE (struct, not scalar) riding the SAME `.current`
// bare-read/null-write/typed-identifier-write op shapes.
//
// ★shape ④ status (adversarial-review finding, post-implementation): the .mjs CLASSIFIER admits a
// ref into structBoxRefs whenever the write value's TS-DECLARED typeText string-equals the ref's
// TS-declared type (both post stripImportPrefixes) — a name-level match only. It says nothing
// about the CHENG type each side maps to. `inferLocalType`'s generic TypeMapper path names a
// project TS interface struct by its OWN TS name (e.g. "WebRtcIceConfig", auto-emitted via
// emitStructs() — which per the recon verdict §2.3 silently drops `iceServers` there too), a
// DIFFERENT Cheng nominal type than a struct box-ref's hand-written codec struct (e.g.
// "scene.WebSceneWebRtcIceConfigRecord"). A direct stage3 system-link-exec + execute repro proved
// that emitting the raw `slot = value` assignment across these two distinct Cheng struct types
// compiles cleanly and SILENTLY CORRUPTS every field (a `relayOnly=true` source flipped to `false`
// in the slot; an unrelated `expiresAtMs=999` source value leaked into the slot's
// `iceServers.len`) — exit 0, no crash, no diagnostic. `ChengFunctionTranspiler`'s struct box-ref
// identifier-write codegen now Cheng-type-checks (`exprType(value) === structBoxRefSlots.get(ref)`)
// before emitting the assignment and fails loudly (`this.fail`) on any mismatch instead — "let it
// crash" over silent corruption. Since nothing today makes a TS-registered interface's auto-mapped
// Cheng type literally equal a hand-written box-ref codec struct's own Cheng type name, shape ④
// currently ALWAYS fails closed for any real struct box-ref (there is no field-bridging codegen
// between "the natural Cheng type a TS interface auto-maps to" and "the box-ref's hand-written
// Cheng type" — a genuine open design gap the recon verdict's §3 storage proposal never actually
// specified: how `loadWebRtcIceConfig()`'s host value becomes a `WebSceneWebRtcIceConfigRecord` in
// the first place). Tests 1b/5/6 below assert this fail-closed behavior explicitly rather than
// pretend shape ④ works end-to-end — shapes ①②③ (read/condition/null-write) and the KV codec
// itself are unaffected and independently stage3-verified (see src/tests/mech14_webrtc_iceconfig_
// smoke.cheng).
//
// Usage: node scripts/scene-runtime-smoke-source.mech14.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

function componentFn() {
  return { kind: "csg.function", id: "fn.component", name: "ChessPageTest", parameters: [], returnType: "void" };
}

// Real `csg.type_decl` facts for WebRtcIceConfig/WebRtcTurnServer (app/libp2p/webrtcIceConfig.ts:
// 10-22, matching the recon verdict §2.2 field-by-field extraction) — needed so `inferLocalType`'s
// TypeMapper path resolves shape ④'s local var to a genuine registered struct (not an
// undefined-type fallthrough), faithfully reproducing the real extraction shape used in the
// adversarial-review stage3 repro (see the file header note above).
function webRtcIceConfigTypeDeclFacts() {
  return [
    { kind: "csg.type_decl", name: "WebRtcTurnServer", members: [
        { name: "url", type: "string" },
        { name: "username", type: "string" },
        { name: "credential", type: "string" },
    ] },
    { kind: "csg.type_decl", name: "WebRtcIceConfig", members: [
        { name: "relayOnly", type: "boolean" },
        { name: "stunUrls", type: "string[]" },
        { name: "turnServers", type: "WebRtcTurnServer[]" },
        { name: "iceServers", type: "RTCIceServer[]" },
        { name: "expiresAtMs", type: "number | undefined" },
    ] },
  ];
}

// `const <refName> = useRef<T | null>(null)`.
function useRefStructFacts(refName, ordinalBase, declaredTypeText = "WebRtcIceConfig") {
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

// Shape ① `if (<refName>.current) { <thenBlock> }` (bare read as a branch condition).
function ifReadFacts(fid, block, refName, thenBlock, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.branch`, function: fid, block, opKind: "branch_if", condition: `${idBase}.cur`, thenBlock },
  ];
}

// Shape ② `return <refName>.current;` (bare read as a return value).
function returnReadFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.ret`, function: fid, block, opKind: "return", value: `${idBase}.cur` },
  ];
}

// Shape ③ `<refName>.current = null`.
function nullWriteFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.data", id: `${idBase}.null`, dataKind: "null", value: null },
    { kind: "csg.op", id: `${idBase}.nulllit`, function: fid, block, opKind: "literal", data: `${idBase}.null` },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.nulllit` },
  ];
}

// Shape ④ `const <localName>: <declTypeText> = <literal 0>; <refName>.current = <localName>;`
// (typed-identifier write — the shape that carries real type evidence for the struct slot).
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

// An unmodeled shape on `.current`: a real field-level access (`.current.relayOnly`) — no such
// shape exists on the real iceConfigRef (recon verdict §2.1: all 3 real touch points are
// whole-value), so this must trip objectLike and be excluded from every box-ref family, same as
// mech13's own chainedCallFacts proves for a chained CALL.
function fieldReadFacts(fid, block, refName, fieldName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.field`, function: fid, block, opKind: "property_read", name: fieldName, receiver: `${idBase}.cur` },
  ];
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

// ---------------------------------------------------------------------------
// 1a. Positive: the three shapes that ARE end-to-end functional today (if-condition/return/
//    null-write) on the SAME ref, across two handlers, compile — the generated code declares a
//    single KV-synced struct slot var, both handlers share it, the condition reads `.present`,
//    the return reads the whole slot var, and the null-write clears `.present`.
await check("positive: if/return/null-write iceConfigRef shapes compile against a shared struct slot", async () => {
  const coreFacts = [
    componentFn(),
    ...webRtcIceConfigTypeDeclFacts(),
    ...useRefStructFacts("iceConfigRef", 1),
    ...handlerBindingFacts("hydrateIceConfig", "fn.hydrate", 10),
    ...ifReadFacts("fn.hydrate", "block.hyd", "iceConfigRef", "block.thenbody", "h1"),
    { kind: "csg.op", id: "op.h1.blockwrap", function: "fn.hydrate", block: "block.hyd", opKind: "block", nestedBlock: "block.thenbody" },
    ...returnReadFacts("fn.hydrate", "block.thenbody", "iceConfigRef", "h2"),
    ...handlerBindingFacts("releaseIceConfig", "fn.release", 20),
    ...nullWriteFacts("fn.release", "block.rel", "iceConfigRef", "r1"),
  ];
  const sceneFacts = [eventHandlerFact("hydrateIceConfig"), eventHandlerFact("releaseIceConfig")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 2);
  assert.deepEqual(cht.names.slice().sort(), ["hydrateIceConfig", "releaseIceConfig"]);
  assert.match(cht.code, /var __chtRef_iceConfigRef: scene\.WebSceneWebRtcIceConfigRecord/, "must declare a KV-synced struct slot var for iceConfigRef");
  // shape ① — if-condition reads the struct's own `present` field, never a bare struct-as-bool.
  assert.match(cht.code, /if __chtRef_iceConfigRef\.present/, "if-condition read must translate to the struct's present field");
  // shape ② — return-value read resolves to the whole slot var (never `.present`).
  assert.match(cht.code, /return __chtRef_iceConfigRef\b(?!\.present)/, "return-value read must resolve to the whole slot var");
  // KV wiring: single struct slot uses the mechanism-14 codec, no new storage mechanism introduced.
  assert.match(cht.code, /scene\.WebSceneParseWebRtcIceConfigState\(scene\.WebSceneStateValueForRef\(graph, "struct:iceConfigRef"\), __chtRef_iceConfigRef\)/);
  assert.match(cht.code, /scene\.WebSceneSetStateValueInternal\(graph, "struct:iceConfigRef", scene\.WebSceneEncodeWebRtcIceConfigState\(__chtRef_iceConfigRef\), true\)/);
  // shape ③ — null write sets present=false (release path).
  assert.match(cht.code, /__chtRef_iceConfigRef\.present = false/, "null write must clear the present field");
});

// ---------------------------------------------------------------------------
// 1b. Confirmed defect, now guarded: shape ④ (typed-identifier write, ChessPage.tsx:621
//    `iceConfigRef.current = config`) using the REAL WebRtcIceConfig type_decl (so `config`
//    genuinely resolves to the TypeMapper-auto-mapped Cheng struct "WebRtcIceConfig", exactly as
//    the real extraction would) must fail closed — a raw assignment into the box-ref's
//    differently-shaped, hand-written "scene.WebSceneWebRtcIceConfigRecord" slot was proven via a
//    direct stage3 compile+execute repro to silently corrupt fields (relayOnly flips, garbage
//    leaks into iceServers.len). "let it crash", never a partial/best-effort assignment.
await check("shape ④ (typed-identifier write) fails closed on a genuine Cheng-type mismatch, never silently assigns (confirmed via stage3 repro, see file header)", async () => {
  const coreFacts = [
    componentFn(),
    ...webRtcIceConfigTypeDeclFacts(),
    ...useRefStructFacts("iceConfigRef", 1),
    ...handlerBindingFacts("hydrateIceConfig", "fn.hydrate", 10),
    ...typedIdentifierWriteFacts("fn.hydrate", "block.hyd", "iceConfigRef", "config", "WebRtcIceConfig", "h3"),
  ];
  const sceneFacts = [eventHandlerFact("hydrateIceConfig")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, "must not compile: no field-bridging codegen exists between config's auto-mapped struct and the box-ref's hand-written struct");
  assert.equal(cht.skips.length, 1);
  assert.match(cht.skips[0].reason, /transpile-fail:struct box-ref '\.current' write on 'iceConfigRef': value has Cheng type 'WebRtcIceConfig', expected 'scene\.WebSceneWebRtcIceConfigRecord'/, `must fail with the Cheng-type-mismatch diagnostic, not silently assign: ${JSON.stringify(cht.skips)}`);
});

// ---------------------------------------------------------------------------
// 2. Fail-fast: an unregistered struct TS type (a hypothetical "SomeOtherConfig", deliberately NOT
//    in CHT_STRUCT_REF_TYPES) is never admitted, even with the identical shape set that DOES work
//    for WebRtcIceConfig.
await check("fail-fast: an unregistered struct type never gets swept into the struct slot family", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefStructFacts("otherConfigRef", 1, "SomeOtherConfig"),
    ...handlerBindingFacts("releaseOther", "fn.releaseOther", 10),
    ...nullWriteFacts("fn.releaseOther", "block.ro", "otherConfigRef", "ro1"),
    ...typedIdentifierWriteFacts("fn.releaseOther", "block.ro", "otherConfigRef", "otherCfg", "SomeOtherConfig", "ro2"),
  ];
  const sceneFacts = [eventHandlerFact("releaseOther")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, "must not compile: SomeOtherConfig is not a registered struct type");
  assert.equal(cht.skips.length, 1);
  assert.match(cht.skips[0].reason, /fv-unknown:otherConfigRef/, `must fail with fv-unknown, never fabricate a struct slot for an unregistered type: ${JSON.stringify(cht.skips)}`);
});

// ---------------------------------------------------------------------------
// 3. Fail-fast: a genuine field-level access on `.current` (`.current.relayOnly`) — no such shape
//    exists on the real iceConfigRef (all 3 real touch points are whole-value) — still trips
//    objectLike and is excluded from every box-ref family, mirroring mech13's own chained-call
//    regression (test 4 there) generalized from a CALL chain to a field-READ chain.
await check("fail-fast: a field-level read on .current (.current.relayOnly) is excluded (objectLike), not swept into the struct slot family", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefStructFacts("fieldTouchedRef", 1),
    ...handlerBindingFacts("touchField", "fn.touchField", 10),
    ...fieldReadFacts("fn.touchField", "block.tf", "fieldTouchedRef", "relayOnly", "tf1"),
  ];
  const sceneFacts = [eventHandlerFact("touchField")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, "must not compile: .current.relayOnly is a field-level access, not a whitelisted bare-read shape");
  assert.equal(cht.skips.length, 1);
  assert.match(cht.skips[0].reason, /fv-unknown:fieldTouchedRef/, `must fail honestly, not silently misroute a field access into the struct family: ${JSON.stringify(cht.skips)}`);
});

// ---------------------------------------------------------------------------
// 4. Fail-fast: a typed-identifier write whose declared type does NOT match the ref's own
//    registered type (a real component-authoring bug, or a ref that's ambiguously written with two
//    different types across its lifetime) excludes the ref from the struct family entirely — never
//    a partial/best-effort match.
await check("fail-fast: a typed-identifier write with a MISMATCHED declared type excludes the ref (never a partial match)", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefStructFacts("mismatchedRef", 1, "WebRtcIceConfig"),
    ...handlerBindingFacts("writeMismatch", "fn.writeMismatch", 10),
    ...typedIdentifierWriteFacts("fn.writeMismatch", "block.wm", "mismatchedRef", "notConfig", "SomeUnrelatedType", "wm1"),
  ];
  const sceneFacts = [eventHandlerFact("writeMismatch")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, "must not compile: the write value's declared type does not match the ref's registered type");
  assert.equal(cht.skips.length, 1);
  assert.match(cht.skips[0].reason, /fv-unknown:mismatchedRef/, `must fail honestly: ${JSON.stringify(cht.skips)}`);
});

// ---------------------------------------------------------------------------
// 5. Implementation trap regression (recon verdict §2.1): the write VALUE's typeText carries a
//    real `import("...").` prefix (as ts-csg's real extractor output shows for a cross-file-
//    inferred type) even though the REF's own `useRef<T | null>` declaration does not — the
//    CLASSIFIER (.mjs, TS-type-name level) must strip it on both sides before matching, or this
//    ref falsely fails closed at the fv-unknown/classification layer with NO chance to even reach
//    the (separately, correctly) Cheng-type-checked codegen layer tested in 1b above. Asserts the
//    classifier layer specifically: the failure reason must be `transpile-fail:` (proving the ref
//    WAS admitted into structBoxRefSlots — stripImportPrefixes matched), never `fv-unknown:`
//    (which would mean the classifier itself regressed).
await check("stripImportPrefixes trap: an import(...)-prefixed write-value typeText still matches the bare-named ref registration at the classifier layer", async () => {
  const coreFacts = [
    componentFn(),
    ...webRtcIceConfigTypeDeclFacts(),
    ...useRefStructFacts("iceConfigRef2", 1, "WebRtcIceConfig"),
    ...handlerBindingFacts("hydrateIceConfig2", "fn.hydrate2", 10),
    ...typedIdentifierWriteFacts("fn.hydrate2", "block.hyd2", "iceConfigRef2", "config2", 'import("$root/app/libp2p/webrtcIceConfig").WebRtcIceConfig', "hi1"),
  ];
  const sceneFacts = [eventHandlerFact("hydrateIceConfig2")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0);
  assert.equal(cht.skips.length, 1);
  assert.match(cht.skips[0].reason, /^transpile-fail:struct box-ref '\.current' write on 'iceConfigRef2'/, `classifier must still admit the ref after stripping import(...) — the failure must come from the Cheng-type-check codegen layer (1b), not fv-unknown (which would mean stripImportPrefixes regressed): ${JSON.stringify(cht.skips)}`);
});

// ---------------------------------------------------------------------------
// 6. Multi-ref isolation: two independent WebRtcIceConfig refs get independent KV keys/slot vars,
//    no cross-talk (mirrors mech11/mech12/mech13's own isolation cases). Null-write only (shape
//    ④'s identifier-write is separately covered, and known to fail closed, by 1b/5 above).
await check("multi-ref isolation: two named WebRtcIceConfig refs get independent KV keys/slot vars", async () => {
  const coreFacts = [
    componentFn(),
    ...webRtcIceConfigTypeDeclFacts(),
    ...useRefStructFacts("iceConfigRefA", 1),
    ...useRefStructFacts("iceConfigRefB", 3),
    ...handlerBindingFacts("releaseBoth", "fn.releaseBoth", 10),
    ...nullWriteFacts("fn.releaseBoth", "block.rb", "iceConfigRefA", "rb1"),
    ...nullWriteFacts("fn.releaseBoth", "block.rb", "iceConfigRefB", "rb2"),
  ];
  const sceneFacts = [eventHandlerFact("releaseBoth")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.match(cht.code, /var __chtRef_iceConfigRefA: scene\.WebSceneWebRtcIceConfigRecord/);
  assert.match(cht.code, /var __chtRef_iceConfigRefB: scene\.WebSceneWebRtcIceConfigRecord/);
  assert.match(cht.code, /"struct:iceConfigRefA"/);
  assert.match(cht.code, /"struct:iceConfigRefB"/);
});

process.stdout.write(`PASS (${passed}/${passed})\n`);
