// scene-runtime-smoke-source.mech25.test.mjs
//
// 离线单测: mechanism-union slice —— ①union-alias 参数按调用点实参具体型单态实例化（成员校
// 验，非成员诚实拒）、②indexed access `T['field']` 精确字段查表、③字符串字面量 union alias
// 不被单态化误伤（走原 map→str 路径）。Same fixture convention as mech8/20-24.
//
// Provenance (real UniMaker extraction, tmp/cht-voice-roomstate):
//   - `RealtimeEnvelope` = type_alias -> `| RealtimeDmMessageEnvelope | ... |
//     RealtimeChessSignalEnvelope | RealtimeDoudizhuSignalEnvelope` (discriminated union of
//     named structs — no Cheng representation, parameter must instantiate per call site);
//   - `buildBaseEnvelope<K, A>(kind: K, action: A, options)` — generic params already handled by
//     the pre-existing monomorph branch; `options.action`'s type text is the indexed access
//     `RealtimeChessSignalEnvelope['action']`;
//   - `VoiceCallState = 'idle' | 'ringing' | ...` — a STRING-LITERAL union alias that already
//     maps to str through the generic union branch and must never be instance-mangled.
//
// Usage: node scripts/scene-runtime-smoke-source.mech25.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

const CHESS_ENV = "RealtimeChessSignalEnvelope";
const CALL_ENV = "RealtimeCallSignalEnvelope";
const DDZ_ENV = "RealtimeDoudizhuSignalEnvelope";

function typeFacts() {
  return [
    { kind: "csg.type_decl", id: "t.chess", name: CHESS_ENV, declKind: "interface", members: [{ name: "peerId", optional: false, type: "string" }, { name: "action", optional: false, type: "'move' | 'leave'" }] },
    { kind: "csg.type_decl", id: "t.call", name: CALL_ENV, declKind: "interface", members: [{ name: "peerId", optional: false, type: "string" }] },
    { kind: "csg.type_decl", id: "t.ddz", name: DDZ_ENV, declKind: "interface", members: [{ name: "zoneId", optional: false, type: "string" }] },
    { kind: "csg.type_decl", id: "t.union", name: "RealtimeEnvelope", declKind: "type_alias", exported: true, aliasTarget: `| ${CHESS_ENV}\n  | ${CALL_ENV}`, members: [] },
    { kind: "csg.type_decl", id: "t.vcs", name: "VoiceCallState", declKind: "type_alias", exported: true, aliasTarget: "'idle' | 'ringing' | 'connected'", members: [] },
  ];
}

function componentFacts() {
  return [{ kind: "csg.function", id: "fn.compA", name: "ChessPageTest", parameters: [], returnType: "void" }];
}

// alias fn: one explicit param (<paramName>: <paramTypeSource>), body `return <bodyReturn>;`
function aliasFacts(aliasName, aliasFid, paramName, paramTypeSource, bodyReturnOps, tag) {
  return [
    { kind: "csg.op", id: `op.al.fv.${tag}`, function: "fn.compA", block: "block.compA", opKind: "function_value", ordinal: 20, targetFunction: aliasFid },
    { kind: "csg.op", id: `op.al.lw.${tag}`, function: "fn.compA", block: "block.compA", opKind: "local_write", ordinal: 21, name: aliasName, value: `op.al.fv.${tag}` },
    { kind: "csg.function", id: aliasFid, name: "<anonymous>", parameters: [{ index: 0, name: paramName, optional: false, rest: false, typeSource: paramTypeSource }], returnType: "string" },
    ...bodyReturnOps,
  ];
}

function peerIdBody(aliasFid, paramName, tag) {
  return [
    { kind: "csg.op", id: `op.al.p.${tag}`, function: aliasFid, block: `block.al.${tag}`, opKind: "identifier", ordinal: 1, name: paramName },
    { kind: "csg.op", id: `op.al.r.${tag}`, function: aliasFid, block: `block.al.${tag}`, opKind: "property_read", ordinal: 2, name: "peerId", receiver: `op.al.p.${tag}` },
    { kind: "csg.op", id: `op.al.ret.${tag}`, function: aliasFid, block: `block.al.${tag}`, opKind: "return", ordinal: 3, value: `op.al.r.${tag}` },
  ];
}

// handler `return <aliasName>(e);` where `e` is an object literal typed <literalReturnType>.
function handlerFacts(aliasName, literalReturnType, tag) {
  return [
    { kind: "csg.op", id: `op.h.fnvalue.${tag}`, function: "fn.compA", block: "block.compA", opKind: "function_value", ordinal: 40, targetFunction: "fn.handleTestClose" },
    { kind: "csg.op", id: `op.h.localwrite.${tag}`, function: "fn.compA", block: "block.compA", opKind: "local_write", ordinal: 41, name: "handleTestClose", value: `op.h.fnvalue.${tag}` },
    { kind: "csg.function", id: "fn.handleTestClose", name: "<anonymous>", parameters: [], returnType: "string" },
    { kind: "csg.op", id: `op.h.obj.${tag}`, function: "fn.handleTestClose", block: "block.h", opKind: "object_literal", ordinal: 1, returnType: literalReturnType, properties: [] },
    { kind: "csg.op", id: `op.h.bind.${tag}`, function: "fn.handleTestClose", block: "block.h", opKind: "local_write", ordinal: 2, name: "e", value: `op.h.obj.${tag}` },
    { kind: "csg.op", id: `op.h.e.${tag}`, function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 3, name: "e" },
    { kind: "csg.op", id: `op.h.call.${tag}`, function: "fn.handleTestClose", block: "block.h", opKind: "call", ordinal: 4, callee: aliasName, arguments: [`op.h.e.${tag}`] },
    { kind: "csg.op", id: `op.h.ret.${tag}`, function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 5, value: `op.h.call.${tag}` },
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
await check("positive: union-alias param instantiates with the concrete member type", async () => {
  const coreFacts = [
    ...typeFacts(),
    ...componentFacts(),
    ...aliasFacts("helper", "fn.helper", "envelope", "RealtimeEnvelope", peerIdBody("fn.helper", "envelope", "u"), "u"),
    ...handlerFacts("helper", CHESS_ENV, "u"),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts());
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.ok(
    cht.code.includes(`fn helper__${CHESS_ENV}(envelope: ${CHESS_ENV}): str =`),
    `the callee must compile as a concrete member-type instance: ${cht.code.slice(0, 600)}`,
  );
  assert.ok(cht.code.includes(`helper__${CHESS_ENV}(e)`) || /helper__RealtimeChessSignalEnvelope\(e\)/.test(cht.code), "call site must invoke the mangled instance");
});

// ---------------------------------------------------------------------------
await check("negative: argument type outside the union membership is rejected loudly", async () => {
  const coreFacts = [
    ...typeFacts(),
    ...componentFacts(),
    ...aliasFacts("helper", "fn.helper", "envelope", "RealtimeEnvelope", peerIdBody("fn.helper", "envelope", "u"), "u"),
    ...handlerFacts("helper", DDZ_ENV, "u"), // RealtimeDoudizhuSignalEnvelope is NOT a member of the fixture union
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts());
  assert.equal(cht.count, 0, "a non-member argument type must never be instantiated");
  assert.ok(cht.skips[0].reason.includes("union-argument type"), `reason must name the membership violation: ${cht.skips[0].reason}`);
  assert.ok(cht.skips[0].reason.includes(DDZ_ENV));
});

// ---------------------------------------------------------------------------
await check("positive: indexed access T['field'] maps through the exact field type", async () => {
  const coreFacts = [
    ...typeFacts(),
    ...componentFacts(),
    ...aliasFacts("helper2", "fn.helper2", "action", `${CHESS_ENV}['action']`, [
      { kind: "csg.op", id: "op.a2.id", function: "fn.helper2", block: "block.al.a2", opKind: "identifier", ordinal: 1, name: "action" },
      { kind: "csg.op", id: "op.a2.ret", function: "fn.helper2", block: "block.al.a2", opKind: "return", ordinal: 2, value: "op.a2.id" },
    ], "a2"),
    // handler: `return helper2("move");`
    { kind: "csg.op", id: "op.h.fnvalue.a2", function: "fn.compA", block: "block.compA", opKind: "function_value", ordinal: 40, targetFunction: "fn.handleTestClose" },
    { kind: "csg.op", id: "op.h.localwrite.a2", function: "fn.compA", block: "block.compA", opKind: "local_write", ordinal: 41, name: "handleTestClose", value: "op.h.fnvalue.a2" },
    { kind: "csg.function", id: "fn.handleTestClose", name: "<anonymous>", parameters: [], returnType: "string" },
    { kind: "csg.data", id: "d.move", dataKind: "string", value: "move" },
    { kind: "csg.op", id: "op.h.lit.a2", function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: 1, data: "d.move" },
    { kind: "csg.op", id: "op.h.call.a2", function: "fn.handleTestClose", block: "block.h", opKind: "call", ordinal: 2, callee: "helper2", arguments: ["op.h.lit.a2"] },
    { kind: "csg.op", id: "op.h.ret.a2", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 3, value: "op.h.call.a2" },
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts());
  assert.deepEqual(cht.skips, [], `indexed access param must compile: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.ok(cht.code.includes("fn helper2(action: str): str ="), "indexed access maps to the field's own type (str)");
});

// ---------------------------------------------------------------------------
await check("positive: string-literal union alias keeps the plain str path (never mangled)", async () => {
  const coreFacts = [
    ...typeFacts(),
    ...componentFacts(),
    ...aliasFacts("helper3", "fn.helper3", "s", "VoiceCallState", [
      { kind: "csg.op", id: "op.a3.id", function: "fn.helper3", block: "block.al.a3", opKind: "identifier", ordinal: 1, name: "s" },
      { kind: "csg.op", id: "op.a3.ret", function: "fn.helper3", block: "block.al.a3", opKind: "return", ordinal: 2, value: "op.a3.id" },
    ], "a3"),
    { kind: "csg.op", id: "op.h.fnvalue.a3", function: "fn.compA", block: "block.compA", opKind: "function_value", ordinal: 40, targetFunction: "fn.handleTestClose" },
    { kind: "csg.op", id: "op.h.localwrite.a3", function: "fn.compA", block: "block.compA", opKind: "local_write", ordinal: 41, name: "handleTestClose", value: "op.h.fnvalue.a3" },
    { kind: "csg.function", id: "fn.handleTestClose", name: "<anonymous>", parameters: [], returnType: "string" },
    { kind: "csg.data", id: "d.idle", dataKind: "string", value: "idle" },
    { kind: "csg.op", id: "op.h.lit.a3", function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: 1, data: "d.idle" },
    { kind: "csg.op", id: "op.h.call.a3", function: "fn.handleTestClose", block: "block.h", opKind: "call", ordinal: 2, callee: "helper3", arguments: ["op.h.lit.a3"] },
    { kind: "csg.op", id: "op.h.ret.a3", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 3, value: "op.h.call.a3" },
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts());
  assert.deepEqual(cht.skips, [], `string-literal union alias must compile: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.ok(cht.code.includes("fn helper3(s: str): str ="), "literal union maps to str through the plain path");
  assert.ok(!cht.code.includes("helper3__"), "literal union must NEVER be instance-mangled");
});

process.stdout.write(`mech25 union slice (single instantiation / indexed access / literal union): ${passed}/4 checks passed\n`);
