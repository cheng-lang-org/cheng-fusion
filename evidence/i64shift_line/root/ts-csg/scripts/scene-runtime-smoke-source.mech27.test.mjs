// scene-runtime-smoke-source.mech27.test.mjs
//
// 离线单测: 信封构造链落地件 —— ①intersection `A & B` 成员级合流（同 Cheng 型字段合流/异型
// 冲突响亮拒）+ returnType 泛型形参按 overrides 替换；②annotated-literal synthesis（含
// union 字段的 inline-object 实参按值型重建合成 struct 并登记 decl）；③normalize* 恒等折叠
// （struct 实参恒等/json 实参走 JObject 判定）；④sendManagedSocialDm 的 payload struct→json
// 编码包装与编码器上报（jsonStructEncoders）；⑤双态桥（headless 诚实无设备态契约）。
// Same fixture convention as mech8/20-26.
//
// Usage: node scripts/scene-runtime-smoke-source.mech27.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";
import { TranspilerFactIndex, TypeMapper } from "../dist/csg-cheng-transpiler.js";

const CHESS_ENV = "RealtimeChessSignalEnvelope";

function typeFacts() {
  return [
    { kind: "csg.type_decl", id: "t.base", name: "RealtimeBaseEnvelope", declKind: "interface", members: [
      { name: "protocol", optional: false, type: "string" },
      { name: "messageId", optional: false, type: "string" },
      { name: "conversationId", optional: false, type: "string" },
      { name: "timestampMs", optional: false, type: "number" },
    ] },
    { kind: "csg.type_decl", id: "t.chess", name: CHESS_ENV, declKind: "interface", members: [
      { name: "messageId", optional: false, type: "string" },
      { name: "peerId", optional: false, type: "string" },
    ] },
  ];
}

function componentFacts() {
  return [{ kind: "csg.function", id: "fn.compA", name: "ChessPageTest", parameters: [], returnType: "void" }];
}

function handlerBindingFacts(bodyOps, returnType = "string") {
  return [
    { kind: "csg.op", id: "op.h.fnvalue", function: "fn.compA", block: "block.compA", opKind: "function_value", ordinal: 40, targetFunction: "fn.handleTestClose" },
    { kind: "csg.op", id: "op.h.localwrite", function: "fn.compA", block: "block.compA", opKind: "local_write", ordinal: 41, name: "handleTestClose", value: "op.h.fnvalue" },
    { kind: "csg.function", id: "fn.handleTestClose", name: "<anonymous>", parameters: [], returnType },
    ...bodyOps,
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
await check("positive: intersection A & B merges members with same-type field confluence", async () => {
  const idx = new TranspilerFactIndex(typeFacts());
  const tm = new TypeMapper(idx);
  const mapped = tm.map("RealtimeBaseEnvelope & { kind: str; action: str }");
  assert.ok(mapped.type !== undefined && mapped.type.startsWith("ChtIntersection_"), `intersection must synthesize: ${JSON.stringify(mapped)}`);
  const decl = idx.typeDeclByName.get(mapped.type);
  const names = (decl.members ?? []).map((m) => m.name);
  for (const required of ["protocol", "messageId", "conversationId", "timestampMs", "kind", "action"]) {
    assert.ok(names.includes(required), `merged decl must carry ${required}`);
  }
});

// ---------------------------------------------------------------------------
await check("negative: intersection member conflict across DIFFERENT Cheng types rejects loudly", async () => {
  const idx = new TranspilerFactIndex(typeFacts());
  const tm = new TypeMapper(idx);
  // RealtimeBaseEnvelope.messageId: string (str) vs inline { messageId: int64 } — real narrowing.
  const mapped = tm.map("RealtimeBaseEnvelope & { messageId: int64 }");
  assert.equal(mapped.type, undefined, "conflicting member types must not synthesize");
  assert.ok(String(mapped.reason ?? "").includes("conflict"), `reason must name the conflict: ${mapped.reason}`);
});

// ---------------------------------------------------------------------------
await check("positive: generic returnType instantiates K/A from call-site overrides", async () => {
  const idx = new TranspilerFactIndex(typeFacts());
  const tm = new TypeMapper(idx);
  const { ChengFunctionTranspiler } = await import("../dist/csg-cheng-transpiler.js");
  const t = new ChengFunctionTranspiler(idx, tm);
  const fn = {
    kind: "csg.function", id: "fn.g", name: "buildBaseEnvelopeTest",
    parameters: [
      { index: 0, name: "kind", typeSource: "K" },
      { index: 1, name: "action", typeSource: "A" },
    ],
    returnType: "RealtimeBaseEnvelope & { kind: K; action: A }",
  };
  const text = t.returnTypeWithOverrides(fn, new Map([[0, "str"], [1, "str"]]));
  assert.ok(!/\bK\b/.test(text) && !/\bA\b/.test(text.replace("action", "")), `generics must be substituted: ${text}`);
  const mapped = tm.map(text);
  assert.ok(mapped.type !== undefined && mapped.type.startsWith("ChtIntersection_"), `substituted return must map: ${JSON.stringify(mapped)}`);
});

// ---------------------------------------------------------------------------
await check("positive: annotated-literal synthesis rebuilds a union-membered literal by value type", async () => {
  // handler: `const o = { conversationId: "c", envelope: <typed RealtimeEnvelope-> value typed CHESS_ENV>; return o.conversationId;`
  // The literal's own annotation carries the union (RealtimeEnvelope) — synthesis must rebuild
  // with the value's concrete struct type and register the decl.
  const UNION_ENV = "RealtimeEnvelope";
  const coreFacts = [
    ...typeFacts(),
    { kind: "csg.type_decl", id: "t.union", name: UNION_ENV, declKind: "type_alias", exported: true, aliasTarget: `| ${CHESS_ENV}\n  | RealtimeCallSignalEnvelope`, members: [] },
    { kind: "csg.type_decl", id: "t.call", name: "RealtimeCallSignalEnvelope", declKind: "interface", members: [{ name: "messageId", optional: false, type: "string" }] },
    ...componentFacts(),
    // useState roomState (so `envelope` identifier has a concrete struct type)
    { kind: "csg.op", id: "op.us.call", function: "fn.compA", block: "block.compA", opKind: "call", ordinal: 1, callee: "useState", returnType: `[${CHESS_ENV} | null, React.Dispatch<React.SetStateAction<${CHESS_ENV} | null>>]`, arguments: [] },
    { kind: "csg.op", id: "op.us.val", function: "fn.compA", block: "block.compA", opKind: "binding_extract", ordinal: 2, source: "op.us.call", path: [{ index: 0 }], name: "envelope" },
    { kind: "csg.op", id: "op.us.set", function: "fn.compA", block: "block.compA", opKind: "binding_extract", ordinal: 3, source: "op.us.call", path: [{ index: 1 }], name: "setEnvelope" },
    ...handlerBindingFacts([
      { kind: "csg.data", id: "d.c", dataKind: "string", value: "c" },
      { kind: "csg.op", id: "op.h.litc", function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: 1, data: "d.c" },
      { kind: "csg.op", id: "op.h.env", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 2, name: "envelope" },
      { kind: "csg.op", id: "op.h.obj", function: "fn.handleTestClose", block: "block.h", opKind: "object_literal", ordinal: 3, returnType: `{ conversationId: string; envelope: ${UNION_ENV}; }`, properties: [{ name: "conversationId", value: "op.h.litc" }, { name: "envelope", value: "op.h.env" }] },
      { kind: "csg.op", id: "op.h.bind", function: "fn.handleTestClose", block: "block.h", opKind: "local_write", ordinal: 4, name: "o", value: "op.h.obj" },
      { kind: "csg.op", id: "op.h.o", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 5, name: "o" },
      { kind: "csg.op", id: "op.h.read", function: "fn.handleTestClose", block: "block.h", opKind: "property_read", ordinal: 6, name: "conversationId", receiver: "op.h.o" },
      { kind: "csg.op", id: "op.h.ret", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 7, value: "op.h.read" },
    ]),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts());
  assert.deepEqual(cht.skips, [], `annotated synthesis must compile: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.ok(/envelope: RealtimeChessSignalEnvelope/.test(cht.code), `synthesized decl must use the concrete value type, never the union: ${cht.code.slice(0, 900)}`);
  assert.ok(!/envelope: RealtimeEnvelope\b/.test(cht.code.replace(/envelope: RealtimeChessSignalEnvelope/g, "")), "union text must never reach a Cheng struct field");
});

// ---------------------------------------------------------------------------
await check("positive: dual-state DM bridge flattens options and encodes struct payload", async () => {
  // handler: `prepareUiDirectRoute(libp2pService, {peerId: "p", connect: true, timeoutMs: 5000}); return sendManagedSocialDm("p", "c", payload, 5000) ? "y" : "n";`
  // payload is a useState struct slot (so its type is a real decl and the encoder request fires).
  const coreFacts = [
    ...typeFacts(),
    ...componentFacts(),
    { kind: "csg.op", id: "op.us.call", function: "fn.compA", block: "block.compA", opKind: "call", ordinal: 1, callee: "useState", returnType: `[${CHESS_ENV} | null, React.Dispatch<React.SetStateAction<${CHESS_ENV} | null>>]`, arguments: [] },
    { kind: "csg.op", id: "op.us.val", function: "fn.compA", block: "block.compA", opKind: "binding_extract", ordinal: 2, source: "op.us.call", path: [{ index: 0 }], name: "payload" },
    { kind: "csg.op", id: "op.us.set", function: "fn.compA", block: "block.compA", opKind: "binding_extract", ordinal: 3, source: "op.us.call", path: [{ index: 1 }], name: "setPayload" },
    ...handlerBindingFacts([
      { kind: "csg.data", id: "d.p", dataKind: "string", value: "p" },
      { kind: "csg.data", id: "d.c2", dataKind: "string", value: "c" },
      { kind: "csg.data", id: "d.t", dataKind: "number", value: 5000 },
      { kind: "csg.data", id: "d.true", dataKind: "boolean", value: true },
      { kind: "csg.data", id: "d.y", dataKind: "string", value: "y" },
      { kind: "csg.data", id: "d.n", dataKind: "string", value: "n" },
      { kind: "csg.op", id: "op.h.lib", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 1, name: "libp2pService" },
      { kind: "csg.op", id: "op.h.lp", function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: 2, data: "d.p" },
      { kind: "csg.op", id: "op.h.lt", function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: 3, data: "d.true" },
      { kind: "csg.op", id: "op.h.lm", function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: 4, data: "d.t" },
      { kind: "csg.op", id: "op.h.opts", function: "fn.handleTestClose", block: "block.h", opKind: "object_literal", ordinal: 5, properties: [{ name: "peerId", value: "op.h.lp" }, { name: "connect", value: "op.h.lt" }, { name: "timeoutMs", value: "op.h.lm" }] },
      { kind: "csg.op", id: "op.h.prep", function: "fn.handleTestClose", block: "block.h", opKind: "call", ordinal: 6, callee: "prepareUiDirectRoute", arguments: ["op.h.lib", "op.h.opts"], returnType: "Promise<boolean>" },
      { kind: "csg.op", id: "op.h.stmt", function: "fn.handleTestClose", block: "block.h", opKind: "expression", ordinal: 7, value: "op.h.prep" },
      { kind: "csg.op", id: "op.h.lp2", function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: 8, data: "d.p" },
      { kind: "csg.op", id: "op.h.lc2", function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: 9, data: "d.c2" },
      { kind: "csg.op", id: "op.h.pay", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 10, name: "payload" },
      { kind: "csg.op", id: "op.h.lm2", function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: 11, data: "d.t" },
      { kind: "csg.op", id: "op.h.dm", function: "fn.handleTestClose", block: "block.h", opKind: "call", ordinal: 12, callee: "sendManagedSocialDm", arguments: ["op.h.lp2", "op.h.lc2", "op.h.pay", "op.h.lm2"], returnType: "Promise<boolean>" },
      { kind: "csg.op", id: "op.h.bind", function: "fn.handleTestClose", block: "block.h", opKind: "local_write", ordinal: 13, name: "ok", value: "op.h.dm" },
      { kind: "csg.op", id: "op.h.okid", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 14, name: "ok" },
      { kind: "csg.op", id: "op.h.ret", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 15, value: "op.h.okid" },
    ], "boolean"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts());
  assert.deepEqual(cht.skips, [], `dual-state bridges must compile: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.ok(cht.code.includes('chtBridgePrepareUiDirectRoute("p", true, int64(5000))'), "prepareUiDirectRoute options must flatten to scalar args");
  assert.ok(/chtBridgeSendManagedSocialDm\("p", "c", __chtJsonOf_RealtimeChessSignalEnvelope\(payload\), int64\(5000\)\)/.test(cht.code), "struct payload must go through the deterministic json encoder");
  assert.ok(cht.code.includes("fn __chtJsonOf_RealtimeChessSignalEnvelope("), "the encoder must be emitted via the request channel");
});

// ---------------------------------------------------------------------------
await check("positive: normalizeJsonRecord identity-folds a struct argument", async () => {
  const coreFacts = [
    ...typeFacts(),
    ...componentFacts(),
    { kind: "csg.op", id: "op.us.call", function: "fn.compA", block: "block.compA", opKind: "call", ordinal: 1, callee: "useState", returnType: `[${CHESS_ENV} | null, React.Dispatch<React.SetStateAction<${CHESS_ENV} | null>>]`, arguments: [] },
    { kind: "csg.op", id: "op.us.val", function: "fn.compA", block: "block.compA", opKind: "binding_extract", ordinal: 2, source: "op.us.call", path: [{ index: 0 }], name: "payload" },
    { kind: "csg.op", id: "op.us.set", function: "fn.compA", block: "block.compA", opKind: "binding_extract", ordinal: 3, source: "op.us.call", path: [{ index: 1 }], name: "setPayload" },
    ...handlerBindingFacts([
      { kind: "csg.op", id: "op.h.pay", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 1, name: "payload" },
      { kind: "csg.op", id: "op.h.call", function: "fn.handleTestClose", block: "block.h", opKind: "call", ordinal: 2, callee: "normalizeJsonRecord", arguments: ["op.h.pay"], returnType: "RealtimeChessSignalEnvelope" },
      { kind: "csg.op", id: "op.h.bind", function: "fn.handleTestClose", block: "block.h", opKind: "local_write", ordinal: 3, name: "r", value: "op.h.call" },
      { kind: "csg.op", id: "op.h.r", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 4, name: "r" },
      { kind: "csg.op", id: "op.h.peer", function: "fn.handleTestClose", block: "block.h", opKind: "property_read", ordinal: 5, name: "peerId", receiver: "op.h.r" },
      { kind: "csg.op", id: "op.h.ret", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 6, value: "op.h.peer" },
    ]),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts());
  assert.deepEqual(cht.skips, [], `normalize identity fold must compile: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.ok(cht.code.includes("var r = payload"), "struct argument must fold to the identity, never a normalize call");
  assert.ok(!cht.code.includes("normalizeJsonRecord(payload)"), "no residual normalize call for a struct argument");
});

process.stdout.write(`mech27 envelope-construction chain: ${passed}/6 checks passed\n`);
