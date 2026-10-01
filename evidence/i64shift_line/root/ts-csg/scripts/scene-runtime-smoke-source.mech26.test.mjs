// scene-runtime-smoke-source.mech26.test.mjs
//
// 离线单测: mechanism-9/10 主体（synchronous-collapse async slice）—— statement 级 try/catch
// lowering（throw new Error -> mark+break -> catch，catch 参数经「csg.binding 同函数记录 ∩ 块
// 内自由名」精确身份，error instanceof Error / error.message 归约）、try/finally 无 catch 的
// 传播（finally 恒执行后标记经通道外传）、Promise.all 顺序求值+首败汇聚、await 通道检查。
// 反例：throw 非 new Error 形 / try 体含循环（break 错层风险）—— 均诚实失败。
// Same fixture convention as mech8/20-25.
//
// Usage: node scripts/scene-runtime-smoke-source.mech26.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

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

// `try { throw new Error("boom"); } catch (error) { return error.message; } return "ok";`
function tryCatchBodyFacts(tag) {
  return [
    { kind: "csg.data", id: `d.boom.${tag}`, dataKind: "string", value: "boom" },
    { kind: "csg.data", id: `d.ok.${tag}`, dataKind: "string", value: "ok" },
    // tryBlock wrapper: real statements nested in block.try
    { kind: "csg.op", id: `op.t.lit.${tag}`, function: "fn.handleTestClose", block: "block.try", opKind: "literal", ordinal: 1, data: `d.boom.${tag}` },
    { kind: "csg.op", id: `op.t.new.${tag}`, function: "fn.handleTestClose", block: "block.try", opKind: "new", ordinal: 2, callee: "Error", arguments: [`op.t.lit.${tag}`] },
    { kind: "csg.op", id: `op.t.throw.${tag}`, function: "fn.handleTestClose", block: "block.try", opKind: "throw", ordinal: 3, value: `op.t.new.${tag}` },
    { kind: "csg.op", id: `op.t.wrap.${tag}`, function: "fn.handleTestClose", block: "block.tryWrap", opKind: "block", ordinal: 1, nestedBlock: "block.try" },
    // catchBlock wrapper: `return error.message;`
    { kind: "csg.op", id: `op.c.err.${tag}`, function: "fn.handleTestClose", block: "block.catch", opKind: "identifier", ordinal: 1, name: "error" },
    { kind: "csg.op", id: `op.c.msg.${tag}`, function: "fn.handleTestClose", block: "block.catch", opKind: "property_read", ordinal: 2, name: "message", receiver: `op.c.err.${tag}` },
    { kind: "csg.op", id: `op.c.ret.${tag}`, function: "fn.handleTestClose", block: "block.catch", opKind: "return", ordinal: 3, value: `op.c.msg.${tag}` },
    { kind: "csg.op", id: `op.c.wrap.${tag}`, function: "fn.handleTestClose", block: "block.catchWrap", opKind: "block", ordinal: 1, nestedBlock: "block.catch" },
    { kind: "csg.op", id: `op.h.try.${tag}`, function: "fn.handleTestClose", block: "block.h", opKind: "try", ordinal: 1, tryBlock: "block.tryWrap", catchBlock: "block.catchWrap" },
    { kind: "csg.op", id: `op.h.lit.${tag}`, function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: 2, data: `d.ok.${tag}` },
    { kind: "csg.op", id: `op.h.ret.${tag}`, function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 3, value: `op.h.lit.${tag}` },
  ];
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

// ---------------------------------------------------------------------------
await check("positive: try/catch lowers throw->mark->catch with message reduction", async () => {
  const coreFacts = [
    ...componentFacts(),
    // extractor record: catch (error) owned by the handler's own function
    { kind: "csg.binding", id: "b.err", owner: "fn.handleTestClose", declarationKind: "catch", name: "error" },
    ...handlerBindingFacts(tryCatchBodyFacts("a")),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts());
  assert.deepEqual(cht.skips, [], `try/catch must compile: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.ok(/var __t\d+_tryErr: str = ""/.test(cht.code), "try mark declared");
  assert.ok(/while true:/.test(cht.code), "one-shot shell present");
  assert.ok(/if len\(__t\d+_tryErr\) > 0:/.test(cht.code), "catch gated on the mark");
  assert.ok(/let error = __t\d+_tryErr/.test(cht.code), "catch param bound from the mark");
  assert.ok(!cht.code.includes("error.message"), "error.message must be REDUCED to the param itself, never a field read on str");
});

// ---------------------------------------------------------------------------
await check("positive: try/finally (no catch) runs finally then propagates via the channel", async () => {
  const coreFacts = [
    ...componentFacts(),
    ...handlerBindingFacts([
      { kind: "csg.data", id: "d.boom.f", dataKind: "string", value: "boom" },
      { kind: "csg.data", id: "d.ok.f", dataKind: "string", value: "ok" },
      { kind: "csg.op", id: "op.t.lit.f", function: "fn.handleTestClose", block: "block.try", opKind: "literal", ordinal: 1, data: "d.boom.f" },
      { kind: "csg.op", id: "op.t.new.f", function: "fn.handleTestClose", block: "block.try", opKind: "new", ordinal: 2, callee: "Error", arguments: ["op.t.lit.f"] },
      { kind: "csg.op", id: "op.t.throw.f", function: "fn.handleTestClose", block: "block.try", opKind: "throw", ordinal: 3, value: "op.t.new.f" },
      { kind: "csg.op", id: "op.t.wrap.f", function: "fn.handleTestClose", block: "block.tryWrap", opKind: "block", ordinal: 1, nestedBlock: "block.try" },
      { kind: "csg.op", id: "op.f.lit.f", function: "fn.handleTestClose", block: "block.fin", opKind: "literal", ordinal: 1, data: "d.ok.f" },
      { kind: "csg.op", id: "op.f.expr.f", function: "fn.handleTestClose", block: "block.fin", opKind: "expression", ordinal: 2, value: "op.f.lit.f" },
      { kind: "csg.op", id: "op.f.wrap.f", function: "fn.handleTestClose", block: "block.finWrap", opKind: "block", ordinal: 1, nestedBlock: "block.fin" },
      { kind: "csg.op", id: "op.h.try.f", function: "fn.handleTestClose", block: "block.h", opKind: "try", ordinal: 1, tryBlock: "block.tryWrap", finallyBlock: "block.finWrap" },
      { kind: "csg.op", id: "op.h.lit.f", function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: 2, data: "d.ok.f" },
      { kind: "csg.op", id: "op.h.ret.f", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 3, value: "op.h.lit.f" },
    ]),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts());
  assert.deepEqual(cht.skips, [], `try/finally must compile: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.ok(cht.code.includes("__chtAsyncError"), "uncaught mark must propagate through the async error channel");
});

// ---------------------------------------------------------------------------
await check("positive: Promise.all evaluates elements in order and merges first failure", async () => {
  // `await Promise.all([a(), b()]); return "done";` — a/b are bare calls to two alias fns.
  const aliasFn = (fid, tag) => [
    { kind: "csg.op", id: `op.al.fv.${tag}`, function: "fn.compA", block: "block.compA", opKind: "function_value", ordinal: 20, targetFunction: fid },
    { kind: "csg.op", id: `op.al.lw.${tag}`, function: "fn.compA", block: "block.compA", opKind: "local_write", ordinal: 21, name: `fn${tag}`, value: `op.al.fv.${tag}` },
    { kind: "csg.function", id: fid, name: "<anonymous>", parameters: [{ index: 0, name: "x", optional: false, rest: false, typeSource: "string" }], returnType: "string" },
    { kind: "csg.data", id: `d.ret.${tag}`, dataKind: "string", value: tag },
    { kind: "csg.op", id: `op.al.lit.${tag}`, function: fid, block: `block.al.${tag}`, opKind: "literal", ordinal: 1, data: `d.ret.${tag}` },
    { kind: "csg.op", id: `op.al.ret.${tag}`, function: fid, block: `block.al.${tag}`, opKind: "return", ordinal: 2, value: `op.al.lit.${tag}` },
  ];
  const coreFacts = [
    ...componentFacts(),
    ...aliasFn("fn.a", "a"),
    ...aliasFn("fn.b", "b"),
    ...handlerBindingFacts([
      { kind: "csg.data", id: "d.x", dataKind: "string", value: "x" },
      { kind: "csg.data", id: "d.done", dataKind: "string", value: "done" },
      { kind: "csg.op", id: "op.h.lit", function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: 1, data: "d.x" },
      { kind: "csg.op", id: "op.h.ca", function: "fn.handleTestClose", block: "block.h", opKind: "call", ordinal: 2, callee: "fna", arguments: ["op.h.lit"] },
      { kind: "csg.op", id: "op.h.cb", function: "fn.handleTestClose", block: "block.h", opKind: "call", ordinal: 3, callee: "fnb", arguments: ["op.h.lit"] },
      { kind: "csg.op", id: "op.h.arr", function: "fn.handleTestClose", block: "block.h", opKind: "array_literal", ordinal: 4, elements: ["op.h.ca", "op.h.cb"] },
      { kind: "csg.op", id: "op.h.p", function: "fn.handleTestClose", block: "block.h", opKind: "identifier", ordinal: 5, name: "Promise" },
      { kind: "csg.op", id: "op.h.all", function: "fn.handleTestClose", block: "block.h", opKind: "call", ordinal: 6, callee: "Promise.all", memberName: "all", receiver: "op.h.p", arguments: ["op.h.arr"] },
      { kind: "csg.op", id: "op.h.await", function: "fn.handleTestClose", block: "block.h", opKind: "await", ordinal: 7, value: "op.h.all" },
      { kind: "csg.op", id: "op.h.expr", function: "fn.handleTestClose", block: "block.h", opKind: "expression", ordinal: 8, value: "op.h.await" },
      { kind: "csg.op", id: "op.h.done", function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: 9, data: "d.done" },
      { kind: "csg.op", id: "op.h.ret", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 10, value: "op.h.done" },
    ]),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts());
  assert.deepEqual(cht.skips, [], `Promise.all must compile: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.ok(/__chtAsyncError = ""/.test(cht.code), "channel cleared before each element");
  assert.ok(/let __t\d+_allErr = __chtAsyncError/.test(cht.code), "per-element failure snapshot");
  assert.ok(/if len\(__t\d+_allErr\) > 0:/.test(cht.code), "first-failure merge present");
});

// ---------------------------------------------------------------------------
await check("negative: non-Error throw shape fails loudly", async () => {
  const coreFacts = [
    ...componentFacts(),
    ...handlerBindingFacts([
      { kind: "csg.data", id: "d.boom.n", dataKind: "string", value: "boom" },
      { kind: "csg.op", id: "op.t.lit.n", function: "fn.handleTestClose", block: "block.try", opKind: "literal", ordinal: 1, data: "d.boom.n" },
      { kind: "csg.op", id: "op.t.throw.n", function: "fn.handleTestClose", block: "block.try", opKind: "throw", ordinal: 2, value: "op.t.lit.n" },
      { kind: "csg.op", id: "op.t.wrap.n", function: "fn.handleTestClose", block: "block.tryWrap", opKind: "block", ordinal: 1, nestedBlock: "block.try" },
      { kind: "csg.op", id: "op.c.wrap.n", function: "fn.handleTestClose", block: "block.catchWrap", opKind: "block", ordinal: 1, nestedBlock: "block.catchEmpty" },
      { kind: "csg.op", id: "op.h.try.n", function: "fn.handleTestClose", block: "block.h", opKind: "try", ordinal: 1, tryBlock: "block.tryWrap", catchBlock: "block.catchWrap" },
      { kind: "csg.data", id: "d.ok.n", dataKind: "string", value: "ok" },
      { kind: "csg.op", id: "op.h.lit.n", function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: 2, data: "d.ok.n" },
      { kind: "csg.op", id: "op.h.ret.n", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 3, value: "op.h.lit.n" },
    ]),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts());
  assert.equal(cht.count, 0, "a bare `throw <string>` must never be silently lowered");
  assert.ok(cht.skips[0].reason.includes("throw"), `reason must name the throw shape: ${cht.skips[0].reason}`);
});

// ---------------------------------------------------------------------------
await check("negative: try body containing a loop fails (break would target the wrong level)", async () => {
  const coreFacts = [
    ...componentFacts(),
    ...handlerBindingFacts([
      { kind: "csg.op", id: "op.t.for.n", function: "fn.handleTestClose", block: "block.try", opKind: "for_count", ordinal: 1, initializerName: "i" },
      { kind: "csg.op", id: "op.t.wrap.n", function: "fn.handleTestClose", block: "block.tryWrap", opKind: "block", ordinal: 1, nestedBlock: "block.try" },
      { kind: "csg.op", id: "op.c.wrap.n", function: "fn.handleTestClose", block: "block.catchWrap", opKind: "block", ordinal: 1, nestedBlock: "block.catchEmpty" },
      { kind: "csg.op", id: "op.h.try.n", function: "fn.handleTestClose", block: "block.h", opKind: "try", ordinal: 1, tryBlock: "block.tryWrap", catchBlock: "block.catchWrap" },
      { kind: "csg.data", id: "d.ok.n2", dataKind: "string", value: "ok" },
      { kind: "csg.op", id: "op.h.lit.n2", function: "fn.handleTestClose", block: "block.h", opKind: "literal", ordinal: 2, data: "d.ok.n2" },
      { kind: "csg.op", id: "op.h.ret.n2", function: "fn.handleTestClose", block: "block.h", opKind: "return", ordinal: 3, value: "op.h.lit.n2" },
    ]),
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts());
  assert.equal(cht.count, 0, "a loop inside the try shell must never be mislowered");
  assert.ok(cht.skips[0].reason.includes("loop"), `reason must name the loop hazard: ${cht.skips[0].reason}`);
});

process.stdout.write(`mech26 synchronous-collapse try/catch/finally/Promise.all/await: ${passed}/5 checks passed\n`);
