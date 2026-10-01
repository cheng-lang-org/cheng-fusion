// scene-runtime-smoke-source.component-prop.test.mjs
//
// S1a 组件 prop 建模: csg.web.scene.component_prop scene fact(精确身份 = prop 名 + 目标组件 +
// 来源表达式 + 声明可选性, 由 csg-web-materializer.ts 的 emitSceneComponentPropFacts 从提取器
// 的 csg.web.jsx_element 挂载点 fact 再导出) 被 CHT 自由变量解析优先消费, 沿机制7(S1a-r2)
// 的真运行时槽模式解到 `__csg_route_param.<routeId>.<propName>` 的
// scene.WebSceneStateValueForRef 运行时读——绝不从记录的来源表达式烘焙值(静态快照冒充运行时
// 通道 = truth-room 事故形态)。
//
// 消费门禁(全部精确身份, 无启发式):
//   1. handler 路由必须唯一(resolveRouteIdForHandler 既有规则);
//   2. prop 必须在组件自身 props 类型里声明为 OPTIONAL(fact.optional === true)——只有此时 ""
//      才是 JavaScript 自身会产生的值(`prop?: string` undefined), 必填 prop 读未写槽就是伪造;
//   3. 同路由下同 prop 名的全部挂载点绑定必须一致, 不同绑定 = 歧义 → 诚实 fv-unknown, 绝不
//      first-match(与 resolveRouteIdForHandler/resolveRouteContentForHandler 同规则)。
// 不满足以上任一条 → 落到后续分支(手工 CHT_ROUTE_PARAM_SLOTS 等), fact 缺失本身绝不硬失败。
//
// Usage: node scripts/scene-runtime-smoke-source.component-prop.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

// Minimal component-local handler closure whose body reads one free variable (mirrors the
// chtRouteParamRoomIdFacts fixture in smoke.mjs: local_write -> function_value indirection).
function handlerFacts(freeVarName) {
  return [
    { kind: "csg.function", id: "fn.component", name: "TestComponent", parameters: [], returnType: "void" },
    { kind: "csg.op", id: "op.component.fv", function: "fn.component", block: "block.component", opKind: "function_value", ordinal: 1, targetFunction: "fn.handleClose" },
    { kind: "csg.op", id: "op.component.local", function: "fn.component", block: "block.component", opKind: "local_write", ordinal: 2, name: "handleClose", value: "op.component.fv" },
    { kind: "csg.function", id: "fn.handleClose", name: "<anonymous>", parameters: [], returnType: "void" },
    { kind: "csg.op", id: "op.handleClose.id", function: "fn.handleClose", block: "block.handleClose", opKind: "identifier", ordinal: 1, name: freeVarName },
    { kind: "csg.op", id: "op.handleClose.ret", function: "fn.handleClose", block: "block.handleClose", opKind: "return", ordinal: 2 },
  ];
}

function sceneBase() {
  return [
    { kind: "csg.web.scene.route", id: "csg.web.scene.route.0", routeId: "game_xiangqi", routeIndex: 0 },
    { kind: "csg.web.scene.event_handler", routeIndex: 0, nodeId: 1, eventName: "click", actionKind: "invoke", effect: "invoke:handleClose" },
  ];
}

function componentPropFact(overrides) {
  return {
    kind: "csg.web.scene.component_prop",
    id: "csg.web.scene.component_prop.0.0.0",
    routeId: "game_xiangqi",
    routeIndex: 0,
    component: "TestComponent",
    propName: "roomId",
    valueKind: "expression",
    expression: "currentApp.roomId",
    mount: "jsx.mount.1",
    optional: true,
    ...overrides,
  };
}

// 1. Positive: optional prop, unique mount — resolves to the runtime slot read, value never baked.
{
  const table = await buildCompiledHandlerTable(handlerFacts("roomId"), [
    ...sceneBase(),
    componentPropFact({}),
  ]);
  assert.equal(table.count, 1, "optional component prop must compile via the runtime slot");
  assert.match(
    table.code,
    /scene\.WebSceneStateValueForRef\(graph, "__csg_route_param\.game_xiangqi\.roomId"\)/,
    "component prop must read the runtime route-param slot keyed by the handler's real routeId",
  );
  assert.doesNotMatch(table.code, /currentApp\.roomId/, "the mount-site source expression must never be baked as a value");
  assert.doesNotMatch(table.code, /"truth-room"/, "must never bake the truth-mode debug sentinel");
}

// 2. Fact-driven, not table-driven: a prop name that is NOT in the manual CHT_ROUTE_PARAM_SLOTS
// (scenarioId) still resolves — proof the scene fact alone drives the resolution.
{
  const table = await buildCompiledHandlerTable(handlerFacts("scenarioId"), [
    ...sceneBase(),
    componentPropFact({ propName: "scenarioId", expression: "currentApp.scenarioId" }),
  ]);
  assert.equal(table.count, 1, "unregistered prop name must still resolve from the scene fact alone");
  assert.match(
    table.code,
    /scene\.WebSceneStateValueForRef\(graph, "__csg_route_param\.game_xiangqi\.scenarioId"\)/,
    "fact-driven prop must read its own runtime slot",
  );
}

// 3. Negative: a REQUIRED prop (optional === false) must NOT resolve — "" would be a fabricated
// stand-in for a binding JavaScript never omits (truth-room class).
{
  const table = await buildCompiledHandlerTable(handlerFacts("onClose"), [
    ...sceneBase(),
    componentPropFact({ propName: "onClose", expression: "closeCurrentApp", optional: false }),
  ]);
  assert.equal(table.count, 0, "required prop must not resolve to a possibly-unwritten slot");
  assert.ok(table.skips.some((s) => s.name === "handleClose" && s.reason === "fv-unknown:onClose"), "required prop must fail honestly as fv-unknown");
}

// 4. Negative: optionality unproven (no optional flag on the fact) must NOT resolve. The free
// var is scenarioId (NOT in the manual CHT_ROUTE_PARAM_SLOTS), isolating the fact path from the
// manual-table fallback that would otherwise still resolve roomId by design.
{
  const fact = componentPropFact({ propName: "scenarioId", expression: "currentApp.scenarioId" });
  delete fact.optional;
  const table = await buildCompiledHandlerTable(handlerFacts("scenarioId"), [...sceneBase(), fact]);
  assert.equal(table.count, 0, "unproven optionality must not resolve");
  assert.ok(table.skips.some((s) => s.name === "handleClose" && s.reason === "fv-unknown:scenarioId"), "unproven optionality must fail honestly as fv-unknown");
}

// 5. Negative: two mount sites binding the same prop DIFFERENTLY are ambiguous — never first-match.
// (roomId is also absent from CHT_ROUTE_PARAM_SLOTS' fallback path expectations here: the
// ambiguous component-prop branch must fire BEFORE the manual table is consulted.)
{
  const table = await buildCompiledHandlerTable(handlerFacts("roomId"), [
    ...sceneBase(),
    componentPropFact({ id: "csg.web.scene.component_prop.0.0.0", expression: "currentApp.roomId", mount: "jsx.mount.1" }),
    componentPropFact({ id: "csg.web.scene.component_prop.0.1.0", expression: "overlay.roomId", mount: "jsx.mount.2" }),
  ]);
  assert.equal(table.count, 0, "ambiguous mount bindings must not resolve");
  assert.ok(table.skips.some((s) => s.name === "handleClose" && s.reason === "fv-unknown:roomId"), "ambiguous bindings must fail honestly as fv-unknown");
}

// 6. Two mount sites binding the same prop IDENTICALLY agree — the delivery is unambiguous.
{
  const table = await buildCompiledHandlerTable(handlerFacts("roomId"), [
    ...sceneBase(),
    componentPropFact({ id: "csg.web.scene.component_prop.0.0.0", mount: "jsx.mount.1" }),
    componentPropFact({ id: "csg.web.scene.component_prop.0.1.0", mount: "jsx.mount.2" }),
  ]);
  assert.equal(table.count, 1, "identically-bound mounts must resolve");
  assert.match(table.code, /scene\.WebSceneStateValueForRef\(graph, "__csg_route_param\.game_xiangqi\.roomId"\)/);
}

// 7. Negative: a prop fact for a DIFFERENT route must not leak into this handler's resolution.
{
  const table = await buildCompiledHandlerTable(handlerFacts("scenarioId"), [
    ...sceneBase(),
    componentPropFact({ propName: "scenarioId", routeId: "game_doudizhu", routeIndex: 1, expression: "currentApp.scenarioId" }),
  ]);
  assert.equal(table.count, 0, "another route's prop fact must not resolve this handler's free var");
  assert.ok(table.skips.some((s) => s.name === "handleClose" && s.reason === "fv-unknown:scenarioId"), "cross-route fact must fail honestly as fv-unknown");
}

console.log("component-prop scene fact CHT consumption: all tests passed");
