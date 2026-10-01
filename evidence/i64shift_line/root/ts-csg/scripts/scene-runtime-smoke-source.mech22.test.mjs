// scene-runtime-smoke-source.mech22.test.mjs
//
// 离线单测: roomMode 派生值（机制8 declForm 撞名护栏）+ latestRoomModeRef 镜像（机制21 递归
// 解派生目标）— hand-authored synthetic CsgFact fixtures, same convention as
// scene-runtime-smoke-source.mech8/20/21.test.mjs (import the target .mjs's exported pure entry
// point, feed it a minimal fixture, assert on the real return value — no mocking of the
// mechanism itself).
//
// Provenance:
//   - ChessPage.tsx:360 `const roomMode = Boolean(roomId);` — mechanism-8 derived value, exact
//     translation `(roomIdExpr != "")` ("" is JS's only falsy string).
//   - DouDiZhuPage.tsx:817 `const roomMode = Boolean(roomId && !scenarioId);` — SAME bare name,
//     DIFFERENT formula; declForm pins the registration to the ChessPage shape (a Boolean()
//     call whose sole argument is the bare identifier roomId), verified against the local_write
//     in the HANDLER'S OWN owner component.
//   - ChessPage.tsx:376/410/1266 latestRoomModeRef — latest-ref mirror of roomMode (mechanism 21);
//     its sole read is the bool CONDITION `!latestRoomModeRef.current`, exercising the
//     emitCondition pass-through of the folded bool parameter.
//
// 4 cases:
//   1. positive (derived bool) — declForm-matching declaration: `if (roomMode)` compiles, the
//      dispatcher arg is the exact `(roomIdExpr != "")` translation.
//   2. negative (cross-component collision) — DouDiZhu's `Boolean(roomId && !scenarioId)` shape:
//      declForm mismatch fails closed, honest fv-unknown:roomMode, never applies the wrong
//      component's formula.
//   3. positive (mirror of a derived target) — latestRoomModeRef compiles end-to-end: mirror ->
//      roomMode derived value -> roomId route param; no standalone box-ref slot for the ref.
//   4. negative (mirror target's declForm mismatch) — same ref but roomMode declared in the
//      DouDiZhu shape: the mirror recursion fails the derived target, whole ref stays honest
//      fv-unknown:latestRoomModeRef.
//
// Usage: node scripts/scene-runtime-smoke-source.mech22.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

function componentFacts() {
  return [{ kind: "csg.function", id: "fn.compA", name: "ChessPageTest", parameters: [], returnType: "void" }];
}

// `const roomMode = <form>;` inside fn.compA — "chess" is Boolean(roomId), "doudizhu" is
// Boolean(roomId && !scenarioId) (DouDiZhuPage.tsx:817's real colliding shape).
function roomModeDeclFacts(form) {
  if (form === "chess") return [
    { kind: "csg.op", id: "op.rm.arg", function: "fn.compA", block: "block.compA", opKind: "identifier", ordinal: 20, name: "roomId" },
    { kind: "csg.op", id: "op.rm.call", function: "fn.compA", block: "block.compA", opKind: "call", ordinal: 21, callee: "Boolean", arguments: ["op.rm.arg"] },
    { kind: "csg.op", id: "op.rm.write", function: "fn.compA", block: "block.compA", opKind: "local_write", ordinal: 22, name: "roomMode", value: "op.rm.call" },
  ];
  return [
    { kind: "csg.op", id: "op.rm.a1", function: "fn.compA", block: "block.compA", opKind: "identifier", ordinal: 20, name: "roomId" },
    { kind: "csg.op", id: "op.rm.a2", function: "fn.compA", block: "block.compA", opKind: "identifier", ordinal: 21, name: "scenarioId" },
    { kind: "csg.op", id: "op.rm.and", function: "fn.compA", block: "block.compA", opKind: "binary", ordinal: 22, operator: "AmpersandAmpersandToken", left: "op.rm.a1", right: "op.rm.a2" },
    { kind: "csg.op", id: "op.rm.call", function: "fn.compA", block: "block.compA", opKind: "call", ordinal: 23, callee: "Boolean", arguments: ["op.rm.and"] },
    { kind: "csg.op", id: "op.rm.write", function: "fn.compA", block: "block.compA", opKind: "local_write", ordinal: 24, name: "roomMode", value: "op.rm.call" },
  ];
}

// `const latestRoomModeRef = useRef(roomMode)` + the useEffect-callback write
// `latestRoomModeRef.current = roomMode` in NON-invoke-reachable fn.effectA (mechanism-21 shape).
function mirrorFacts() {
  return [
    { kind: "csg.op", id: "op.ur.init", function: "fn.compA", block: "block.compA", opKind: "identifier", ordinal: 30, name: "roomMode" },
    { kind: "csg.op", id: "op.ur.call", function: "fn.compA", block: "block.compA", opKind: "call", ordinal: 31, callee: "useRef", arguments: ["op.ur.init"], returnType: "React.MutableRefObject<boolean>" },
    { kind: "csg.op", id: "op.ur.write", function: "fn.compA", block: "block.compA", opKind: "local_write", ordinal: 32, name: "latestRoomModeRef", value: "op.ur.call" },
    { kind: "csg.function", id: "fn.effectA", name: "<anonymous>", parameters: [], returnType: "void" },
    { kind: "csg.op", id: "op.w.ref", function: "fn.effectA", block: "block.e", opKind: "identifier", ordinal: 1, name: "latestRoomModeRef" },
    { kind: "csg.op", id: "op.w.state", function: "fn.effectA", block: "block.e", opKind: "identifier", ordinal: 2, name: "roomMode" },
    { kind: "csg.op", id: "op.w.pw", function: "fn.effectA", block: "block.e", opKind: "property_write", ordinal: 3, name: "current", receiver: "op.w.ref", value: "op.w.state" },
  ];
}

function handlerBindingFacts() {
  return [
    { kind: "csg.op", id: "op.h.fnvalue", function: "fn.compA", block: "block.compA", opKind: "function_value", ordinal: 40, targetFunction: "fn.handleTestClose" },
    { kind: "csg.op", id: "op.h.localwrite", function: "fn.compA", block: "block.compA", opKind: "local_write", ordinal: 41, name: "handleTestClose", value: "op.h.fnvalue" },
    { kind: "csg.function", id: "fn.handleTestClose", name: "<anonymous>", parameters: [], returnType: "string" },
  ];
}

// `if (<condOp>) { return "a"; } return "b";` — condOps supplied per case.
function branchBodyFacts(condOps, tag) {
  return [
    { kind: "csg.data", id: `d.a.${tag}`, dataKind: "string", value: "a" },
    { kind: "csg.data", id: `d.b.${tag}`, dataKind: "string", value: "b" },
    ...condOps,
    { kind: "csg.op", id: `op.h.br.${tag}`, function: "fn.handleTestClose", block: "block.h", opKind: "branch_if", ordinal: 8, condition: `op.h.cond.${tag}`, thenBlock: `block.then.${tag}` },
    { kind: "csg.op", id: `op.h.litb.${tag}`, function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: 9, data: `d.b.${tag}` },
    { kind: "csg.op", id: `op.h.retb.${tag}`, function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 10, value: `op.h.litb.${tag}` },
    { kind: "csg.op", id: `op.h.lita.${tag}`, function: "fn.handleTestClose", block: `block.then.${tag}`, opKind: "literal", ordinal: 1, data: `d.a.${tag}` },
    { kind: "csg.op", id: `op.h.reta.${tag}`, function: "fn.handleTestClose", block: `block.then.${tag}`, opKind: "return", ordinal: 2, value: `op.h.lita.${tag}` },
  ];
}

const roomModeCond = [{ kind: "csg.op", id: "op.h.cond.rm", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 1, name: "roomMode" }];
const mirrorCond = [
  { kind: "csg.op", id: "op.h.ref.mm", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 1, name: "latestRoomModeRef" },
  { kind: "csg.op", id: "op.h.cur.mm", function: "fn.handleTestClose", block: "block.h", opKind: "property_read", ordinal: 2, name: "current", receiver: "op.h.ref.mm" },
  { kind: "csg.op", id: "op.h.cond.mm", function: "fn.handleTestClose", block: "block.h", opKind: "unary", ordinal: 3, operator: "ExclamationToken", operand: "op.h.cur.mm" },
];

const sceneFactsWithRoute = () => [
  { kind: "csg.web.scene.event_handler", effect: "invoke:handleTestClose", routeIndex: 0, nodeId: 0 },
  { kind: "csg.web.scene.route", routeIndex: 0, routeId: "testRoute" },
];

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

// ---------------------------------------------------------------------------
await check("positive: declForm-matching roomMode derived bool compiles", async () => {
  const coreFacts = [
    ...componentFacts(),
    ...roomModeDeclFacts("chess"),
    ...handlerBindingFacts(),
    ...branchBodyFacts(roomModeCond, "rm"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFactsWithRoute());
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.ok(
    cht.code.includes(`(scene.WebSceneStateValueForRef(graph, "__csg_route_param.testRoute.roomId") != "")`),
    "the dispatcher arg must be the exact `(roomIdExpr != \"\")` translation of Boolean(roomId)",
  );
});

// ---------------------------------------------------------------------------
await check("negative: DouDiZhu-shaped roomMode fails declForm, never the wrong formula", async () => {
  const coreFacts = [
    ...componentFacts(),
    ...roomModeDeclFacts("doudizhu"),
    ...handlerBindingFacts(),
    ...branchBodyFacts(roomModeCond, "rm"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFactsWithRoute());
  assert.equal(cht.count, 0, "a same-named different-formula declaration must fail closed");
  assert.equal(cht.skips.length, 1);
  assert.equal(cht.skips[0].reason, "fv-unknown:roomMode");
  assert.equal(cht.code, "");
});

// ---------------------------------------------------------------------------
await check("positive: latestRoomModeRef mirror of derived target compiles end-to-end", async () => {
  const coreFacts = [
    ...componentFacts(),
    ...roomModeDeclFacts("chess"),
    ...mirrorFacts(),
    ...handlerBindingFacts(),
    ...branchBodyFacts(mirrorCond, "mm"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFactsWithRoute());
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.ok(
    cht.code.includes(`(scene.WebSceneStateValueForRef(graph, "__csg_route_param.testRoute.roomId") != "")`),
    "the mirror must hand the caller the MIRRORED DERIVED VALUE's own expression",
  );
  assert.ok(cht.code.includes("latestRoomModeRef: bool"), "the ref name carries the injected bool parameter");
  assert.ok(!cht.code.includes("__chtRef_latestRoomModeRef"), "a mirror ref owns NO box-ref slot of its own");
});

// ---------------------------------------------------------------------------
await check("negative: mirror target declForm mismatch fails the whole ref honestly", async () => {
  const coreFacts = [
    ...componentFacts(),
    ...roomModeDeclFacts("doudizhu"),
    ...mirrorFacts(),
    ...handlerBindingFacts(),
    ...branchBodyFacts(mirrorCond, "mm"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFactsWithRoute());
  assert.equal(cht.count, 0);
  assert.equal(cht.skips.length, 1);
  assert.equal(cht.skips[0].reason, "fv-unknown:latestRoomModeRef");
});

process.stdout.write(`mech22 roomMode derived + mirror: ${passed}/4 checks passed\n`);
