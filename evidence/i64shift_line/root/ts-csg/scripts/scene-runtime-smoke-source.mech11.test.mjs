// scene-runtime-smoke-source.mech11.test.mjs
//
// 离线单测: mechanism 11 (Set<string> box-ref — processedSignalIdsRef) — hand-authored synthetic
// CsgFact fixtures, same convention as scene-runtime-smoke-source.mech8.test.mjs (import the
// target .mjs's exported pure entry point, feed it a minimal fixture, assert on the real return
// value — no mocking of the mechanism itself).
//
// Mirrors ChessPage.tsx:388 `const processedSignalIdsRef = useRef(new Set<string>())`, used only
// via `.current.has(x)` / `.current.add(x)` / `.current.clear()` (see the 8 read/write sites
// enumerated in the mechanism-11 design pass: 708/1037/1069/1140/1186/1196/1258).
//
// A `<ref>.current.<method>(...)` call extracts with NO separate op for the method name — the
// extractor (csg-core.ts emitCall) puts `memberName`/`arguments` directly on the CALL op, whose
// `receiver` is the `.current` property_read op. So the op sequence for
// `processedSignalIdsRef.current.has("sig1")` is:
//   identifier(processedSignalIdsRef) -> property_read(name:"current") -> call(memberName:"has",
//   receiver:<property_read id>, arguments:[<literal "sig1">])
//
// 4 cases:
//   1. positive           — has/add/clear all classify + compile, generated code uses the real
//                            WebSceneJsonStringArrayContains/add/setLen primitives against a
//                            KV-synced `__chtRef_<name>: str[]` slot, KV key `set:<name>`.
//   2. fail-fast           — an unmodeled op (`.current.forEach(...)`) anywhere on the SAME ref
//                            flips setOk closed for the WHOLE ref (not just that call site): the
//                            handler using has/add/clear on it fails fv-unknown, never a partially
//                            modeled slot.
//   3. fail-fast (arity)   — `.has()` called with the wrong argument count is equally unmodeled
//                            and fails the ref closed the same way.
//   4. multi-ref isolation — two independently-named Set box-refs compiled together each get their
//                            own KV key (`set:refA`/`set:refB`) and their own slot var
//                            (`__chtRef_refA`/`__chtRef_refB`) — no name collision, no shared state.
//
// Usage: node scripts/scene-runtime-smoke-source.mech11.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

function componentFn() {
  return { kind: "csg.function", id: "fn.component", name: "ChessPageTest", parameters: [], returnType: "void" };
}

// `const <refName> = useRef(new Set<string>())` — the classifier only checks that the local_write
// value traces to a `useRef` call (see refNames scan); the constructor argument itself isn't
// inspected, so it's omitted here (kept minimal per the fixture's own convention).
function useRefFacts(refName, ordinalBase) {
  return [
    { kind: "csg.op", id: `op.useRef.call.${refName}`, function: "fn.component", block: "block.component", opKind: "call", ordinal: ordinalBase, callee: "useRef", arguments: [] },
    { kind: "csg.op", id: `op.useRef.write.${refName}`, function: "fn.component", block: "block.component", opKind: "local_write", ordinal: ordinalBase + 1, name: refName, value: `op.useRef.call.${refName}` },
  ];
}

// Bind an anonymous arrow function fact to a name in the component scope (mirrors mech8's own
// fixture note: naming the fn itself, rather than binding via local_write, would make the
// dependency-closure regex misparse the emitted function's own `fn <name>(...)` header line as a
// self-call).
function handlerBindingFacts(handlerName, targetFid, ordinalBase) {
  return [
    { kind: "csg.op", id: `op.fnvalue.${handlerName}`, function: "fn.component", block: "block.component", opKind: "function_value", ordinal: ordinalBase, targetFunction: targetFid },
    { kind: "csg.op", id: `op.localwrite.${handlerName}`, function: "fn.component", block: "block.component", opKind: "local_write", ordinal: ordinalBase + 1, name: handlerName, value: `op.fnvalue.${handlerName}` },
    { kind: "csg.function", id: targetFid, name: "<anonymous>", parameters: [], returnType: "void" },
  ];
}

function stringLiteral(id, value) {
  return [
    { kind: "csg.data", id: `data.${id}`, dataKind: "string", value },
    { kind: "csg.op", id: `op.lit.${id}`, opKind: "literal", data: `data.${id}`, literalKind: "string" },
  ];
}

// `<refName>.current.<method>(args)` — identifier -> property_read("current") -> call. `args` is
// an array of already-registered literal op ids (see stringLiteral above); the returned facts must
// be pushed IMMEDIATELY adjacent (the classifier's scan is positional, `ops[i+1]`/`ops[i+2]`).
function refMethodCallFacts(fid, block, refName, method, tag, args) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.call`, function: fid, block, opKind: "call", callee: `${refName}.current.${method}`, memberName: method, receiver: `${idBase}.cur`, arguments: args },
  ];
}

function eventHandlerFact(handlerName) {
  return { kind: "csg.web.scene.event_handler", effect: `invoke:${handlerName}`, routeIndex: 0, nodeId: 0 };
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

// ---------------------------------------------------------------------------
// 1. Positive: has/add/clear all classify into setBoxRefs and compile, generated code round-trips
//    through the real production JSON-string-array primitives against a KV-synced str[] slot.
await check("positive: has/add/clear all compile against a KV-synced str[] slot", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("processedSignalIdsRef", 1),
    ...handlerBindingFacts("handleTestSignal", "fn.handleTestSignal", 10),
    ...stringLiteral("sig1has", "sig1"),
    ...stringLiteral("sig1add", "sig1"),
    ...refMethodCallFacts("fn.handleTestSignal", "block.h", "processedSignalIdsRef", "has", "h1", [`op.lit.sig1has`]),
    ...refMethodCallFacts("fn.handleTestSignal", "block.h", "processedSignalIdsRef", "add", "h2", [`op.lit.sig1add`]),
    ...refMethodCallFacts("fn.handleTestSignal", "block.h", "processedSignalIdsRef", "clear", "h3", []),
  ];
  const sceneFacts = [eventHandlerFact("handleTestSignal")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.deepEqual(cht.names, ["handleTestSignal"]);
  assert.match(cht.code, /var __chtRef_processedSignalIdsRef: str\[\]/, "must declare the KV-synced str[] slot var");
  assert.match(cht.code, /scene\.WebSceneJsonStringArrayContains\(__chtRef_processedSignalIdsRef, "sig1"\)/, ".has(x) must lower to WebSceneJsonStringArrayContains");
  // The value expression is materialized into a temp var ONCE (let __tN_setVal = "sig1") and that
  // same var is referenced in both the dedup check and the add() call — never the source
  // expression text duplicated verbatim, which would double-evaluate a non-idempotent argument.
  assert.match(cht.code, /let (\w+) = "sig1"\n\s+if !scene\.WebSceneJsonStringArrayContains\(__chtRef_processedSignalIdsRef, \1\):\n\s+add\(__chtRef_processedSignalIdsRef, \1\)/, ".add(x) must materialize the value once and dedup-check before add()");
  assert.match(cht.code, /setLen\(__chtRef_processedSignalIdsRef, 0\)/, ".clear() must lower to setLen(slot, 0)");
  assert.match(cht.code, /scene\.WebSceneParseJsonStringArrayState\(scene\.WebSceneStateValueForRef\(graph, "set:processedSignalIdsRef"\), __chtRef_processedSignalIdsRef\)/, "dispatch must load the slot from KV key set:<name> before the handler body runs");
  assert.match(cht.code, /scene\.WebSceneSetStateValueInternal\(graph, "set:processedSignalIdsRef", scene\.WebSceneEncodeJsonStringArrayState\(__chtRef_processedSignalIdsRef\), true\)/, "dispatch must store the slot back to KV after the handler body runs");
});

// ---------------------------------------------------------------------------
// 2. Fail-fast: the SAME ref also used via an unmodeled call shape (`.current.forEach(...)`)
//    anywhere in the component flips setOk closed for the WHOLE ref — the handler using
//    has/add/clear on it must fail fv-unknown, not a partially-modeled slot.
await check("fail-fast: an unmodeled op on the same ref fails the whole ref closed", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("processedSignalIdsRef", 1),
    ...handlerBindingFacts("handleTestSignal", "fn.handleTestSignal", 10),
    ...handlerBindingFacts("handleOtherUnmodeled", "fn.handleOtherUnmodeled", 20),
    ...stringLiteral("sig1has2", "sig1"),
    ...refMethodCallFacts("fn.handleTestSignal", "block.h", "processedSignalIdsRef", "has", "h1", [`op.lit.sig1has2`]),
    // A DIFFERENT handler calls `.current.forEach(...)` on the SAME ref — not modeled by mechanism
    // 11 (no arity/shape match), so setOk must flip false for the ref globally.
    ...refMethodCallFacts("fn.handleOtherUnmodeled", "block.o", "processedSignalIdsRef", "forEach", "o1", []),
  ];
  const sceneFacts = [eventHandlerFact("handleTestSignal"), eventHandlerFact("handleOtherUnmodeled")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0, "neither handler may compile once the ref is disqualified");
  assert.deepEqual(cht.names, []);
  const reasons = cht.skips.map((s) => s.reason);
  assert.ok(reasons.includes("fv-unknown:processedSignalIdsRef"), `expected fv-unknown:processedSignalIdsRef in ${JSON.stringify(reasons)}`);
  assert.equal(cht.code, "", "zero handlers compiled -> zero generated code, nothing fabricated");
});

// ---------------------------------------------------------------------------
// 3. Fail-fast (arity): `.has()` called with the wrong argument count (0 instead of 1) is
//    equally unmodeled and must fail the ref closed the same way as case 2.
await check("fail-fast: wrong-arity .has() call fails the ref closed", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("processedSignalIdsRef", 1),
    ...handlerBindingFacts("handleTestSignal", "fn.handleTestSignal", 10),
    // `.current.has()` with ZERO arguments — not the modeled 1-argument shape.
    ...refMethodCallFacts("fn.handleTestSignal", "block.h", "processedSignalIdsRef", "has", "h1", []),
  ];
  const sceneFacts = [eventHandlerFact("handleTestSignal")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.count, 0);
  assert.equal(cht.skips.length, 1);
  assert.equal(cht.skips[0].reason, "fv-unknown:processedSignalIdsRef");
});

// ---------------------------------------------------------------------------
// 4. Multi-ref isolation: two independently-named Set box-refs, each used by its own handler,
//    compile together with fully independent KV keys and slot vars — no cross-ref interference.
await check("multi-ref isolation: two named Set box-refs get independent KV keys/slot vars", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("refA", 1),
    ...useRefFacts("refB", 3),
    ...handlerBindingFacts("handleA", "fn.handleA", 10),
    ...handlerBindingFacts("handleB", "fn.handleB", 20),
    ...stringLiteral("sigA", "a"),
    ...stringLiteral("sigB", "b"),
    ...refMethodCallFacts("fn.handleA", "block.a", "refA", "add", "a1", [`op.lit.sigA`]),
    ...refMethodCallFacts("fn.handleB", "block.b", "refB", "add", "b1", [`op.lit.sigB`]),
  ];
  const sceneFacts = [eventHandlerFact("handleA"), eventHandlerFact("handleB")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 2);
  assert.deepEqual([...cht.names].sort(), ["handleA", "handleB"]);
  assert.match(cht.code, /var __chtRef_refA: str\[\]/);
  assert.match(cht.code, /var __chtRef_refB: str\[\]/);
  assert.match(cht.code, /"set:refA"/);
  assert.match(cht.code, /"set:refB"/);
  // handleA's dispatch branch must touch ONLY __chtRef_refA, never __chtRef_refB (and vice versa).
  const handleABranch = cht.code.slice(cht.code.indexOf('__chtName == "handleA"'), cht.code.indexOf('__chtName == "handleB"'));
  assert.match(handleABranch, /__chtRef_refA/);
  assert.doesNotMatch(handleABranch, /__chtRef_refB/, "handleA's dispatch branch must never touch refB's slot");
});

// ---------------------------------------------------------------------------
// 5. Single-evaluation: `.add(<non-literal expr>)` must materialize the value expression into a
//    temp var and evaluate it exactly ONCE, then reference that temp var in both the dedup check
//    and the add() call — never splice the expression's source text into both call sites verbatim
//    (which would silently double-evaluate a non-idempotent argument, e.g. a call with a side
//    effect, at Cheng runtime). Uses `Date.now()` as the non-idempotent argument, same repro shape
//    as the code-review finding this test guards against.
await check("single-evaluation: .add(nonLiteralExpr) evaluates the argument exactly once", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("processedSignalIdsRef", 1),
    ...handlerBindingFacts("handleTestSignal", "fn.handleTestSignal", 10),
    { kind: "csg.op", id: "op.dateNow", function: "fn.handleTestSignal", block: "block.h", opKind: "call", ordinal: 1, callee: "Date.now", arguments: [] },
    ...refMethodCallFacts("fn.handleTestSignal", "block.h", "processedSignalIdsRef", "add", "h1", ["op.dateNow"]),
  ];
  const sceneFacts = [eventHandlerFact("handleTestSignal")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  // Scope the count to JUST the generated handler body (the shared jsDateNow prelude helpers
  // legitimately reference "jsDateNow()" too — jsDateGetFullYearNow's own body plus the "fn
  // jsDateNow():" definition signature itself both contain that substring, which is unrelated
  // boilerplate this assertion must not be confused by).
  const bodyStart = cht.code.indexOf("fn handleTestSignal(): void =");
  const bodyEnd = cht.code.indexOf("\n\nvar __cht_dirty:", bodyStart);
  assert.ok(bodyStart >= 0 && bodyEnd > bodyStart, `must find the generated handler body in:\n${cht.code}`);
  const body = cht.code.slice(bodyStart, bodyEnd);
  const dateNowCalls = (body.match(/jsDateNow\(\)/g) || []).length;
  assert.equal(dateNowCalls, 1, `jsDateNow() must be evaluated exactly once inside the handler body, found ${dateNowCalls} call sites in:\n${body}`);
  assert.match(body, /let (\w+) = jsDateNow\(\)\n\s+if !scene\.WebSceneJsonStringArrayContains\(__chtRef_processedSignalIdsRef, \1\):\n\s+add\(__chtRef_processedSignalIdsRef, \1\)/, "must materialize once into a temp var reused by both the dedup check and add()");
});

process.stdout.write(`PASS (${passed}/5)\n`);
