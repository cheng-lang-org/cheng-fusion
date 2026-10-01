// scene-runtime-smoke-source.mech24.test.mjs
//
// 离线单测: S2 第一刀落地件 —— ①async Promise<T> 签名 unwrap（无 await 同步体编译 / 含 await
// 诚实拒）、②component-alias 被调函数的闭包 fv 注入（transpileWithInjectedParams + 调用点 fv
// 实参前缀）、③latestRoomIdRef 机制21 mirror 使 `.current?.trim()` 可编译、④
// `Math.random().toString(36).slice(2, 8)` 精确形状归约（裸 Math.random() 保持诚实拒——int64
// 数值模型无 [0,1) 浮点）。Same fixture convention as mech8/20/21/22/23.
//
// Usage: node scripts/scene-runtime-smoke-source.mech24.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

const ROOM_TYPE = "RealtimeChessRoomTest";

function typeDeclFact() {
  return {
    kind: "csg.type_decl", id: "type.room", name: ROOM_TYPE, declKind: "interface",
    members: [{ name: "peerId", optional: false, type: "string" }],
  };
}

// fn.compA + `const [roomState, setRoomState] = useState<RealtimeChessRoomTest | null>(null)`
// + `const [roomId, setRoomIdIgnored] = ...` is NOT how roomId works (route param) — roomId
// resolves through CHT_ROUTE_PARAM_SLOTS with a route fact (see sceneBase).
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

// `const <aliasName> = <arrow fn>` inside fn.compA (useCallback-free direct function_value write,
// the shape localAliasesFor collects).
function aliasDeclFacts(aliasName, aliasFid, tag) {
  return [
    { kind: "csg.op", id: `op.al.fv.${tag}`, function: "fn.compA", block: "block.compA", opKind: "function_value", ordinal: 20, targetFunction: aliasFid },
    { kind: "csg.op", id: `op.al.lw.${tag}`, function: "fn.compA", block: "block.compA", opKind: "local_write", ordinal: 21, name: aliasName, value: `op.al.fv.${tag}` },
  ];
}

// NB: the alias fn takes ONE explicit param — a zero-arg single-return helper would be inlined
// by the PRE-EXISTING resolveZeroArgLocalReturnExpr path (emitCall's zero-param branch) and
// never reach the alias walk under test here. Verified: the inline path pre-dates this
// mechanism and handles zero-arg aliases correctly on its own.
function aliasFnFact(aliasFid, returnType) {
  return { kind: "csg.function", id: aliasFid, name: "<anonymous>", parameters: [{ index: 0, name: "sessionId", optional: false, rest: false, typeSource: "string" }], returnType };
}

function handlerBindingFacts(bodyOps, returnType = "string") {
  return [
    { kind: "csg.op", id: "op.h.fnvalue", function: "fn.compA", block: "block.compA", opKind: "function_value", ordinal: 40, targetFunction: "fn.handleTestClose" },
    { kind: "csg.op", id: "op.h.localwrite", function: "fn.compA", block: "block.compA", opKind: "local_write", ordinal: 41, name: "handleTestClose", value: "op.h.fnvalue" },
    { kind: "csg.function", id: "fn.handleTestClose", name: "<anonymous>", parameters: [], returnType },
    ...bodyOps,
  ];
}

const sceneBase = () => [
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
// 1. positive (alias fv injection): handler `return helper();` where helper reads the component
//    free var roomState — the alias is compiled with the injected fv param and the call site
//    passes it (fv-first), instead of dying unresolved-identifier.
await check("positive: alias callee compiles with injected closure free vars", async () => {
  const coreFacts = [
    typeDeclFact(),
    ...componentWithStateFacts(),
    ...aliasDeclFacts("helper", "fn.helper", "h"),
    aliasFnFact("fn.helper", "string"),
    // helper body: `return roomState.peerId;`
    { kind: "csg.op", id: "op.al.rs", function: "fn.helper", block: "block.al", opKind: "identifier", ordinal: 1, name: "roomState" },
    { kind: "csg.op", id: "op.al.peer", function: "fn.helper", block: "block.al", opKind: "property_read", ordinal: 2, name: "peerId", receiver: "op.al.rs" },
    { kind: "csg.op", id: "op.al.ret", function: "fn.helper", block: "block.al", opKind: "return", ordinal: 3, value: "op.al.peer" },
    // handler body: `return helper();`
    ...handlerBindingFacts([
      { kind: "csg.data", id: "d.x", dataKind: "string", value: "x" },
    { kind: "csg.op", id: "op.h.lx", function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: 0, data: "d.x" },
    { kind: "csg.op", id: "op.h.call", function: "fn.handleTestClose", block: "block.h", opKind: "call", ordinal: 1, callee: "helper", arguments: ["op.h.lx"] },
      { kind: "csg.op", id: "op.h.ret", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 2, value: "op.h.call" },
    ]),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneBase());
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.ok(/fn helper\(roomState: [A-Za-z]+.*sessionId: str\): str =/.test(cht.code), `alias fn must carry the injected fv param BEFORE its explicit param: ${cht.code.slice(0, 500)}`);
  assert.ok(cht.code.includes('helper(roomState, "x")'), "call site must pass the fv actual (fv-first), then the explicit arg");
});

// ---------------------------------------------------------------------------
// 2. positive (async signature): SAME shape but the alias fn's returnType is Promise<string>
//    and its body has NO await — Promise<T> unwraps to T and the synchronous body compiles.
await check("positive: async Promise<T> signature unwraps on an await-free body", async () => {
  const coreFacts = [
    typeDeclFact(),
    ...componentWithStateFacts(),
    ...aliasDeclFacts("helper", "fn.helper", "h"),
    aliasFnFact("fn.helper", "Promise<string>"),
    { kind: "csg.op", id: "op.al.rs", function: "fn.helper", block: "block.al", opKind: "identifier", ordinal: 1, name: "roomState" },
    { kind: "csg.op", id: "op.al.peer", function: "fn.helper", block: "block.al", opKind: "property_read", ordinal: 2, name: "peerId", receiver: "op.al.rs" },
    { kind: "csg.op", id: "op.al.ret", function: "fn.helper", block: "block.al", opKind: "return", ordinal: 3, value: "op.al.peer" },
    ...handlerBindingFacts([
      { kind: "csg.data", id: "d.x", dataKind: "string", value: "x" },
    { kind: "csg.op", id: "op.h.lx", function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: 0, data: "d.x" },
    { kind: "csg.op", id: "op.h.call", function: "fn.handleTestClose", block: "block.h", opKind: "call", ordinal: 1, callee: "helper", arguments: ["op.h.lx"] },
      { kind: "csg.op", id: "op.h.ret", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 2, value: "op.h.call" },
    ]),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneBase());
  assert.deepEqual(cht.skips, [], `async await-free alias must compile: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
});

// ---------------------------------------------------------------------------
// 3. positive-updated (real await): the SAME async alias with an `await` op in its body. The
//    pre-mechanism-9/10 contract pinned here was "await has no codegen -> honest failure"; the
//    synchronous-collapse lowering (mechanism-9/10 headless slice) REPLACED that contract:
//    `await x` now lowers to a synchronous evaluation + error-channel check. This case locks
//    the NEW contract: compiles, and the generated code carries the channel check (never a
//    silent pass-through).
await check("positive: a real await lowers to synchronous evaluation + channel check", async () => {
  const coreFacts = [
    typeDeclFact(),
    ...componentWithStateFacts(),
    ...aliasDeclFacts("helper", "fn.helper", "h"),
    aliasFnFact("fn.helper", "Promise<string>"),
    { kind: "csg.data", id: "d.inner", dataKind: "string", value: "y" },
    { kind: "csg.op", id: "op.al.lit", function: "fn.helper", block: "block.al", opKind: "literal", ordinal: 1, data: "d.inner" },
    { kind: "csg.op", id: "op.al.await", function: "fn.helper", block: "block.al", opKind: "await", ordinal: 2, operand: "op.al.lit" },
    { kind: "csg.op", id: "op.al.ret", function: "fn.helper", block: "block.al", opKind: "return", ordinal: 3, value: "op.al.await" },
    ...handlerBindingFacts([
      { kind: "csg.data", id: "d.x", dataKind: "string", value: "x" },
    { kind: "csg.op", id: "op.h.lx", function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: 0, data: "d.x" },
    { kind: "csg.op", id: "op.h.call", function: "fn.handleTestClose", block: "block.h", opKind: "call", ordinal: 1, callee: "helper", arguments: ["op.h.lx"] },
      { kind: "csg.op", id: "op.h.ret", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 2, value: "op.h.call" },
    ]),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneBase());
  assert.deepEqual(cht.skips, [], `await must lower, not fail: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.ok(cht.code.includes("__chtAsyncError"), "the error channel must be present for the await rejection check");
  assert.ok(/if len\(__chtAsyncError\) > 0:/.test(cht.code), "the await lowering must check the channel after the operand call");
});

// ---------------------------------------------------------------------------
// 4. positive (mirror trim): latestRoomIdRef mirror -> roomId, read via `.current?.trim()`.
await check("positive: latestRoomIdRef.current?.trim() compiles through the mirror fold", async () => {
  const coreFacts = [
    ...componentWithStateFacts(),
    // `const latestRoomIdRef = useRef(roomId)` + unreachable effect write `.current = roomId`
    { kind: "csg.op", id: "op.ur.init", function: "fn.compA", block: "block.compA", opKind: "identifier", ordinal: 50, name: "roomId" },
    { kind: "csg.op", id: "op.ur.call", function: "fn.compA", block: "block.compA", opKind: "call", ordinal: 51, callee: "useRef", arguments: ["op.ur.init"], returnType: "React.MutableRefObject<string>" },
    { kind: "csg.op", id: "op.ur.write", function: "fn.compA", block: "block.compA", opKind: "local_write", ordinal: 52, name: "latestRoomIdRef", value: "op.ur.call" },
    { kind: "csg.function", id: "fn.effectA", name: "<anonymous>", parameters: [], returnType: "void" },
    { kind: "csg.op", id: "op.w.ref", function: "fn.effectA", block: "block.e", opKind: "identifier", ordinal: 1, name: "latestRoomIdRef" },
    { kind: "csg.op", id: "op.w.state", function: "fn.effectA", block: "block.e", opKind: "identifier", ordinal: 2, name: "roomId" },
    { kind: "csg.op", id: "op.w.pw", function: "fn.effectA", block: "block.e", opKind: "property_write", ordinal: 3, name: "current", receiver: "op.w.ref", value: "op.w.state" },
    // handler body: `return latestRoomIdRef.current?.trim();`
    ...handlerBindingFacts([
      { kind: "csg.op", id: "op.h.ref", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 1, name: "latestRoomIdRef" },
      { kind: "csg.op", id: "op.h.cur", function: "fn.handleTestClose", block: "block.h", opKind: "property_read", ordinal: 2, name: "current", receiver: "op.h.ref" },
      { kind: "csg.op", id: "op.h.trim", function: "fn.handleTestClose", block: "block.h", opKind: "call", ordinal: 3, callee: "latestRoomIdRef.current?.trim", memberName: "trim", receiver: "op.h.cur", arguments: [] },
      { kind: "csg.op", id: "op.h.ret", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 4, value: "op.h.trim" },
    ]),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneBase());
  assert.deepEqual(cht.skips, [], `mirror trim must compile: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.ok(cht.code.includes("jsStrTrim(latestRoomIdRef)"), "the folded .current must flow into the str trim codegen");
  assert.ok(!cht.code.includes("__chtRef_latestRoomIdRef"), "a mirror ref owns NO box-ref slot of its own");
});

// ---------------------------------------------------------------------------
// 5. positive (Math.random suffix idiom): `return Math.random().toString(36).slice(2, 8);`
await check("positive: Math.random().toString(36).slice(2, 8) reduces to jsRandomSuffix36", async () => {
  const lit = (id, v) => ({ kind: "csg.data", id, dataKind: "number", value: v });
  const litOp = (id, data, ord) => ({ kind: "csg.op", id, function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: ord, data });
  const coreFacts = [
    ...componentWithStateFacts(),
    lit("d.36", 36), lit("d.2", 2), lit("d.8", 8),
    ...handlerBindingFacts([
      { kind: "csg.op", id: "op.h.math", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 1, name: "Math" },
      { kind: "csg.op", id: "op.h.rand", function: "fn.handleTestClose", block: "block.h", opKind: "call", ordinal: 2, callee: "Math.random", memberName: "random", receiver: "op.h.math", arguments: [] },
      litOp("op.h.l36", "d.36", 3),
      { kind: "csg.op", id: "op.h.tostr", function: "fn.handleTestClose", block: "block.h", opKind: "call", ordinal: 4, callee: "Math.random().toString", memberName: "toString", receiver: "op.h.rand", arguments: ["op.h.l36"] },
      litOp("op.h.l2", "d.2", 5),
      litOp("op.h.l8", "d.8", 6),
      { kind: "csg.op", id: "op.h.slice", function: "fn.handleTestClose", block: "block.h", opKind: "call", ordinal: 7, callee: "Math.random().toString(36).slice", memberName: "slice", receiver: "op.h.tostr", arguments: ["op.h.l2", "op.h.l8"] },
      { kind: "csg.op", id: "op.h.ret", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 8, value: "op.h.slice" },
    ]),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneBase());
  assert.deepEqual(cht.skips, [], `random suffix idiom must compile: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.ok(cht.code.includes("jsRandomSuffix36()"));
});

// ---------------------------------------------------------------------------
// 6. negative (bare Math.random()): no [0,1) float in the int64 number model — honest failure.
await check("negative: bare Math.random() keeps failing (no [0,1) float in int64 model)", async () => {
  const coreFacts = [
    ...componentWithStateFacts(),
    ...handlerBindingFacts([
      { kind: "csg.op", id: "op.h.math", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 1, name: "Math" },
      { kind: "csg.op", id: "op.h.rand", function: "fn.handleTestClose", block: "block.h", opKind: "call", ordinal: 2, callee: "Math.random", memberName: "random", receiver: "op.h.math", arguments: [] },
      { kind: "csg.op", id: "op.h.ret", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 3, value: "op.h.rand" },
    ], "number"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneBase());
  assert.equal(cht.count, 0, "a bare Math.random() must never be silently zeroed");
  assert.ok(cht.skips[0].reason.startsWith("transpile-fail:"));
});

process.stdout.write(`mech24 S2 slice-1 (async signature / alias fv / mirror trim / random suffix): ${passed}/6 checks passed\n`);
