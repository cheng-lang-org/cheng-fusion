// scene-runtime-smoke-source.mech15.test.mjs
//
// 离线单测: mechanism 15 (React useRef opaque host-handle ref — ChessPage.tsx peerConnectionRef
// family) — hand-authored synthetic CsgFact fixtures, same convention as scene-runtime-smoke-
// source.mech13/mech14.test.mjs (import the target .mjs's exported pure entry point, feed it a
// minimal fixture, assert on the real return value — no mocking of the mechanism itself).
//
// Op-shape provenance (verified against the REAL ts-csg extractor output on UniMaker's own
// ChessPage.tsx via `unimaker-one-click.mjs --stop-after materialize`, op-by-op — see
// mech15_impl_r2_verdict.md §... for the full dump — not a standalone fixture guess):
//   - `!peerConnectionRef.current.remoteDescription` (flushPendingIceCandidates): a direct
//     `property_read` chained on `.current` (receiver backreference matches).
//   - `peerConnectionRef.current.addIceCandidate(candidate)` / `.setRemoteDescription(desc)`
//     (flushPendingIceCandidates / handleIncomingVoiceAnswer): confirmed by an exhaustive scan of
//     ALL 28 real `peerConnectionRef` identifier occurrences that neither of these actually trips
//     objectLike under the PRE-mechanism-15 code — ts-csg emits a 1-arg call's own argument
//     sub-expression immediately before the call op itself (the same ordering mechanism 13's own
//     header comment already documents for `.push(...xs)`), so the positionally-adjacent op after
//     `.current` is the ARGUMENT, not the call — only the `.remoteDescription` bare property-read
//     chain (no intervening argument) actually flips objectLike today. The whitelist covers all
//     three shapes anyway per the recon's explicit design (defense in depth against that positional
//     quirk ever being fixed elsewhere) — tests 1/2 below prove the CURRENTLY-live gate
//     (`.remoteDescription`) never trips objectLike; test 3 proves an unregistered/non-whitelisted
//     member still does.
//   - `const connection = peerConnectionRef.current; peerConnectionRef.current = null; if
//     (connection) { connection.onicecandidate = null; connection.onconnectionstatechange = null;
//     connection.oniceconnectionstatechange = null; connection.ontrack = null; try {
//     connection.close() } catch {} }` (releaseVoiceRuntime, ChessPage.tsx 689-700) — the ONLY
//     peerConnectionRef touch actually inside handleClose's transitive closure. The alias
//     (`connection`) is NOT a ref name, so this whole subtree is invisible to the objectLike scan
//     regardless of shape (confirmed by the same 28-occurrence scan) — its correctness is instead
//     the transpiler's tryFoldHandleTeardown, tested in 4/5 below.
//
// mech15 r3: tests 6/7 below are the permanent regression form of the r2-review adversarial
// finding (`mech15_review_a_m15r2_verdict.md` — REFUTED: stale-alias fold, exit=99 in stage3) —
// `handleAliasSource` registered an alias by NAME and never re-checked value identity, so a LATER
// write to the same name (reassignment, or a lexical-block-shadowing redeclaration) that happened
// to precede a shape-identical `if (<name>) {...}` guard would fold on a stale value. The two op
// shapes below are copied verbatim (down to `opKind`/field names) from a REAL `--emit=csg-core`
// dump of a small standalone .tsx fixture containing both patterns (not a guess):
//   - reassignment (`connection = 999;` after `let connection = ...`) compiles to an
//     `opKind:"assign"` op whose `left` is a SEPARATE `identifier` op named `connection` — NOT a
//     second `local_write`.
//   - lexical block shadow (`{ const connection = 999; }`) compiles to an ordinary
//     `opKind:"local_write"` (`declarationKind:"const"`) living inside a nested block reached via
//     a `{opKind:"block", nestedBlock}` wrapper op in the outer block — same `function` id as the
//     outer scope, and (like every op in the same function) numbered from the SAME per-function
//     monotonic `ordinal` counter the extractor assigns to every op regardless of block
//     (`context.nextOp` in csg-core.ts's `emitOp`).
//
// Usage: node scripts/scene-runtime-smoke-source.mech15.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

function componentFn() {
  return { kind: "csg.function", id: "fn.component", name: "ChessPageTest", parameters: [], returnType: "void" };
}

function useRefFacts(refName, ordinalBase, declaredTypeText = "RTCPeerConnection") {
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

// `const <localName>: <declTypeText> = <literal 0>; <refName>.current = <localName>;` (typed-
// identifier write — mirrors mech13's own fixture; the shape that gives the ref real type evidence).
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

// `return <refName>.current;` (bare read, always resolvable once the ref has a Cheng type).
function returnReadFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.ret`, function: fid, block, opKind: "return", value: `${idBase}.cur` },
  ];
}

// `return <refName>.current.<memberName>;` — a direct chained property read (the `.remoteDescription`
// shape). Real semantics is `!x.current.remoteDescription`; the unary wrapper is irrelevant to the
// objectLike scan (it only inspects the op immediately following `.current`), so it is omitted here.
function directChainPropReadFacts(fid, block, refName, memberName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.field`, function: fid, block, opKind: "property_read", name: memberName, receiver: `${idBase}.cur` },
    { kind: "csg.op", id: `${idBase}.ret`, function: fid, block, opKind: "return", value: `${idBase}.field` },
  ];
}

// `<refName>.current.<memberName>(<argCount literal args>);` — a direct chained method call
// (the `.addIceCandidate(candidate)` / `.setRemoteDescription(desc)` shapes, argCount=1; also used
// for the non-whitelisted `.createOffer()` negative case with argCount=0).
function directChainCallFacts(fid, block, refName, memberName, argCount, tag) {
  const idBase = `op.${tag}`;
  const argIds = [];
  const facts = [];
  for (let i = 0; i < argCount; i++) {
    facts.push({ kind: "csg.data", id: `${idBase}.argdata${i}`, dataKind: "number", value: i });
    facts.push({ kind: "csg.op", id: `${idBase}.arg${i}`, function: fid, block, opKind: "literal", data: `${idBase}.argdata${i}` });
    argIds.push(`${idBase}.arg${i}`);
  }
  facts.push({ kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName });
  facts.push({ kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` });
  facts.push({ kind: "csg.op", id: `${idBase}.call`, function: fid, block, opKind: "call", callee: `${refName}.current.${memberName}`, memberName, receiver: `${idBase}.cur`, arguments: argIds, argumentCount: argCount });
  return facts;
}

// The full alias-teardown idiom (ChessPage.tsx releaseVoiceRuntime 689-700):
//   const <aliasName> = <refName>.current;
//   <refName>.current = null;
//   if (<aliasName>) {
//       <aliasName>.<eventProps[0]> = null; ...; <aliasName>.<eventProps[n-1]> = null;
//       try { <aliasName>.<closeMethod>() } catch {}
//   }
// `thenBlock`/`tryBlock`/`catchBlock` are caller-supplied block ids (catchBlock is left with zero
// ops — a real empty `catch {}`).
function aliasTeardownFacts(fid, block, refName, declTypeText, aliasName, eventProps, closeMethod, thenBlock, tryBlock, catchBlock, tag) {
  const idBase = `op.${tag}`;
  const facts = [
    { kind: "csg.op", id: `${idBase}.ref1`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur1`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref1` },
    { kind: "csg.op", id: `${idBase}.aliasdecl`, function: fid, block, opKind: "local_write", name: aliasName, value: `${idBase}.cur1`, typeText: `${declTypeText} | null`, declarationKind: "const" },
    { kind: "csg.data", id: `${idBase}.null1`, dataKind: "null", value: null },
    { kind: "csg.op", id: `${idBase}.nulllit1`, function: fid, block, opKind: "literal", data: `${idBase}.null1` },
    { kind: "csg.op", id: `${idBase}.ref2`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write2`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref2`, value: `${idBase}.nulllit1` },
    { kind: "csg.op", id: `${idBase}.condref`, function: fid, block, opKind: "identifier", name: aliasName },
    { kind: "csg.op", id: `${idBase}.branch`, function: fid, block, opKind: "branch_if", condition: `${idBase}.condref`, thenBlock },
  ];
  eventProps.forEach((prop, i) => {
    facts.push({ kind: "csg.data", id: `${idBase}.pnull${i}`, dataKind: "null", value: null });
    facts.push({ kind: "csg.op", id: `${idBase}.pnulllit${i}`, function: fid, block: thenBlock, opKind: "literal", data: `${idBase}.pnull${i}` });
    facts.push({ kind: "csg.op", id: `${idBase}.pref${i}`, function: fid, block: thenBlock, opKind: "identifier", name: aliasName });
    facts.push({ kind: "csg.op", id: `${idBase}.pwrite${i}`, function: fid, block: thenBlock, opKind: "property_write", name: prop, receiver: `${idBase}.pref${i}`, value: `${idBase}.pnulllit${i}` });
  });
  facts.push({ kind: "csg.op", id: `${idBase}.closeref`, function: fid, block: tryBlock, opKind: "identifier", name: aliasName });
  facts.push({ kind: "csg.op", id: `${idBase}.closecall`, function: fid, block: tryBlock, opKind: "call", callee: `${aliasName}.${closeMethod}`, memberName: closeMethod, receiver: `${idBase}.closeref`, arguments: [], argumentCount: 0 });
  facts.push({ kind: "csg.op", id: `${idBase}.try`, function: fid, block: thenBlock, opKind: "try", tryBlock, catchBlock });
  return facts;
}

// mech15 r3 permanent regression (test 6): the alias-teardown idiom with an INTERVENING
// reassignment (`connection = 999;`, real shape verified = `opKind:"assign"` whose `left` is a
// separate `identifier` op named `connection`) between the alias declaration and the guarded
// `if`. Every op carries an explicit, strictly-increasing `ordinal` (a plain counter — mirrors the
// extractor's real per-function monotonic `context.nextOp`, not guessed) so the interference check
// has real position data to work with.
function aliasTeardownWithReassignFacts(fid, block, refName, declTypeText, aliasName, eventProps, closeMethod, thenBlock, tryBlock, catchBlock, tag) {
  let n = 0;
  const ord = () => n++;
  const idBase = `op.${tag}`;
  const facts = [
    { kind: "csg.op", id: `${idBase}.ref1`, function: fid, block, opKind: "identifier", name: refName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.cur1`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref1`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.aliasdecl`, function: fid, block, opKind: "local_write", name: aliasName, value: `${idBase}.cur1`, typeText: `${declTypeText} | null`, declarationKind: "let", ordinal: ord() },
    { kind: "csg.data", id: `${idBase}.null1`, dataKind: "null", value: null },
    { kind: "csg.op", id: `${idBase}.nulllit1`, function: fid, block, opKind: "literal", data: `${idBase}.null1`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.ref2`, function: fid, block, opKind: "identifier", name: refName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.write2`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref2`, value: `${idBase}.nulllit1`, ordinal: ord() },
    // INJECTED (the ONLY deviation from the positive-fold shape above): `connection = 999;` — a
    // real `opKind:"assign"` statement, `left` pointing at its OWN `identifier` op (not a
    // `local_write`), sitting strictly between the alias decl and the branch condition below.
    { kind: "csg.data", id: `${idBase}.escapeVal`, dataKind: "number", value: 999 },
    { kind: "csg.op", id: `${idBase}.escapelit`, function: fid, block, opKind: "literal", data: `${idBase}.escapeVal`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.assignlhs`, function: fid, block, opKind: "identifier", name: aliasName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.reassign`, function: fid, block, opKind: "assign", operator: "FirstAssignment", left: `${idBase}.assignlhs`, right: `${idBase}.escapelit`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.condref`, function: fid, block, opKind: "identifier", name: aliasName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.branch`, function: fid, block, opKind: "branch_if", condition: `${idBase}.condref`, thenBlock, ordinal: ord() },
  ];
  eventProps.forEach((prop, i) => {
    facts.push({ kind: "csg.data", id: `${idBase}.pnull${i}`, dataKind: "null", value: null });
    facts.push({ kind: "csg.op", id: `${idBase}.pnulllit${i}`, function: fid, block: thenBlock, opKind: "literal", data: `${idBase}.pnull${i}`, ordinal: ord() });
    facts.push({ kind: "csg.op", id: `${idBase}.pref${i}`, function: fid, block: thenBlock, opKind: "identifier", name: aliasName, ordinal: ord() });
    facts.push({ kind: "csg.op", id: `${idBase}.pwrite${i}`, function: fid, block: thenBlock, opKind: "property_write", name: prop, receiver: `${idBase}.pref${i}`, value: `${idBase}.pnulllit${i}`, ordinal: ord() });
  });
  facts.push({ kind: "csg.op", id: `${idBase}.closeref`, function: fid, block: tryBlock, opKind: "identifier", name: aliasName, ordinal: ord() });
  facts.push({ kind: "csg.op", id: `${idBase}.closecall`, function: fid, block: tryBlock, opKind: "call", callee: `${aliasName}.${closeMethod}`, memberName: closeMethod, receiver: `${idBase}.closeref`, arguments: [], argumentCount: 0, ordinal: ord() });
  facts.push({ kind: "csg.op", id: `${idBase}.try`, function: fid, block: thenBlock, opKind: "try", tryBlock, catchBlock, ordinal: ord() });
  return facts;
}

// mech15 r3 permanent regression (test 7): the alias-teardown idiom with an INTERVENING
// lexical-block-shadowing redeclaration (`{ const connection = 999; }`) between the alias
// declaration and the guarded `if` — real shape verified = an ordinary `opKind:"local_write"`
// (`declarationKind:"const"`) inside a SEPARATE nested block (`shadowBlock`) reached via a
// `{opKind:"block", nestedBlock}` wrapper op sitting in the outer block, same `function` id
// throughout. This is legal, common TypeScript (a fresh block-scoped binding does not violate the
// outer `const`) — the interference check must catch it exactly like the reassignment form, purely
// from `ordinal` position, with zero awareness of block/scope nesting.
function aliasTeardownWithShadowFacts(fid, block, refName, declTypeText, aliasName, eventProps, closeMethod, shadowBlock, thenBlock, tryBlock, catchBlock, tag) {
  let n = 0;
  const ord = () => n++;
  const idBase = `op.${tag}`;
  const facts = [
    { kind: "csg.op", id: `${idBase}.ref1`, function: fid, block, opKind: "identifier", name: refName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.cur1`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref1`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.aliasdecl`, function: fid, block, opKind: "local_write", name: aliasName, value: `${idBase}.cur1`, typeText: `${declTypeText} | null`, declarationKind: "const", ordinal: ord() },
    { kind: "csg.data", id: `${idBase}.null1`, dataKind: "null", value: null },
    { kind: "csg.op", id: `${idBase}.nulllit1`, function: fid, block, opKind: "literal", data: `${idBase}.null1`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.ref2`, function: fid, block, opKind: "identifier", name: refName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.write2`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref2`, value: `${idBase}.nulllit1`, ordinal: ord() },
    // INJECTED (the ONLY deviation from the positive-fold shape above): `{ const connection = 999;
    // }` — a bare nested block that lexically shadows `connection` with an unrelated value.
    { kind: "csg.op", id: `${idBase}.shadowwrap`, function: fid, block, opKind: "block", nestedBlock: shadowBlock, ordinal: ord() },
    { kind: "csg.data", id: `${idBase}.shadowVal`, dataKind: "number", value: 999 },
    { kind: "csg.op", id: `${idBase}.shadowlit`, function: fid, block: shadowBlock, opKind: "literal", data: `${idBase}.shadowVal`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.shadowdecl`, function: fid, block: shadowBlock, opKind: "local_write", name: aliasName, value: `${idBase}.shadowlit`, typeText: "number", declarationKind: "const", ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.condref`, function: fid, block, opKind: "identifier", name: aliasName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.branch`, function: fid, block, opKind: "branch_if", condition: `${idBase}.condref`, thenBlock, ordinal: ord() },
  ];
  eventProps.forEach((prop, i) => {
    facts.push({ kind: "csg.data", id: `${idBase}.pnull${i}`, dataKind: "null", value: null });
    facts.push({ kind: "csg.op", id: `${idBase}.pnulllit${i}`, function: fid, block: thenBlock, opKind: "literal", data: `${idBase}.pnull${i}`, ordinal: ord() });
    facts.push({ kind: "csg.op", id: `${idBase}.pref${i}`, function: fid, block: thenBlock, opKind: "identifier", name: aliasName, ordinal: ord() });
    facts.push({ kind: "csg.op", id: `${idBase}.pwrite${i}`, function: fid, block: thenBlock, opKind: "property_write", name: prop, receiver: `${idBase}.pref${i}`, value: `${idBase}.pnulllit${i}`, ordinal: ord() });
  });
  facts.push({ kind: "csg.op", id: `${idBase}.closeref`, function: fid, block: tryBlock, opKind: "identifier", name: aliasName, ordinal: ord() });
  facts.push({ kind: "csg.op", id: `${idBase}.closecall`, function: fid, block: tryBlock, opKind: "call", callee: `${aliasName}.${closeMethod}`, memberName: closeMethod, receiver: `${idBase}.closeref`, arguments: [], argumentCount: 0, ordinal: ord() });
  facts.push({ kind: "csg.op", id: `${idBase}.try`, function: fid, block: thenBlock, opKind: "try", tryBlock, catchBlock, ordinal: ord() });
  return facts;
}

// mech15 r5 permanent regression (test 8): `for_of` own iteration variable name collision with the
// alias name (`const connection = peerConnectionRef.current; peerConnectionRef.current = null; for
// (const connection of items) { if (connection) {...4props+try/close...} }`) — the alias-teardown
// guard now reads the LOOP's per-iteration array element, never the real handle. This is the class
// r4's own author found in self-audit (mech15_impl_r4_verdict.md §3 point 7,
// `functionHasOtherWriteToName` gained an explicit `op.opKind === "for_of" && op.initializerName ===
// name` branch to catch it) but did NOT commit a permanent regression test for — flagged REFUTED by
// the r4 adversarial review (`mech15_impl_r4_verdict.md`, review-b §3: surgical short-circuit that
// disables ONLY the `for_of` branch, leaving `local_write`/`assign` untouched, left all 10
// then-committed regression tests green). Op shapes (outer real alias decl + unrelated `for_of` over
// an inline array literal whose OWN `initializerName` shadows the alias, guard living inside the loop
// body) copied verbatim from `mech15_r4v_b_m15r4v/ts-csg/scripts/adv-r4-forofvar-and-nested.mjs`
// (scenario 1, independently authored by the r4 adversarial reviewer, not the r4 author) — includes
// that probe's own two documented pitfalls: `for_of`'s body op field is `bodyBlock`, not `body`; a
// function-level early-return short-circuit trips TS `TS18048` null-narrowing on unreachable code, so
// any live short-circuit probing must gate at runtime (`process.env`), never at compile-time.
function forofLoopVarCollisionFacts(fid, outerBlock, refName, aliasName, itemsRefName, eventProps, closeMethod, loopBodyBlock, thenBlock, tryBlock, catchBlock, tag) {
  let n = 0;
  const ord = () => n++;
  const idBase = `op.${tag}`;
  const facts = [
    // outer alias decl: `const connection = peerConnectionRef.current;` — the real registration
    // trigger `functionHasOtherWriteToName` is consulted for.
    { kind: "csg.op", id: `${idBase}.ref1`, function: fid, block: outerBlock, opKind: "identifier", name: refName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.cur1`, function: fid, block: outerBlock, opKind: "property_read", name: "current", receiver: `${idBase}.ref1`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.aliasdecl`, function: fid, block: outerBlock, opKind: "local_write", name: aliasName, value: `${idBase}.cur1`, typeText: "RTCPeerConnection | null", declarationKind: "const", ordinal: ord() },
    { kind: "csg.data", id: `${idBase}.null1`, dataKind: "null", value: null },
    { kind: "csg.op", id: `${idBase}.nulllit1`, function: fid, block: outerBlock, opKind: "literal", data: `${idBase}.null1`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.ref2`, function: fid, block: outerBlock, opKind: "identifier", name: refName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.write2`, function: fid, block: outerBlock, opKind: "property_write", name: "current", receiver: `${idBase}.ref2`, value: `${idBase}.nulllit1`, ordinal: ord() },
    // UNRELATED for_of loop over an inline array literal `[111, 222, 333]` (avoids the dispatcher's
    // own unrelated parameter-type gate — event-handler-bound functions don't accept array params),
    // own iteration var name COLLIDES with the alias name.
    { kind: "csg.data", id: `${idBase}.item0`, dataKind: "number", value: 111 },
    { kind: "csg.data", id: `${idBase}.item1`, dataKind: "number", value: 222 },
    { kind: "csg.data", id: `${idBase}.item2`, dataKind: "number", value: 333 },
    { kind: "csg.op", id: `${idBase}.item0op`, function: fid, block: outerBlock, opKind: "literal", data: `${idBase}.item0`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.item1op`, function: fid, block: outerBlock, opKind: "literal", data: `${idBase}.item1`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.item2op`, function: fid, block: outerBlock, opKind: "literal", data: `${idBase}.item2`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.itemsid`, function: fid, block: outerBlock, opKind: "array_literal", elements: [`${idBase}.item0op`, `${idBase}.item1op`, `${idBase}.item2op`], spreadFlags: [false, false, false], ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.forof`, function: fid, block: outerBlock, opKind: "for_of", iterable: `${idBase}.itemsid`, initializerName: aliasName, bodyBlock: loopBodyBlock, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.condref`, function: fid, block: loopBodyBlock, opKind: "identifier", name: aliasName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.branch`, function: fid, block: loopBodyBlock, opKind: "branch_if", condition: `${idBase}.condref`, thenBlock, ordinal: ord() },
  ];
  eventProps.forEach((prop, i) => {
    facts.push({ kind: "csg.data", id: `${idBase}.pnull${i}`, dataKind: "null", value: null });
    facts.push({ kind: "csg.op", id: `${idBase}.pnulllit${i}`, function: fid, block: thenBlock, opKind: "literal", data: `${idBase}.pnull${i}`, ordinal: ord() });
    facts.push({ kind: "csg.op", id: `${idBase}.pref${i}`, function: fid, block: thenBlock, opKind: "identifier", name: aliasName, ordinal: ord() });
    facts.push({ kind: "csg.op", id: `${idBase}.pwrite${i}`, function: fid, block: thenBlock, opKind: "property_write", name: prop, receiver: `${idBase}.pref${i}`, value: `${idBase}.pnulllit${i}`, ordinal: ord() });
  });
  facts.push({ kind: "csg.op", id: `${idBase}.closeref`, function: fid, block: tryBlock, opKind: "identifier", name: aliasName, ordinal: ord() });
  facts.push({ kind: "csg.op", id: `${idBase}.closecall`, function: fid, block: tryBlock, opKind: "call", callee: `${aliasName}.${closeMethod}`, memberName: closeMethod, receiver: `${idBase}.closeref`, arguments: [], argumentCount: 0, ordinal: ord() });
  facts.push({ kind: "csg.op", id: `${idBase}.try`, function: fid, block: thenBlock, opKind: "try", tryBlock, catchBlock, ordinal: ord() });
  return facts;
}

// mech15 r5 permanent regression (test 9, low-cost addition alongside test 8 — NOT in r4's own
// 8-scenario self-audit list, first constructed by the r4 adversarial review, `mech15_impl_r4_verdict.md`
// review-b §2 scenario 2): the SAME name-collision class buried TWO block-nesting levels deep — an
// UNRELATED outer `for_of` loop contains a NESTED inner `for_of` loop whose OWN iteration variable
// collides with the alias name, while the real alias decl+guard live in the outer function body.
// Probes whether `functionHasOtherWriteToName`'s whole-function op scan actually reaches ops nested
// two blocks deep, not just the direct child block — this is optional per r4 review-b §5 ("单层已经
// 是...最小闭环所需的下限"), added here because the fixture is already built and the marginal cost of
// locking it down permanently is near zero.
function nestedForofCollisionFacts(fid, outerBlock, refName, aliasName, declTypeText, eventProps, closeMethod, outerLoopBody, innerLoopBody, thenBlock, tryBlock, catchBlock, tag) {
  let n = 0;
  const ord = () => n++;
  const idBase = `op.${tag}`;
  const facts = [
    { kind: "csg.op", id: `${idBase}.ref1`, function: fid, block: outerBlock, opKind: "identifier", name: refName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.cur1`, function: fid, block: outerBlock, opKind: "property_read", name: "current", receiver: `${idBase}.ref1`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.aliasdecl`, function: fid, block: outerBlock, opKind: "local_write", name: aliasName, value: `${idBase}.cur1`, typeText: `${declTypeText} | null`, declarationKind: "const", ordinal: ord() },
    { kind: "csg.data", id: `${idBase}.null1`, dataKind: "null", value: null },
    { kind: "csg.op", id: `${idBase}.nulllit1`, function: fid, block: outerBlock, opKind: "literal", data: `${idBase}.null1`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.ref2`, function: fid, block: outerBlock, opKind: "identifier", name: refName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.write2`, function: fid, block: outerBlock, opKind: "property_write", name: "current", receiver: `${idBase}.ref2`, value: `${idBase}.nulllit1`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.condref`, function: fid, block: outerBlock, opKind: "identifier", name: aliasName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.branch`, function: fid, block: outerBlock, opKind: "branch_if", condition: `${idBase}.condref`, thenBlock, ordinal: ord() },
    // an UNRELATED outer for_of over an inline array literal, nested two levels away from the alias decl.
    { kind: "csg.data", id: `${idBase}.oitem0`, dataKind: "number", value: 7 },
    { kind: "csg.data", id: `${idBase}.oitem1`, dataKind: "number", value: 8 },
    { kind: "csg.op", id: `${idBase}.oitem0op`, function: fid, block: outerBlock, opKind: "literal", data: `${idBase}.oitem0`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.oitem1op`, function: fid, block: outerBlock, opKind: "literal", data: `${idBase}.oitem1`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.outeritemsid`, function: fid, block: outerBlock, opKind: "array_literal", elements: [`${idBase}.oitem0op`, `${idBase}.oitem1op`], spreadFlags: [false, false], ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.outerforof`, function: fid, block: outerBlock, opKind: "for_of", iterable: `${idBase}.outeritemsid`, initializerName: "outerItem", bodyBlock: outerLoopBody, ordinal: ord() },
    // INJECTED, buried inside the outer loop body: an INNER for_of (own inline array literal, NOT
    // the outer scalar loop var — a bare number isn't iterable) whose OWN loop var IS "connection".
    { kind: "csg.data", id: `${idBase}.iitem0`, dataKind: "number", value: 9 },
    { kind: "csg.op", id: `${idBase}.iitem0op`, function: fid, block: outerLoopBody, opKind: "literal", data: `${idBase}.iitem0`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.inneritemsid`, function: fid, block: outerLoopBody, opKind: "array_literal", elements: [`${idBase}.iitem0op`], spreadFlags: [false], ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.innerforof`, function: fid, block: outerLoopBody, opKind: "for_of", iterable: `${idBase}.inneritemsid`, initializerName: aliasName, bodyBlock: innerLoopBody, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.innernoop`, function: fid, block: innerLoopBody, opKind: "identifier", name: aliasName, ordinal: ord() },
  ];
  eventProps.forEach((prop, i) => {
    facts.push({ kind: "csg.data", id: `${idBase}.pnull${i}`, dataKind: "null", value: null });
    facts.push({ kind: "csg.op", id: `${idBase}.pnulllit${i}`, function: fid, block: thenBlock, opKind: "literal", data: `${idBase}.pnull${i}`, ordinal: ord() });
    facts.push({ kind: "csg.op", id: `${idBase}.pref${i}`, function: fid, block: thenBlock, opKind: "identifier", name: aliasName, ordinal: ord() });
    facts.push({ kind: "csg.op", id: `${idBase}.pwrite${i}`, function: fid, block: thenBlock, opKind: "property_write", name: prop, receiver: `${idBase}.pref${i}`, value: `${idBase}.pnulllit${i}`, ordinal: ord() });
  });
  facts.push({ kind: "csg.op", id: `${idBase}.closeref`, function: fid, block: tryBlock, opKind: "identifier", name: aliasName, ordinal: ord() });
  facts.push({ kind: "csg.op", id: `${idBase}.closecall`, function: fid, block: tryBlock, opKind: "call", callee: `${aliasName}.${closeMethod}`, memberName: closeMethod, receiver: `${idBase}.closeref`, arguments: [], argumentCount: 0, ordinal: ord() });
  facts.push({ kind: "csg.op", id: `${idBase}.try`, function: fid, block: thenBlock, opKind: "try", tryBlock, catchBlock, ordinal: ord() });
  return facts;
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

// ---------------------------------------------------------------------------
// 1. Positive: the whitelisted `.remoteDescription` direct chain does NOT trip objectLike — a
//    SEPARATE handler on the SAME ref that only does a typed-write + bare read (fully compilable)
//    still classifies as a scalar int64 handle slot despite the chained touch existing elsewhere in
//    the corpus (objectLike is aggregated FILE-WIDE by ref name, not per-handler — mechanism 14's own
//    documented trap).
await check("positive: whitelisted .remoteDescription direct-chain read does not poison peerConnectionRef's file-wide objectLike classification", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("peerConnectionRef", 1),
    ...handlerBindingFacts("touchRemoteDescription", "fn.touch", 10),
    ...directChainPropReadFacts("fn.touch", "block.touch", "peerConnectionRef", "remoteDescription", "t1"),
    ...handlerBindingFacts("typedRoundTrip", "fn.trip", 20),
    ...typedIdentifierWriteFacts("fn.trip", "block.trip", "peerConnectionRef", "connection", "RTCPeerConnection", "tr1"),
    ...returnReadFacts("fn.trip", "block.trip", "peerConnectionRef", "tr2"),
  ];
  const sceneFacts = [eventHandlerFact("touchRemoteDescription"), eventHandlerFact("typedRoundTrip")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const tripSkip = cht.skips.find((s) => s.name === "typedRoundTrip");
  assert.equal(tripSkip, undefined, `typedRoundTrip must compile (objectLike must stay false): ${JSON.stringify(cht.skips)}`);
  assert.match(cht.code, /var __chtRef_peerConnectionRef: int64/, "must declare a KV-synced int64 slot var for peerConnectionRef");
  // touchRemoteDescription itself is honestly NOT promised to compile (no subfield-access codegen
  // exists for a scalar int64 handle slot) — but it must fail for THAT reason, never fv-unknown
  // (which would mean the classifier itself rejected the ref).
  const touchSkip = cht.skips.find((s) => s.name === "touchRemoteDescription");
  if (touchSkip !== undefined) assert.doesNotMatch(touchSkip.reason, /fv-unknown:peerConnectionRef/, `touchRemoteDescription must not fail classification: ${JSON.stringify(touchSkip)}`);
});

// ---------------------------------------------------------------------------
// 2. Positive: the whitelisted `.addIceCandidate`/`.setRemoteDescription` (1-arg call) direct chains
//    also do not poison the classification (same file-wide aggregation check as test 1).
await check("positive: whitelisted .addIceCandidate(1 arg)/.setRemoteDescription(1 arg) direct-chain calls do not poison peerConnectionRef's classification", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("peerConnectionRef", 1),
    ...handlerBindingFacts("touchAddIce", "fn.touchAdd", 10),
    ...directChainCallFacts("fn.touchAdd", "block.touchAdd", "peerConnectionRef", "addIceCandidate", 1, "ta1"),
    ...handlerBindingFacts("touchSetRemote", "fn.touchSet", 20),
    ...directChainCallFacts("fn.touchSet", "block.touchSet", "peerConnectionRef", "setRemoteDescription", 1, "ts1"),
    ...handlerBindingFacts("typedRoundTrip2", "fn.trip2", 30),
    ...typedIdentifierWriteFacts("fn.trip2", "block.trip2", "peerConnectionRef", "connection", "RTCPeerConnection", "tr21"),
    ...returnReadFacts("fn.trip2", "block.trip2", "peerConnectionRef", "tr22"),
  ];
  const sceneFacts = [eventHandlerFact("touchAddIce"), eventHandlerFact("touchSetRemote"), eventHandlerFact("typedRoundTrip2")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const tripSkip = cht.skips.find((s) => s.name === "typedRoundTrip2");
  assert.equal(tripSkip, undefined, `typedRoundTrip2 must compile (objectLike must stay false): ${JSON.stringify(cht.skips)}`);
  assert.match(cht.code, /var __chtRef_peerConnectionRef: int64/);
});

// ---------------------------------------------------------------------------
// 3. Regression lock: a NON-whitelisted member (.createOffer(), 0 args — not in
//    CHT_HANDLE_DEREF_WHITELIST) on the SAME handle-typed ref still trips objectLike — proving the
//    whitelist is exact, not a blanket exemption for every RTCPeerConnection member.
await check("regression: a non-whitelisted member (.createOffer()) on an RTCPeerConnection ref still trips objectLike (stays fv-unknown)", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("peerConnectionRef", 1),
    ...handlerBindingFacts("touchCreateOffer", "fn.touchCO", 10),
    ...directChainCallFacts("fn.touchCO", "block.touchCO", "peerConnectionRef", "createOffer", 0, "co1"),
    ...handlerBindingFacts("typedRoundTrip3", "fn.trip3", 20),
    ...typedIdentifierWriteFacts("fn.trip3", "block.trip3", "peerConnectionRef", "connection", "RTCPeerConnection", "tr31"),
    ...returnReadFacts("fn.trip3", "block.trip3", "peerConnectionRef", "tr32"),
  ];
  const sceneFacts = [eventHandlerFact("touchCreateOffer"), eventHandlerFact("typedRoundTrip3")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const tripSkip = cht.skips.find((s) => s.name === "typedRoundTrip3");
  assert.ok(tripSkip, "typedRoundTrip3 must NOT compile: .createOffer() is not whitelisted, so peerConnectionRef must stay objectLike");
  assert.match(tripSkip.reason, /fv-unknown:peerConnectionRef/, `must fail with fv-unknown: ${JSON.stringify(tripSkip)}`);
});

// ---------------------------------------------------------------------------
// 4. Positive: the full alias-teardown idiom (releaseVoiceRuntime 689-700) folds into ONE host
//    bridge call over the int64 handle — the handler fully compiles (zero skips), the folded call
//    text is exact, and NONE of the 4 raw event-property writes or the try/catch survive in the
//    generated code (proving the WHOLE block was replaced, not partially modeled).
await check("positive: alias-teardown idiom folds into one chengHostRtcPeerConnectionTeardown call, whole handler compiles", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("peerConnectionRef", 1),
    ...handlerBindingFacts("ensurePeer", "fn.ensure", 10),
    ...typedIdentifierWriteFacts("fn.ensure", "block.ensure", "peerConnectionRef", "connection", "RTCPeerConnection", "e1"),
    ...handlerBindingFacts("releaseVoiceRuntime", "fn.release", 20),
    ...aliasTeardownFacts(
      "fn.release", "block.release", "peerConnectionRef", "RTCPeerConnection", "connection",
      ["onicecandidate", "onconnectionstatechange", "oniceconnectionstatechange", "ontrack"], "close",
      "block.release.then", "block.release.try", "block.release.catch", "r1",
    ),
  ];
  const sceneFacts = [eventHandlerFact("ensurePeer"), eventHandlerFact("releaseVoiceRuntime")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.match(cht.code, /if connection != int64\(0\):\s*\n\s*chengHostRtcPeerConnectionTeardown\(connection\)/, "must fold into exactly one guarded bridge call");
  assert.match(cht.code, /@importc\("cheng_host_rtc_peer_connection_teardown"\)/, "the bridge's own @importc contract head must be pulled into the generated program");
  assert.doesNotMatch(cht.code, /onicecandidate|onconnectionstatechange|oniceconnectionstatechange|ontrack/, "none of the 4 raw event-property writes may survive — the whole block must be replaced");
  assert.doesNotMatch(cht.code, /try:|catch:|\.close\(\)/, "the raw try/catch/.close() must never be emitted — only the folded bridge call");
});

// ---------------------------------------------------------------------------
// 5. Regression lock: a NEAR-MISS shape (event properties in the WRONG order) must NOT fold — the
//    exact-match requirement is real, not a loose heuristic. Falls through to the generic path and
//    fails loud (no codegen exists for a property write on a plain int64 receiver), never silently
//    mistranslated.
await check("regression: a reordered event-property sequence does not fold, fails loud instead of silently mistranslating", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("peerConnectionRef", 1),
    ...handlerBindingFacts("ensurePeer2", "fn.ensure2", 10),
    ...typedIdentifierWriteFacts("fn.ensure2", "block.ensure2", "peerConnectionRef", "connection", "RTCPeerConnection", "e2"),
    ...handlerBindingFacts("releaseVoiceRuntimeBad", "fn.releaseBad", 20),
    ...aliasTeardownFacts(
      "fn.releaseBad", "block.releaseBad", "peerConnectionRef", "RTCPeerConnection", "connection",
      // ontrack swapped to the front — same 4 members, wrong order.
      ["ontrack", "onconnectionstatechange", "oniceconnectionstatechange", "onicecandidate"], "close",
      "block.releaseBad.then", "block.releaseBad.try", "block.releaseBad.catch", "rb1",
    ),
  ];
  const sceneFacts = [eventHandlerFact("ensurePeer2"), eventHandlerFact("releaseVoiceRuntimeBad")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const badSkip = cht.skips.find((s) => s.name === "releaseVoiceRuntimeBad");
  assert.ok(badSkip, "reordered shape must NOT compile (must not silently fold or silently mistranslate)");
  assert.doesNotMatch(cht.code || "", /chengHostRtcPeerConnectionTeardown/, "must not fold a non-exact shape");
});

// ---------------------------------------------------------------------------
// 6. mech15 r3 permanent regression (absorbed from the r2-review adversarial finding,
//    mech15_review_a_m15r2_verdict.md — REFUTED): a reassignment (`connection = 999;`) between the
//    alias declaration and the shape-identical teardown guard must NOT fold on the stale value.
//    Before the r3 fix this compiled clean and folded `chengHostRtcPeerConnectionTeardown(999)` —
//    stage3 real-run proof is in mech15-handle-teardown-stage3.test.mjs.
await check("r3 regression: reassignment between alias decl and teardown guard must not fold on a stale value", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("peerConnectionRef", 1),
    ...handlerBindingFacts("ensurePeerReassign", "fn.ensureReassign", 10),
    ...typedIdentifierWriteFacts("fn.ensureReassign", "block.ensureReassign", "peerConnectionRef", "connection", "RTCPeerConnection", "er1"),
    ...handlerBindingFacts("releaseVoiceRuntimeEscapeReassign", "fn.escapeReassign", 20),
    ...aliasTeardownWithReassignFacts(
      "fn.escapeReassign", "block.escapeReassign", "peerConnectionRef", "RTCPeerConnection", "connection",
      ["onicecandidate", "onconnectionstatechange", "oniceconnectionstatechange", "ontrack"], "close",
      "block.escapeReassign.then", "block.escapeReassign.try", "block.escapeReassign.catch", "erx1",
    ),
  ];
  const sceneFacts = [eventHandlerFact("ensurePeerReassign"), eventHandlerFact("releaseVoiceRuntimeEscapeReassign")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.doesNotMatch(cht.code || "", /chengHostRtcPeerConnectionTeardown/, "must NEVER fold on a name that was reassigned between alias decl and guard — value identity is not proven");
  const escapeSkip = cht.skips.find((s) => s.name === "releaseVoiceRuntimeEscapeReassign");
  assert.ok(escapeSkip, "must fail honestly (fall through to the generic path, which fails loud) rather than silently compile with a stale value");
});

// ---------------------------------------------------------------------------
// 7. mech15 r3 permanent regression (absorbed from the r2-review verdict's own remediation note:
//    "注意词法块遮蔽... 也必须失效"): a lexical-block-shadowing redeclaration (`{ const connection =
//    999; }`, legal TypeScript, does not violate the outer binding) between the alias declaration
//    and the teardown guard must ALSO not fold — a fix that only handles direct reassignment and
//    ignores shadowing is explicitly disqualified by the task's own acceptance bar.
await check("r3 regression: lexical-block-shadowing redeclaration between alias decl and teardown guard must not fold on a stale value", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("peerConnectionRef", 1),
    ...handlerBindingFacts("ensurePeerShadow", "fn.ensureShadow", 10),
    ...typedIdentifierWriteFacts("fn.ensureShadow", "block.ensureShadow", "peerConnectionRef", "connection", "RTCPeerConnection", "es1"),
    ...handlerBindingFacts("releaseVoiceRuntimeEscapeShadow", "fn.escapeShadow", 20),
    ...aliasTeardownWithShadowFacts(
      "fn.escapeShadow", "block.escapeShadow", "peerConnectionRef", "RTCPeerConnection", "connection",
      ["onicecandidate", "onconnectionstatechange", "oniceconnectionstatechange", "ontrack"], "close",
      "block.escapeShadow.shadow", "block.escapeShadow.then", "block.escapeShadow.try", "block.escapeShadow.catch", "esx1",
    ),
  ];
  const sceneFacts = [eventHandlerFact("ensurePeerShadow"), eventHandlerFact("releaseVoiceRuntimeEscapeShadow")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.doesNotMatch(cht.code || "", /chengHostRtcPeerConnectionTeardown/, "must NEVER fold on a name shadowed by an unrelated nested-block redeclaration between alias decl and guard");
  const escapeSkip = cht.skips.find((s) => s.name === "releaseVoiceRuntimeEscapeShadow");
  assert.ok(escapeSkip, "must fail honestly (fall through to the generic path, which fails loud) rather than silently compile with a stale value");
});

// ---------------------------------------------------------------------------
// 8. mech15 r5 permanent regression (absorbed from the r4-round adversarial review's REFUTED
//    finding, `mech15_impl_r4_verdict.md` review-b §3-§5): a `for_of` loop's OWN iteration variable
//    name-collides with the alias name (`for (const connection of items) { if (connection) {...} }`)
//    — this class was already fixed in the r4 source (`functionHasOtherWriteToName` gained a
//    `for_of`/`initializerName` branch, r4 author self-audit §3 point 7) but had ZERO permanent
//    regression coverage: the r4 review's surgical short-circuit (disabling ONLY the `for_of`
//    branch, leaving `local_write`/`assign` intact) left every one of the 10 then-committed tests
//    green, proving the fix could silently regress without any CI signal. Must fail to transpile
//    honestly (fold refused) and never emit the bridge call or the handler name.
await check("r5 regression (ex-REFUTED r4 review-b): for_of loop-var name collision with the alias must not fold — handler honestly omitted, no bridge call ever generated", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("peerConnectionRef", 1),
    ...handlerBindingFacts("ensurePeerFV", "fn.ensureFV", 10),
    ...typedIdentifierWriteFacts("fn.ensureFV", "block.ensureFV", "peerConnectionRef", "streamFV", "RTCPeerConnection", "fve1"),
    ...handlerBindingFacts("releaseFVCollision", "fn.releaseFVCollision", 20),
    ...forofLoopVarCollisionFacts(
      "fn.releaseFVCollision", "block.releaseFVCollision", "peerConnectionRef", "connection", "items",
      ["onicecandidate", "onconnectionstatechange", "oniceconnectionstatechange", "ontrack"], "close",
      "block.releaseFVCollision.loopbody", "block.releaseFVCollision.then", "block.releaseFVCollision.try", "block.releaseFVCollision.catch", "fvx1",
    ),
  ];
  const sceneFacts = [eventHandlerFact("ensurePeerFV"), eventHandlerFact("releaseFVCollision")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const skip = cht.skips.find((s) => s.name === "releaseFVCollision");
  assert.ok(skip, `for_of-loopvar-collision handler must fail to transpile honestly (fold refused): skips=${JSON.stringify(cht.skips)}`);
  assert.doesNotMatch(cht.code, /chengHostRtcPeerConnectionTeardown/, "no bridge call may ever be generated for the for_of-loopvar-collision shape");
  assert.doesNotMatch(cht.code, /releaseFVCollision/, "the whole handler must be omitted from the dispatcher, not partially wired");
});

// ---------------------------------------------------------------------------
// 9. mech15 r5 permanent regression (2-layer nested variant, low-cost addition alongside test 8 —
//    NOT in r4's own 8-scenario self-audit list, first constructed by the r4 adversarial review,
//    `mech15_impl_r4_verdict.md` review-b §2 scenario 2, optional per review-b §5 but cheap to lock
//    down): the same collision class buried two block-nesting levels deep (inner `for_of` inside an
//    unrelated outer `for_of`) — probes that the whole-function op scan reaches ops nested two
//    blocks deep, not just the direct child block.
await check("r5 regression (2-level nested, ex-REFUTED r4 review-b §2): loop-var collision buried two block levels deep (inner for_of inside outer for_of) still refuses registration", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("peerConnectionRef", 1),
    ...handlerBindingFacts("ensurePeerNest", "fn.ensureNest", 10),
    ...typedIdentifierWriteFacts("fn.ensureNest", "block.ensureNest", "peerConnectionRef", "streamNest", "RTCPeerConnection", "nte1"),
    ...handlerBindingFacts("releaseNestCollision", "fn.releaseNestCollision", 20),
    ...nestedForofCollisionFacts(
      "fn.releaseNestCollision", "block.releaseNestCollision", "peerConnectionRef", "connection", "RTCPeerConnection",
      ["onicecandidate", "onconnectionstatechange", "oniceconnectionstatechange", "ontrack"], "close",
      "block.releaseNestCollision.outerloop", "block.releaseNestCollision.innerloop",
      "block.releaseNestCollision.then", "block.releaseNestCollision.try", "block.releaseNestCollision.catch", "ntx1",
    ),
  ];
  const sceneFacts = [eventHandlerFact("ensurePeerNest"), eventHandlerFact("releaseNestCollision")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const skip = cht.skips.find((s) => s.name === "releaseNestCollision");
  assert.ok(skip, `nested (2-deep) for_of-loopvar-collision handler must fail to transpile honestly (fold refused): skips=${JSON.stringify(cht.skips)}`);
  assert.doesNotMatch(cht.code, /chengHostRtcPeerConnectionTeardown/, "no bridge call may ever be generated for the nested for_of-loopvar-collision shape");
  assert.doesNotMatch(cht.code, /releaseNestCollision/, "the whole handler must be omitted from the dispatcher, not partially wired");
});

process.stdout.write(`PASS (${passed}/${passed})\n`);
