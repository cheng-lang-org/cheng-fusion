// scene-runtime-smoke-source.mech8-activevoicesession.test.mjs
//
// 离线单测: mechanism 8's new "activeVoiceSession" entry (CHT_LOCAL_DERIVED_VALUES). Hand-authored
// synthetic CsgFact fixtures, same convention as scene-runtime-smoke-source.mech8.test.mjs.
//
// Mirrors ChessPage.tsx:462-467:
//   const activeVoiceSession = useMemo<RealtimeCallSession | null>(() => {
//       if (!activeVoiceSessionId) return null;
//       return roomVoiceSessions.find((session) => session.sessionId === activeVoiceSessionId) ?? null;
//   }, [activeVoiceSessionId, roomVoiceSessions]);
//
// `activeVoiceSession` is a useMemo-bound local (not useState/useRef/route-param), so it falls
// through every existing resolveOneFreeVar branch to fv-unknown UNLESS registered here — mechanism
// 8's dependency table is keyed purely by free-var NAME (see resolveOneFreeVar's own doc comment),
// so it applies identically regardless of whether the real JS binding is a plain `const` or a
// `useMemo` result; only the registered `deps`/`emit` matter.
//
// The RHS is a linear scan (multi-statement), which does not fit CHT_LOCAL_DERIVED_VALUES' own
// single-expression `emit()` contract — so `emit()` stays a one-line call into a hand-written
// top-level helper (`__csg_scene_find_voice_session_by_id`), the SAME contract roomConversationId's
// entry already uses (a single spliced expression), never touching the emit() signature itself.
//
// 2 cases:
//   1. positive  — both deps resolve (roomVoiceSessions: useState<RealtimeCallSession[]> complex-
//                  JSON slot; activeVoiceSessionId: useState<str>) -> handler compiles, the
//                  generated code calls the real find-by-id helper and declares it exactly once.
//   2. negative  — a dependency (activeVoiceSessionId) has no state backing at all -> the WHOLE
//                  derived value fails closed: handler stays uncompiled, reason is
//                  fv-unknown:activeVoiceSession (never a fabricated null/zero session).
//
// Usage: node scripts/scene-runtime-smoke-source.mech8-activevoicesession.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

function typeDeclFact() {
  return {
    kind: "csg.type_decl", id: "type.rccsession", name: "RealtimeCallSession", declKind: "interface",
    members: [{ name: "sessionId", optional: false, type: "string" }],
  };
}

// Component owner + `useState<RealtimeCallSession[]>` (roomVoiceSessions) +
// `useState<string>` (activeVoiceSessionId, only when includeActiveVoiceSessionIdState) +
// `const handleTestClose = () => { ...references activeVoiceSession... }`.
function componentFacts(handlerBodyOps, includeActiveVoiceSessionIdState) {
  const facts = [
    typeDeclFact(),
    { kind: "csg.function", id: "fn.component", name: "ChessPageTest", parameters: [], returnType: "void" },
    {
      kind: "csg.op", id: "op.useState1.call", function: "fn.component", block: "block.component",
      opKind: "call", ordinal: 1, callee: "useState",
      returnType: "[RealtimeCallSession[], React.Dispatch<React.SetStateAction<RealtimeCallSession[]>>]",
      arguments: [],
    },
    {
      kind: "csg.op", id: "op.useState1.value", function: "fn.component", block: "block.component",
      opKind: "binding_extract", ordinal: 2, source: "op.useState1.call", path: [{ index: 0 }], name: "roomVoiceSessions",
    },
    {
      kind: "csg.op", id: "op.useState1.setter", function: "fn.component", block: "block.component",
      opKind: "binding_extract", ordinal: 3, source: "op.useState1.call", path: [{ index: 1 }], name: "setRoomVoiceSessions",
    },
  ];
  if (includeActiveVoiceSessionIdState) {
    facts.push(
      {
        kind: "csg.op", id: "op.useState2.call", function: "fn.component", block: "block.component",
        opKind: "call", ordinal: 4, callee: "useState",
        returnType: "[string, React.Dispatch<React.SetStateAction<string>>]",
        arguments: [],
      },
      {
        kind: "csg.op", id: "op.useState2.value", function: "fn.component", block: "block.component",
        opKind: "binding_extract", ordinal: 5, source: "op.useState2.call", path: [{ index: 0 }], name: "activeVoiceSessionId",
      },
      {
        kind: "csg.op", id: "op.useState2.setter", function: "fn.component", block: "block.component",
        opKind: "binding_extract", ordinal: 6, source: "op.useState2.call", path: [{ index: 1 }], name: "setActiveVoiceSessionId",
      },
    );
  }
  facts.push(
    { kind: "csg.op", id: "op.h.fnvalue", function: "fn.component", block: "block.component", opKind: "function_value", ordinal: 7, targetFunction: "fn.handleTestClose" },
    { kind: "csg.op", id: "op.h.localwrite", function: "fn.component", block: "block.component", opKind: "local_write", ordinal: 8, name: "handleTestClose", value: "op.h.fnvalue" },
    // "<anonymous>" (not "handleTestClose") — see mech8.test.mjs's own note: naming the fn fact
    // itself would make the dependency-closure regex misparse the emitted function's own header.
    { kind: "csg.function", id: "fn.handleTestClose", name: "<anonymous>", parameters: [], returnType: "RealtimeCallSession" },
    ...handlerBodyOps,
  );
  return facts;
}

function sceneFacts() {
  return [{ kind: "csg.web.scene.event_handler", effect: "invoke:handleTestClose", routeIndex: 0, nodeId: 0 }];
}

function handlerBody() {
  return [
    { kind: "csg.op", id: "op.h.fv", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 1, name: "activeVoiceSession" },
    { kind: "csg.op", id: "op.h.ret", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 2, value: "op.h.fv" },
  ];
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

// ---------------------------------------------------------------------------
// 1. Positive: both deps resolve -> handler compiles, the derived value's helper call appears in
//    the output, and the hand-written find-by-id helper is declared exactly once.
await check("positive: activeVoiceSession resolves and compiles", async () => {
  const coreFacts = componentFacts(handlerBody(), true);
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts());
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.deepEqual(cht.names, ["handleTestClose"]);
  assert.match(cht.code, /__csg_scene_find_voice_session_by_id\(/, "derived expression must call the real find-by-id helper, not a placeholder");
  const helperDefCount = (cht.code.match(/^fn __csg_scene_find_voice_session_by_id\(/gm) || []).length;
  assert.equal(helperDefCount, 1, "the helper must be declared exactly once even though it's referenced from the call args");
  assert.match(cht.code, /fn __csg_scene_find_voice_session_by_id\(sessions: RealtimeCallSession\[\], sessionId: str\): RealtimeCallSession =/);
  assert.match(cht.code, /if sessions\[i\]\.sessionId == sessionId:/, "must compare by the real sessionId field, never a fabricated match");
});

// ---------------------------------------------------------------------------
// 2. Negative: activeVoiceSessionId has NO state backing at all (useState omitted) ->
//    resolveOneFreeVar fails that dependency -> the WHOLE derived value fails closed: handler
//    stays uncompiled, reason keyed on the TOP-LEVEL name "activeVoiceSession" (never a fabricated
//    null/zero-value session spliced in as a fallback).
await check("negative: unresolved dependency fails the whole derived value, no fabrication", async () => {
  const coreFacts = componentFacts(handlerBody(), false);
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts());
  assert.equal(cht.count, 0, "handler must NOT compile when a dependency is unresolvable");
  assert.deepEqual(cht.names, []);
  assert.equal(cht.skips.length, 1);
  assert.equal(cht.skips[0].name, "handleTestClose");
  assert.equal(cht.skips[0].reason, "fv-unknown:activeVoiceSession", "reason must key on the TOP-LEVEL free-var name, not the failed dep 'activeVoiceSessionId'");
  assert.equal(cht.code, "", "zero handlers compiled -> zero generated code, nothing fabricated");
});

process.stdout.write(`PASS (${passed}/2)\n`);
