// scene-runtime-smoke-source.mech21.test.mjs
//
// 离线单测: mechanism 21 (React latest-ref state mirror — ChessPage.tsx latestRoomStateRef ->
// roomState family) — hand-authored synthetic CsgFact fixtures, same convention as
// scene-runtime-smoke-source.mech8/16/20.test.mjs (import the target .mjs's exported pure entry
// point, feed it a minimal fixture, assert on the real return value — no mocking of the
// mechanism itself).
//
// Op-shape provenance (verified against the REAL extraction, tmp/cht-voice-roomstate csgc):
//   - declaration: `const latestRoomStateRef = useRef(roomState)` — local_write whose value is a
//     `useRef` call whose arguments[0] is an `identifier` op named roomState;
//   - sole write: `latestRoomStateRef.current = roomState` — property_write named current whose
//     value is an `identifier` op named roomState, inside a useEffect callback function NOT
//     invoke-reachable from any JSX handler root;
//   - sole read: `const activeRoom = latestRoomStateRef.current;` — property_read named current
//     over a bare identifier receiver, inside leaveCurrentRoom (invoke-reachable).
//
// 4 cases per the task's fail-fast requirement:
//   1. positive — fully compliant mirror: handler compiles; the emitted dispatcher passes the
//      MIRRORED STATE's own KV read as the argument; NO standalone `__chtRef_latestRoomStateRef`
//      box-ref slot is ever declared (the ref owns no slot — the state is the truth source).
//   2. negative (invoke-reachable write) — the same write shape but living INSIDE the handler's
//      own body (invoke-reachable): admission must hard-reject (a compiled-world write has no
//      faithful target), handler stays honest fv-unknown:latestRoomStateRef.
//   3. negative (initial value is NOT the mirrored state) — `useRef(null)`: declaration audit
//      fails, honest fv-unknown.
//   4. negative (`.current.<field>` chain) — `latestRoomStateRef.current.peerId` read directly:
//      field-level mirroring is not this mechanism, admission rejects, honest fv-unknown.
//
// Usage: node scripts/scene-runtime-smoke-source.mech21.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

const ROOM_TYPE = "RealtimeChessRoomTest";

function typeDeclFact() {
  return {
    kind: "csg.type_decl", id: "type.room", name: ROOM_TYPE, declKind: "interface",
    members: [{ name: "peerId", optional: false, type: "string" }],
  };
}

// fn.compA component body + `const [roomState, setRoomState] = useState<RealtimeChessRoomTest | null>(null)`.
function componentWithStateFacts() {
  return [
    { kind: "csg.function", id: "fn.compA", name: "ChessPageTest", parameters: [], returnType: "void" },
    {
      kind: "csg.op", id: "op.useState.call", function: "fn.compA", block: "block.compA",
      opKind: "call", ordinal: 1, callee: "useState",
      returnType: `[${ROOM_TYPE} | null, React.Dispatch<React.SetStateAction<${ROOM_TYPE} | null>>]`,
      arguments: [],
    },
    { kind: "csg.op", id: "op.useState.value", function: "fn.compA", block: "block.compA", opKind: "binding_extract", ordinal: 2, source: "op.useState.call", path: [{ index: 0 }], name: "roomState" },
    { kind: "csg.op", id: "op.useState.setter", function: "fn.compA", block: "block.compA", opKind: "binding_extract", ordinal: 3, source: "op.useState.call", path: [{ index: 1 }], name: "setRoomState" },
  ];
}

// `const latestRoomStateRef = useRef(<initArg>)` inside fn.compA. initArg === "roomState" for the
// compliant mirror; anything else must fail admission.
function mirrorDeclFacts(initArgName) {
  const facts = [
    { kind: "csg.op", id: "op.useRef.call", function: "fn.compA", block: "block.compA", opKind: "call", ordinal: 4, callee: "useRef", arguments: [], returnType: `React.MutableRefObject<${ROOM_TYPE} | null>` },
    { kind: "csg.op", id: "op.useRef.write", function: "fn.compA", block: "block.compA", opKind: "local_write", ordinal: 5, name: "latestRoomStateRef", value: "op.useRef.call" },
  ];
  if (initArgName !== undefined) {
    facts[0].arguments = ["op.useRef.init"];
    facts.push({ kind: "csg.op", id: "op.useRef.init", function: "fn.compA", block: "block.compA", opKind: "identifier", ordinal: 6, name: initArgName });
  }
  return facts;
}

// `<fnId> body: latestRoomStateRef.current = roomState` — the useEffect-callback write shape.
// Placed in a NON-invoke-reachable function (fn.effectA) for the compliant case, or inside the
// handler itself for the reachable-write rejection case.
function mirrorWriteFacts(fnId, tag) {
  return [
    { kind: "csg.op", id: `op.w.ref.${tag}`, function: fnId, block: `block.${tag}`, opKind: "identifier", ordinal: 1, name: "latestRoomStateRef" },
    { kind: "csg.op", id: `op.w.state.${tag}`, function: fnId, block: `block.${tag}`, opKind: "identifier", ordinal: 2, name: "roomState" },
    { kind: "csg.op", id: `op.w.pw.${tag}`, function: fnId, block: `block.${tag}`, opKind: "property_write", ordinal: 3, name: "current", receiver: `op.w.ref.${tag}`, value: `op.w.state.${tag}` },
  ];
}

// Handler binding `const handleTestClose = () => { ... }` inside fn.compA (anonymous arrow — see
// mech8's header for why naming it corrupts the dependency-closure rescan).
function handlerBindingFacts() {
  return [
    { kind: "csg.op", id: "op.h.fnvalue", function: "fn.compA", block: "block.compA", opKind: "function_value", ordinal: 10, targetFunction: "fn.handleTestClose" },
    { kind: "csg.op", id: "op.h.localwrite", function: "fn.compA", block: "block.compA", opKind: "local_write", ordinal: 11, name: "handleTestClose", value: "op.h.fnvalue" },
    { kind: "csg.function", id: "fn.handleTestClose", name: "<anonymous>", parameters: [], returnType: "string" },
  ];
}

// Compliant read body: `const activeRoom = latestRoomStateRef.current; return activeRoom.peerId;`
function handlerBodyBareReadFacts() {
  return [
    { kind: "csg.op", id: "op.h.ref", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 1, name: "latestRoomStateRef" },
    { kind: "csg.op", id: "op.h.cur", function: "fn.handleTestClose", block: "block.h", opKind: "property_read", ordinal: 2, name: "current", receiver: "op.h.ref" },
    { kind: "csg.op", id: "op.h.bind", function: "fn.handleTestClose", block: "block.h", opKind: "local_write", ordinal: 3, name: "activeRoom", value: "op.h.cur" },
    { kind: "csg.op", id: "op.h.room", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 4, name: "activeRoom" },
    { kind: "csg.op", id: "op.h.peer", function: "fn.handleTestClose", block: "block.h", opKind: "property_read", ordinal: 5, name: "peerId", receiver: "op.h.room" },
    { kind: "csg.op", id: "op.h.ret", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 6, value: "op.h.peer" },
  ];
}

// Field-chain read body: `return latestRoomStateRef.current.peerId;` — must fail admission.
function handlerBodyFieldChainFacts() {
  return [
    { kind: "csg.op", id: "op.h.ref", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 1, name: "latestRoomStateRef" },
    { kind: "csg.op", id: "op.h.cur", function: "fn.handleTestClose", block: "block.h", opKind: "property_read", ordinal: 2, name: "current", receiver: "op.h.ref" },
    { kind: "csg.op", id: "op.h.peer", function: "fn.handleTestClose", block: "block.h", opKind: "property_read", ordinal: 3, name: "peerId", receiver: "op.h.cur" },
    { kind: "csg.op", id: "op.h.ret", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 4, value: "op.h.peer" },
  ];
}

const sceneFacts = () => [{ kind: "csg.web.scene.event_handler", effect: "invoke:handleTestClose", routeIndex: 0, nodeId: 0 }];

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

// ---------------------------------------------------------------------------
// 1. Positive: fully compliant mirror — compiles; the argument handed to the compiled fn is the
//    MIRRORED STATE's own KV read; no standalone box-ref slot for the ref is ever declared.
await check("positive: admitted mirror compiles, arg is the mirrored state's own read", async () => {
  const coreFacts = [
    typeDeclFact(),
    ...componentWithStateFacts(),
    ...mirrorDeclFacts("roomState"),
    { kind: "csg.function", id: "fn.effectA", name: "<anonymous>", parameters: [], returnType: "void" },
    ...mirrorWriteFacts("fn.effectA", "e"),
    ...handlerBindingFacts(),
    ...handlerBodyBareReadFacts(),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts());
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.deepEqual(cht.names, ["handleTestClose"]);
  assert.ok(
    cht.code.includes(`__chtFromJson_${ROOM_TYPE}(chtParseJsonNode(scene.WebSceneStateValueForRef(graph, "roomState")))`),
    "the dispatcher arg must be the MIRRORED STATE's own KV read, not any ref slot",
  );
  assert.ok(cht.code.includes("latestRoomStateRef"), "the ref name carries the injected parameter");
  assert.ok(!cht.code.includes("__chtRef_latestRoomStateRef"), "a mirror ref owns NO box-ref slot of its own");
});

// ---------------------------------------------------------------------------
// 2. Negative (invoke-reachable write): the same `.current = roomState` write but inside the
//    handler's OWN body — invoke-reachable, so a compiled-world write would have no faithful
//    target. Admission hard-rejects; honest fv-unknown, zero fabrication.
await check("negative: invoke-reachable write disqualifies the mirror", async () => {
  const coreFacts = [
    typeDeclFact(),
    ...componentWithStateFacts(),
    ...mirrorDeclFacts("roomState"),
    ...handlerBindingFacts(),
    ...handlerBodyBareReadFacts(),
    ...mirrorWriteFacts("fn.handleTestClose", "h"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts());
  assert.equal(cht.count, 0, "an invoke-reachable `.current =` write must disqualify the mirror");
  assert.deepEqual(cht.names, []);
  assert.equal(cht.skips.length, 1);
  assert.equal(cht.skips[0].reason, "fv-unknown:latestRoomStateRef");
  assert.equal(cht.code, "");
});

// ---------------------------------------------------------------------------
// 3. Negative (initial value is NOT the mirrored state): `useRef(null)` — the declaration audit's
//    initial-value check fails; the name keeps its honest fv-unknown.
await check("negative: non-state initial value fails declaration audit", async () => {
  const coreFacts = [
    typeDeclFact(),
    ...componentWithStateFacts(),
    ...mirrorDeclFacts(undefined), // useRef() — no state identifier argument at all
    { kind: "csg.function", id: "fn.effectA", name: "<anonymous>", parameters: [], returnType: "void" },
    ...mirrorWriteFacts("fn.effectA", "e"),
    ...handlerBindingFacts(),
    ...handlerBodyBareReadFacts(),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts());
  assert.equal(cht.count, 0);
  assert.equal(cht.skips.length, 1);
  assert.equal(cht.skips[0].reason, "fv-unknown:latestRoomStateRef");
});

// ---------------------------------------------------------------------------
// 4. Negative (`.current.<field>` chain): `latestRoomStateRef.current.peerId` — field-level
//    mirroring is NOT this mechanism; admission rejects, never silently widens.
await check("negative: `.current.<field>` chain fails admission, never widened", async () => {
  const coreFacts = [
    typeDeclFact(),
    ...componentWithStateFacts(),
    ...mirrorDeclFacts("roomState"),
    { kind: "csg.function", id: "fn.effectA", name: "<anonymous>", parameters: [], returnType: "void" },
    ...mirrorWriteFacts("fn.effectA", "e"),
    ...handlerBindingFacts(),
    ...handlerBodyFieldChainFacts(),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts());
  assert.equal(cht.count, 0, "field-level mirroring must stay unadmitted");
  assert.equal(cht.skips.length, 1);
  assert.equal(cht.skips[0].reason, "fv-unknown:latestRoomStateRef");
});

process.stdout.write(`mech21 ref-state-mirror: ${passed}/4 checks passed\n`);
