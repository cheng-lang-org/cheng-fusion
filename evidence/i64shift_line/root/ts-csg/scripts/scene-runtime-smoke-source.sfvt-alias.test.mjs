// scene-runtime-smoke-source.sfvt-alias.test.mjs
//
// 离线单测: sfvt 别名追溯 —— 事件 handler 是组件内局部变量别名链（minified 束的
// `let ve = H` / `q = K` 模式）。当前 sfvt 只认 value op 直接是 function_value /
// useCallback call；`ve = H` 的 value 是 identifier op（引用 H），sfvt 返回 undefined
// → localFunctionTargetByName 漏记 → resolveHandlerFidAndCallName 走 no-fid → CHT 0 编译。
//
// 本测试验证修复: sfvt 对 identifier op 追溯该变量(同函数作用域)的 local_write → 递归。
//
// Usage: node scripts/scene-runtime-smoke-source.sfvt-alias.test.mjs

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

// SettingsPage 组件内 `H = e => {...}`、`let ve = H`、JSX `onSelect={ve}`。
function aliasChainFacts() {
  return [
    { kind: "csg.function", id: "fn.compA", name: "SettingsPage", parameters: [], returnType: "void" },
    // H = e => {...}: H 的 local_write value 是 function_value
    { kind: "csg.op", id: "op.H.fnvalue", function: "fn.compA", block: "block.compA", opKind: "function_value", ordinal: 40, targetFunction: "fn.onSelectImpl" },
    { kind: "csg.op", id: "op.H.localwrite", function: "fn.compA", block: "block.compA", opKind: "local_write", ordinal: 41, name: "H", value: "op.H.fnvalue" },
    // let ve = H: ve 的 local_write value 是 identifier(引用 H)
    { kind: "csg.op", id: "op.ve.identifier", function: "fn.compA", block: "block.compA", opKind: "identifier", ordinal: 42, name: "H", typeText: "() => void" },
    { kind: "csg.op", id: "op.ve.localwrite", function: "fn.compA", block: "block.compA", opKind: "local_write", ordinal: 43, name: "ve", value: "op.ve.identifier" },
    // fn.onSelectImpl 函数体: 入口块 block.h + return
    { kind: "csg.function", id: "fn.onSelectImpl", name: "<anonymous>", parameters: [], returnType: "void", entryBlock: "block.h" },
    { kind: "csg.op", id: "op.h.ret", function: "fn.onSelectImpl", block: "block.h", opKind: "return", ordinal: 1, value: "op.h.zero" },
    { kind: "csg.op", id: "op.h.zero", function: "fn.onSelectImpl", block: "block.h", opKind: "literal", ordinal: 0, literalKind: "number", data: "d.zero" },
    { kind: "csg.data", id: "d.zero", dataKind: "number", value: 0 },
  ];
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

await check("positive: handler `ve` resolves through identifier alias chain H", async () => {
  const coreFacts = [...aliasChainFacts()];
  const sceneFacts = [
    { kind: "csg.web.scene.event_handler", effect: "invoke:ve", routeIndex: 0, nodeId: 9, propName: "onSelect" },
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.ok(!cht.skips.some((s) => s.name === "ve" && s.reason === "no-fid"),
    `ve must resolve, not no-fid skip: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1, `alias handler must compile; skips=${JSON.stringify(cht.skips)}`);
});

// 直接 function_value 基线（非别名）必须保持编译 —— 防回归。
await check("baseline: direct function handler still compiles", async () => {
  const coreFacts = [
    { kind: "csg.function", id: "fn.compA", name: "SettingsPage", parameters: [], returnType: "void" },
    { kind: "csg.op", id: "op.o.fnvalue", function: "fn.compA", block: "block.compA", opKind: "function_value", ordinal: 40, targetFunction: "fn.onClickImpl" },
    { kind: "csg.op", id: "op.o.localwrite", function: "fn.compA", block: "block.compA", opKind: "local_write", ordinal: 41, name: "o", value: "op.o.fnvalue" },
    { kind: "csg.function", id: "fn.onClickImpl", name: "<anonymous>", parameters: [], returnType: "void", entryBlock: "block.o" },
    { kind: "csg.op", id: "op.o.ret", function: "fn.onClickImpl", block: "block.o", opKind: "return", ordinal: 1, value: "op.o.zero" },
    { kind: "csg.op", id: "op.o.zero", function: "fn.onClickImpl", block: "block.o", opKind: "literal", ordinal: 0, literalKind: "number", data: "d.zero2" },
    { kind: "csg.data", id: "d.zero2", dataKind: "number", value: 0 },
  ];
  const sceneFacts = [
    { kind: "csg.web.scene.event_handler", effect: "invoke:o", routeIndex: 0, nodeId: 12, propName: "onClick" },
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 1, `direct handler must compile; skips=${JSON.stringify(cht.skips)}`);
});
// Owner-scoped resolution: two components both write a minified handler name `ve`;
// the event_handler's owner selects the RIGHT one, not the global first-write.
await check("positive: handler `ve` resolves in its OWNER component, not the global first-write", async () => {
  const coreFacts = [
    // component B is the global first-write for `ve` (wrong one)
    { kind: "csg.function", id: "fn.compB", name: "OtherComp", parameters: [], returnType: "void" },
    { kind: "csg.op", id: "opB.ve.fnvalue", function: "fn.compB", block: "blockB", opKind: "function_value", ordinal: 1, targetFunction: "fn.wrongImpl" },
    { kind: "csg.op", id: "opB.ve.write", function: "fn.compB", block: "blockB", opKind: "local_write", ordinal: 2, name: "ve", value: "opB.ve.fnvalue" },
    { kind: "csg.function", id: "fn.wrongImpl", name: "<anonymous>", parameters: [], returnType: "void", entryBlock: "block.w" },
    { kind: "csg.op", id: "op.w.ret", function: "fn.wrongImpl", block: "block.w", opKind: "return", ordinal: 1, value: "op.w.zero" },
    { kind: "csg.op", id: "op.w.zero", function: "fn.wrongImpl", block: "block.w", opKind: "literal", ordinal: 0, literalKind: "number", data: "d.w0" },
    { kind: "csg.data", id: "d.w0", dataKind: "number", value: 0 },
    // component A (the handler's owner) has `ve = H` alias
    { kind: "csg.function", id: "fn.compA", name: "SettingsPage", parameters: [], returnType: "void" },
    { kind: "csg.op", id: "opA.H.fnvalue", function: "fn.compA", block: "blockA", opKind: "function_value", ordinal: 1, targetFunction: "fn.rightImpl" },
    { kind: "csg.op", id: "opA.H.write", function: "fn.compA", block: "blockA", opKind: "local_write", ordinal: 2, name: "H", value: "opA.H.fnvalue" },
    { kind: "csg.op", id: "opA.ve.id", function: "fn.compA", block: "blockA", opKind: "identifier", ordinal: 3, name: "H" },
    { kind: "csg.op", id: "opA.ve.write", function: "fn.compA", block: "blockA", opKind: "local_write", ordinal: 4, name: "ve", value: "opA.ve.id" },
    { kind: "csg.function", id: "fn.rightImpl", name: "<anonymous>", parameters: [], returnType: "void", entryBlock: "block.r" },
    { kind: "csg.op", id: "op.r.ret", function: "fn.rightImpl", block: "block.r", opKind: "return", ordinal: 1, value: "op.r.zero" },
    { kind: "csg.op", id: "op.r.zero", function: "fn.rightImpl", block: "block.r", opKind: "literal", ordinal: 0, literalKind: "number", data: "d.r0" },
    { kind: "csg.data", id: "d.r0", dataKind: "number", value: 0 },
  ];
  const sceneFacts = [
    { kind: "csg.web.scene.event_handler", effect: "invoke:ve", routeIndex: 0, nodeId: 9, propName: "onSelect", owner: "fn.compA" },
  ];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.ok(!cht.skips.some((s) => s.name === "ve" && s.reason === "no-fid"),
    `ve must resolve in owner scope: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1, `owner-scoped handler must compile; skips=${JSON.stringify(cht.skips)}`);
});

process.stdout.write(`sfvt-alias: ${passed} checks passed\n`);
process.exit(passed > 0 ? 0 : 1);
