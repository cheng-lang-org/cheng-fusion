// scene-runtime-smoke-source.mech20.test.mjs
//
// 离线单测: mechanism 20 (component-owner-scoped state slot identity — ChessPage/DouDiZhuPage
// roomState family) — hand-authored synthetic CsgFact fixtures, same convention as
// scene-runtime-smoke-source.mech8/13/14/15/16.test.mjs (import the target .mjs's exported pure
// entry point, feed it a minimal fixture, assert on the real return value — no mocking of the
// mechanism itself).
//
// Provenance (verified against the REAL UniMaker extraction, tmp/cht-voice-roomstate csgc):
//   - ChessPage.tsx:346 `const [roomState, setRoomState] = useState<RealtimeChessRoom | null>(...)`
//     (owner csg.function 33bb8e9a…) and DouDiZhuPage's `useState<RealtimeDoudizhuRoom | null>`
//     (owner 0dd7219c…) share the BARE name `roomState` with DIFFERENT tuple-head types, so the
//     project-wide stateType map (emitStateSlots mech16-r4 ambiguity guard) excludes it — the
//     pre-mech20 skip was exactly `handleClose <- fv-unknown:roomState`.
//   - The event_handler fact's stamped handlerFn resolves to a useCallback local_write owned by
//     the SAME 33bb8e9a… function — the fid->owner exact-identity index the mechanism keys on.
//
// 3 cases per the task's fail-fast requirement:
//   1. positive — handler owned by compA resolves roomState to compA's OWN declared type even
//      though compB declares the same name with a DIFFERENT type (project-wide ambiguous);
//      generated code carries compA's struct reader, never compB's type anywhere.
//   2. negative (owner declares no such state) — a handler owned by compC (no roomState
//      declaration) reading `roomState` stays uncompiled with honest fv-unknown:roomState —
//      proves the fallback is owner-scoped exact identity, never a cross-component first-match.
//   3. negative (no usable owner) — a handler reached ONLY through its stamped handlerFn that was
//      never a local_write target has no fid->owner entry; the owner-scoped fallback is disabled
//      and the name keeps the honest fv-unknown — proves no name-based fallback was added.
//
// Usage: node scripts/scene-runtime-smoke-source.mech20.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

const ROOM_TYPE_A = "RealtimeChessRoomTest";
const ROOM_TYPE_B = "RealtimeDoudizhuRoomTest";

function typeDeclFacts() {
  return [
    { kind: "csg.type_decl", id: "type.roomA", name: ROOM_TYPE_A, declKind: "interface", members: [{ name: "conversationId", optional: false, type: "string" }] },
    { kind: "csg.type_decl", id: "type.roomB", name: ROOM_TYPE_B, declKind: "interface", members: [{ name: "zoneId", optional: false, type: "string" }] },
  ];
}

// `<ownerFid> component body` + `const [roomState, setRoomState] = useState<<roomType> | null>(null)`.
function useStateRoomFacts(ownerFid, roomType, tag) {
  return [
    { kind: "csg.function", id: ownerFid, name: `Component${tag}`, parameters: [], returnType: "void" },
    {
      kind: "csg.op", id: `op.useState.call.${tag}`, function: ownerFid, block: `block.${tag}`,
      opKind: "call", ordinal: 1, callee: "useState",
      returnType: `[${roomType} | null, React.Dispatch<React.SetStateAction<${roomType} | null>>]`,
      arguments: [],
    },
    {
      kind: "csg.op", id: `op.useState.value.${tag}`, function: ownerFid, block: `block.${tag}`,
      opKind: "binding_extract", ordinal: 2, source: `op.useState.call.${tag}`, path: [{ index: 0 }], name: "roomState",
    },
    {
      kind: "csg.op", id: `op.useState.setter.${tag}`, function: ownerFid, block: `block.${tag}`,
      opKind: "binding_extract", ordinal: 3, source: `op.useState.call.${tag}`, path: [{ index: 1 }], name: "setRoomState",
    },
  ];
}

// `const handleTestClose = () => { return roomState.conversationId; }` bound inside <ownerFid>
// (mirrors matchesRoomVoiceSession's real `roomState?.peerId` read — a plain property_read on the
// struct-typed free var exercises the same param typing; `?.` vs `.` is not what this mechanism
// classifies). The arrow stays anonymous, bound only via the local_write — see mech8's header for
// why naming it would corrupt the dependency-closure rescan.
function handlerFacts(ownerFid, tag) {
  return [
    {
      kind: "csg.op", id: `op.h.fnvalue.${tag}`, function: ownerFid, block: `block.${tag}`,
      opKind: "function_value", ordinal: 10, targetFunction: "fn.handleTestClose",
    },
    {
      kind: "csg.op", id: `op.h.localwrite.${tag}`, function: ownerFid, block: `block.${tag}`,
      opKind: "local_write", ordinal: 11, name: "handleTestClose", value: `op.h.fnvalue.${tag}`,
    },
    { kind: "csg.function", id: "fn.handleTestClose", name: "<anonymous>", parameters: [], returnType: "string" },
    { kind: "csg.op", id: "op.h.fv", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 1, name: "roomState" },
    { kind: "csg.op", id: "op.h.read", function: "fn.handleTestClose", block: "block.h", opKind: "property_read", ordinal: 2, name: "conversationId", receiver: "op.h.fv" },
    { kind: "csg.op", id: "op.h.ret", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 3, value: "op.h.read" },
  ];
}

const sceneFacts = [{ kind: "csg.web.scene.event_handler", effect: "invoke:handleTestClose", routeIndex: 0, nodeId: 0 }];

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

// ---------------------------------------------------------------------------
// 1. Positive: compA (RealtimeChessRoomTest) + compB (RealtimeDoudizhuRoomTest) both declare
//    `roomState` — project-wide stateType excludes the name as ambiguous, but the handler is
//    owned by compA, so it resolves to compA's OWN type and compiles. The generated code must
//    carry ONLY compA's struct reader; compB's type must appear nowhere.
await check("positive: owner-scoped resolution beats cross-component ambiguity", async () => {
  const coreFacts = [
    ...typeDeclFacts(),
    ...useStateRoomFacts("fn.compA", ROOM_TYPE_A, "A"),
    ...useStateRoomFacts("fn.compB", ROOM_TYPE_B, "B"),
    ...handlerFacts("fn.compA", "A"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts.map((f) => ({ ...f })));
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.deepEqual(cht.names, ["handleTestClose"]);
  assert.ok(
    cht.code.includes(`__chtFromJson_${ROOM_TYPE_A}(chtParseJsonNode(scene.WebSceneStateValueForRef(graph, "roomState")))`),
    "must read the KV slot through compA's OWN struct reader",
  );
  assert.ok(!cht.code.includes(ROOM_TYPE_B), "compB's type must appear nowhere in the generated code");
});

// ---------------------------------------------------------------------------
// 2. Negative (owner declares no such state): the handler is owned by compC, which declares NO
//    roomState at all. compA/compB still declare it (project-wide ambiguous). The owner-scoped
//    fallback finds nothing for compC -> honest fv-unknown:roomState, zero fabrication.
await check("negative: owner without the declaration keeps honest fv-unknown", async () => {
  const coreFacts = [
    ...typeDeclFacts(),
    ...useStateRoomFacts("fn.compA", ROOM_TYPE_A, "A"),
    ...useStateRoomFacts("fn.compB", ROOM_TYPE_B, "B"),
    { kind: "csg.function", id: "fn.compC", name: "ComponentC", parameters: [], returnType: "void" },
    ...handlerFacts("fn.compC", "C"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts.map((f) => ({ ...f })));
  assert.equal(cht.count, 0, "handler must NOT compile when its own owner declares no roomState");
  assert.deepEqual(cht.names, []);
  assert.equal(cht.skips.length, 1);
  assert.equal(cht.skips[0].name, "handleTestClose");
  assert.equal(cht.skips[0].reason, "fv-unknown:roomState", "no cross-component first-match, no fabrication");
  assert.equal(cht.code, "");
});

// ---------------------------------------------------------------------------
// 3. Negative (no usable owner): the event_handler fact carries a stamped handlerFn whose target
//    was NEVER a local_write target (the fid->owner index has no entry for it). compA declares
//    roomState, but with no owner the owner-scoped fallback is disabled — the name keeps the
//    pre-mechanism honest fv-unknown instead of leaking compA's declaration by name.
await check("negative: no fid->owner entry disables the fallback", async () => {
  const coreFacts = [
    ...typeDeclFacts(),
    ...useStateRoomFacts("fn.compA", ROOM_TYPE_A, "A"),
    // compB keeps the bare name project-wide ambiguous, so the ONLY way roomState could resolve
    // is the owner-scoped fallback itself — this case isolates that path.
    ...useStateRoomFacts("fn.compB", ROOM_TYPE_B, "B"),
    { kind: "csg.function", id: "fn.handlerNoOwner", name: "<anonymous>", parameters: [], returnType: "string" },
    { kind: "csg.op", id: "op.n.fv", function: "fn.handlerNoOwner", block: "block.n", opKind: "identifier", ordinal: 1, name: "roomState" },
    { kind: "csg.op", id: "op.n.read", function: "fn.handlerNoOwner", block: "block.n", opKind: "property_read", ordinal: 2, name: "conversationId", receiver: "op.n.fv" },
    { kind: "csg.op", id: "op.n.ret", function: "fn.handlerNoOwner", block: "block.n", opKind: "return", ordinal: 3, value: "op.n.read" },
  ];
  const stampedScene = [{ kind: "csg.web.scene.event_handler", effect: "invoke:handleTestClose", routeIndex: 0, nodeId: 0, handlerFn: "fn.handlerNoOwner" }];
  const cht = await buildCompiledHandlerTable(coreFacts, stampedScene);
  assert.equal(cht.count, 0, "owner-less handler must NOT borrow another component's declaration");
  assert.equal(cht.skips.length, 1);
  assert.equal(cht.skips[0].reason, "fv-unknown:roomState", "no name-based fallback may substitute for the exact owner identity");
  assert.equal(cht.code, "");
});

process.stdout.write(`mech20 owner-scoped state slot identity: ${passed}/3 checks passed\n`);
