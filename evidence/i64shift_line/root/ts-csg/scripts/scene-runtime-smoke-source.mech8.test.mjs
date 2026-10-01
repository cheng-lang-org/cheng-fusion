// scene-runtime-smoke-source.mech8.test.mjs
//
// 离线单测: mechanism 8 (CHT_LOCAL_DERIVED_VALUES / resolveOneFreeVar) — hand-authored synthetic
// CsgFact fixtures (not run through the real TS extractor), same convention as
// unimaker-device-perf-oracle.v3.test.mjs (import the target .mjs's exported pure entry point,
// feed it a minimal fixture, assert on the real return value — no mocking of the mechanism
// itself). Mirrors ChessPage.tsx:468 `const roomConversationId = roomState?.conversationId ||
// roomId || '';`: roomState is a useState<T|null> complex-JSON slot, roomId is a mechanism-7
// route-param slot.
//
// 3 cases per the task's fail-fast requirement:
//   1. positive          — both deps resolvable -> handler compiles, derived expr in the output.
//   2. dep unresolved     — roomId's route is unlocatable (mechanism 7's own ambiguity check) ->
//                           the WHOLE derived value fails closed, handler stays uncompiled,
//                           skip reason is fv-unknown:roomConversationId (never a fabricated "").
//   3. name not registered — a free var NOT in CHT_LOCAL_DERIVED_VALUES at all falls through to
//                           the pre-existing catch-all, also fv-unknown (proves the table is an
//                           exact-match registry, not a permissive heuristic).
//
// Usage: node scripts/scene-runtime-smoke-source.mech8.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

const REALTIME_ROOM_TYPE = "RealtimeChessRoomTest";

function typeDeclFact() {
  return {
    kind: "csg.type_decl",
    id: "type.rccroom",
    name: REALTIME_ROOM_TYPE,
    declKind: "interface",
    members: [{ name: "conversationId", optional: false, type: "string" }],
  };
}

// Component owner + `const [roomState, setRoomState] = useState<RealtimeChessRoomTest | null>(null)`
// + `const handleTestClose = () => { ...references the free var under test... }`.
function componentFacts(handlerBodyOps, handlerReturnType) {
  return [
    typeDeclFact(),
    { kind: "csg.function", id: "fn.component", name: "ChessPageTest", parameters: [], returnType: "void" },
    {
      kind: "csg.op", id: "op.useState.call", function: "fn.component", block: "block.component",
      opKind: "call", ordinal: 1, callee: "useState",
      returnType: `[${REALTIME_ROOM_TYPE} | null, React.Dispatch<React.SetStateAction<${REALTIME_ROOM_TYPE} | null>>]`,
      arguments: [],
    },
    {
      kind: "csg.op", id: "op.useState.value", function: "fn.component", block: "block.component",
      opKind: "binding_extract", ordinal: 2, source: "op.useState.call", path: [{ index: 0 }], name: "roomState",
    },
    {
      kind: "csg.op", id: "op.useState.setter", function: "fn.component", block: "block.component",
      opKind: "binding_extract", ordinal: 3, source: "op.useState.call", path: [{ index: 1 }], name: "setRoomState",
    },
    {
      kind: "csg.op", id: "op.h.fnvalue", function: "fn.component", block: "block.component",
      opKind: "function_value", ordinal: 4, targetFunction: "fn.handleTestClose",
    },
    {
      kind: "csg.op", id: "op.h.localwrite", function: "fn.component", block: "block.component",
      opKind: "local_write", ordinal: 5, name: "handleTestClose", value: "op.h.fnvalue",
    },
    // The underlying arrow is anonymous in real extraction (`const handleClose = () => {...}`) —
    // "handleTestClose" is bound only via the local_write above, NOT this function's own `name`.
    // Naming it here would register it in functionByName and make the dependency-closure scan
    // (which regexes generated code for `ident(` callee patterns) misparse the emitted function's
    // OWN header line `fn handleTestClose(...)` as a self-call to recompile without injected params.
    { kind: "csg.function", id: "fn.handleTestClose", name: "<anonymous>", parameters: [], returnType: handlerReturnType },
    ...handlerBodyOps,
  ];
}

function sceneFactsWithRoute(routeIndex, routeId) {
  const facts = [
    { kind: "csg.web.scene.event_handler", effect: "invoke:handleTestClose", routeIndex, nodeId: 0 },
  ];
  if (routeId !== undefined) facts.push({ kind: "csg.web.scene.route", routeIndex, routeId });
  return facts;
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

// ---------------------------------------------------------------------------
// 1. Positive: `return roomState?.conversationId || roomId || '';` — both deps resolve
//    (roomState via the state branch, roomId via mechanism 7's route-param branch with a
//    single, unambiguous route) -> handler compiles, derived expr appears in the output.
await check("positive: roomConversationId resolves and compiles", async () => {
  const handlerBody = [
    { kind: "csg.op", id: "op.h.fv", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 1, name: "roomConversationId" },
    { kind: "csg.op", id: "op.h.ret", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 2, value: "op.h.fv" },
  ];
  const coreFacts = componentFacts(handlerBody, "string");
  const sceneFacts = sceneFactsWithRoute(0, "testRoute");
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.deepEqual(cht.names, ["handleTestClose"]);
  // The registered emit() formula, verbatim: struct-decoded roomState's `.conversationId` field
  // checked against "", falling back to the route-param roomId read, falling back to "".
  assert.match(cht.code, /\.conversationId != "" \? \(.*\)\.conversationId : \(.*__csg_route_param\.testRoute\.roomId.*!= "" \?/s,
    "derived expression must splice the real struct-decode + route-param reads, not a placeholder");
  assert.doesNotMatch(cht.code, /"truth-room"/i, "must never bake the truth-room debug sentinel");
});

// ---------------------------------------------------------------------------
// 2. Negative (dependency unresolved): the SAME handler, but with NO matching
//    csg.web.scene.route fact for its routeIndex — resolveRouteIdForHandler("handleTestClose")
//    returns undefined (mechanism 7's own honesty rule), so the roomId dependency fails
//    resolveOneFreeVar. The whole derived value must fail closed: handler stays uncompiled,
//    reason is fv-unknown:roomConversationId (the TOP-LEVEL name, not the dep name "roomId"),
//    and NO fallback/default value is fabricated anywhere in the (empty) output.
await check("negative: unresolved route dep fails the whole derived value, no fabrication", async () => {
  const handlerBody = [
    { kind: "csg.op", id: "op.h.fv", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 1, name: "roomConversationId" },
    { kind: "csg.op", id: "op.h.ret", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 2, value: "op.h.fv" },
  ];
  const coreFacts = componentFacts(handlerBody, "string");
  const sceneFacts = sceneFactsWithRoute(0, undefined); // no route fact -> route unlocatable
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, "handler must NOT compile when a dependency is unresolvable");
  assert.deepEqual(cht.names, []);
  assert.equal(cht.skips.length, 1);
  assert.equal(cht.skips[0].name, "handleTestClose");
  assert.equal(cht.skips[0].reason, "fv-unknown:roomConversationId", "reason must key on the TOP-LEVEL free-var name, not the failed dep 'roomId'");
  assert.equal(cht.code, "", "zero handlers compiled -> zero generated code, nothing fabricated");
});

// ---------------------------------------------------------------------------
// 3. Negative (name not registered): a free var that is NOT in CHT_LOCAL_DERIVED_VALUES at all
//    (and matches no other branch: not state, not a box-ref, not a route-param, not a map-iter
//    var) must fall through to the pre-existing fv-unknown catch-all exactly as before mechanism
//    8 existed — proving the new table is an exact-match registry, not a permissive fallback that
//    starts swallowing unrelated unresolvable names.
await check("negative: unregistered local name is untouched by mechanism 8 (still fv-unknown)", async () => {
  const handlerBody = [
    { kind: "csg.op", id: "op.h.fv", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 1, name: "someOtherDerivedValueNotRegistered" },
    { kind: "csg.op", id: "op.h.ret", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 2, value: "op.h.fv" },
  ];
  const coreFacts = componentFacts(handlerBody, "string");
  const sceneFacts = sceneFactsWithRoute(0, "testRoute"); // route IS resolvable this time — irrelevant, name isn't registered
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0);
  assert.equal(cht.skips.length, 1);
  assert.equal(cht.skips[0].reason, "fv-unknown:someOtherDerivedValueNotRegistered");
});

process.stdout.write(`PASS (${passed}/3)\n`);
