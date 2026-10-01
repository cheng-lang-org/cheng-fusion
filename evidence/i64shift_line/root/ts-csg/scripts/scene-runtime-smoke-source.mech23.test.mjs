// scene-runtime-smoke-source.mech23.test.mjs
//
// 离线单测: mechanism 22 (component prop-callback navigation dispatch — ChessPage handleClose's
// `onClose()` family) + the generated overlay-app nav stack's adversarial semantics proof.
// Same fixture convention as scene-runtime-smoke-source.mech8/20/21/22.test.mjs, plus a real
// cheng_cold compile+run of the nav-stack helper functions (mirroring mech16-stage3's real
// compile+run methodology — the stack is the part whose RUNTIME semantics the task demands an
// adversarial check on; the close_app helper itself needs a live scene graph and is asserted at
// the generated-text level instead, same scope boundary mech16-stage3's header documents).
//
// 5 checks:
//   1. positive — exact component_prop identity (route + propName + unique "closeCurrentApp" +
//      optional===false): handler compiles, emitted code contains the
//      __csg_scene_prop_callback_close_app() dispatch AND the nav-stack runtime (never emitted
//      speculatively — needsPropCloseApp gates it).
//   2. negative (no fact) — no component_prop fact at all: honest prop-callback-unresolved:onClose.
//   3. negative (ambiguous mounts) — two mounts, two expressions: never a first-match, honest
//      prop-callback-unresolved.
//   4. negative (optional prop) — optional===true: a maybe-absent binding must not dispatch.
//   5. adversarial stack semantics (real cheng_cold compile+run) — push A→B→C pops C,B,A
//      (close returns to the IMMEDIATE source), two different source sequences pop to different
//      routes (source-aware, never a static target), empty stack pops -1 (the OVERLAY_NONE
//      fallback path), 16-deep capacity gate rejects the 17th push loudly.
//
// Usage: node scripts/scene-runtime-smoke-source.mech23.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

const CHENG_COLD = "/Users/lbcheng/cheng-lang/.tmp-exec/wall0723/cheng_cold_v8";
const OUT_DIR = new URL("../tmp/mech23", import.meta.url).pathname;

function componentFacts() {
  return [{ kind: "csg.function", id: "fn.compA", name: "ChessPageTest", parameters: [], returnType: "void" }];
}

function handlerFacts() {
  return [
    // `const handleTestClose = () => { onClose(); }` — the prop-callback call as an expression
    // statement (mirrors ChessPage.tsx:1470's real op shape: call op callee="onClose", zero args).
    { kind: "csg.op", id: "op.h.fnvalue", function: "fn.compA", block: "block.compA", opKind: "function_value", ordinal: 10, targetFunction: "fn.handleTestClose" },
    { kind: "csg.op", id: "op.h.localwrite", function: "fn.compA", block: "block.compA", opKind: "local_write", ordinal: 11, name: "handleTestClose", value: "op.h.fnvalue" },
    { kind: "csg.function", id: "fn.handleTestClose", name: "<anonymous>", parameters: [], returnType: "void" },
    { kind: "csg.op", id: "op.h.call", function: "fn.handleTestClose", block: "block.h", opKind: "call", ordinal: 1, callee: "onClose", arguments: [] },
    { kind: "csg.op", id: "op.h.stmt", function: "fn.handleTestClose", block: "block.h", opKind: "expression", ordinal: 2, value: "op.h.call" },
  ];
}

function sceneBase() {
  return [
    { kind: "csg.web.scene.event_handler", effect: "invoke:handleTestClose", routeIndex: 0, nodeId: 0 },
    { kind: "csg.web.scene.route", routeIndex: 0, routeId: "game_xiangqi_test" },
    { kind: "csg.web.scene.route", routeIndex: 1, routeId: "home_default" },
  ];
}

function propFact(overrides) {
  return {
    kind: "csg.web.scene.component_prop", id: `csg.web.scene.component_prop.0.0.${Math.floor(Math.random() * 1e9)}`,
    routeId: "game_xiangqi_test", routeIndex: 0, component: "ChessPageTest", propName: "onClose",
    valueKind: "expression", mount: "m1", expression: "closeCurrentApp", optional: false, ...overrides,
  };
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  process.stdout.write(`  ok - ${name}\n`);
}

// ---------------------------------------------------------------------------
await check("positive: exact component_prop identity dispatches close-app + emits nav stack", async () => {
  const cht = await buildCompiledHandlerTable([...componentFacts(), ...handlerFacts()], [...sceneBase(), propFact({ id: "cp.1" })]);
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.equal(cht.needsPropCloseApp, true);
  assert.ok(cht.code.includes("__csg_scene_prop_callback_close_app()"), "the call must lower to the close-app helper");
  assert.ok(cht.code.includes("var __csgSceneAppNavStack: int32[]"), "nav stack emitted when used");
  assert.ok(cht.code.includes("fn __csg_scene_app_nav_push(routeIndex: int32): bool ="));
  assert.ok(cht.code.includes("fn __csg_scene_app_nav_pop(): int32 ="));
  assert.ok(cht.code.includes("target = 1"), "empty stack falls back to home_default (routeIndex 1) — the OVERLAY_NONE counterpart");
});

// ---------------------------------------------------------------------------
await check("negative: no component_prop fact -> honest prop-callback-unresolved", async () => {
  const cht = await buildCompiledHandlerTable([...componentFacts(), ...handlerFacts()], sceneBase());
  assert.equal(cht.count, 0);
  assert.equal(cht.skips.length, 1);
  assert.equal(cht.skips[0].reason, "prop-callback-unresolved:onClose");
  assert.equal(cht.code, "");
});

// ---------------------------------------------------------------------------
await check("negative: two mounts with two expressions -> ambiguous, never first-match", async () => {
  const facts = [
    ...sceneBase(),
    propFact({ id: "cp.a", mount: "m1", expression: "closeCurrentApp" }),
    propFact({ id: "cp.b", mount: "m2", expression: "() => undefined" }),
  ];
  const cht = await buildCompiledHandlerTable([...componentFacts(), ...handlerFacts()], facts);
  assert.equal(cht.count, 0);
  assert.equal(cht.skips[0].reason, "prop-callback-unresolved:onClose");
});

// ---------------------------------------------------------------------------
await check("negative: optional===true prop must not dispatch (maybe-absent binding)", async () => {
  const cht = await buildCompiledHandlerTable([...componentFacts(), ...handlerFacts()], [...sceneBase(), propFact({ id: "cp.c", optional: true })]);
  assert.equal(cht.count, 0);
  assert.equal(cht.skips[0].reason, "prop-callback-unresolved:onClose");
});

// ---------------------------------------------------------------------------
// 5. Adversarial nav-stack semantics — real cheng_cold compile+run. The stack helpers are
//    extracted VERBATIM from a positive build (never re-implemented in the test), wrapped in a
//    main() that drives the three required adversarial sequences.
await check("adversarial: nav stack push/pop/source-aware/empty/capacity, real compile+run", async () => {
  const cht = await buildCompiledHandlerTable([...componentFacts(), ...handlerFacts()], [...sceneBase(), propFact({ id: "cp.d" })]);
  assert.equal(cht.count, 1);
  const grab = (marker) => {
    const start = cht.code.indexOf(marker);
    assert.ok(start >= 0, `generated code must contain ${marker}`);
    return start;
  };
  // Slice the verbatim stack section: from the var decl to just before the close_app helper
  // (close_app itself needs a live scene graph — asserted at text level in check 1).
  const varStart = grab("var __csgSceneAppNavStack: int32[]");
  const closeStart = grab("fn __csg_scene_prop_callback_close_app(): bool =");
  const stackSection = cht.code.slice(varStart, closeStart).trim();
  assert.ok(stackSection.includes("fn __csg_scene_app_nav_pop(): int32 ="), "stack section must include push AND pop verbatim");
  const harness = `${stackSection}

fn main(): int32 =
    var ok = true
    # sequence 1: A->B->C, close pops to the IMMEDIATE source each time (C, then B, then A)
    if !__csg_scene_app_nav_push(10):
        ok = false
    if !__csg_scene_app_nav_push(20):
        ok = false
    if !__csg_scene_app_nav_push(30):
        ok = false
    if __csg_scene_app_nav_pop() != 30:
        ok = false
    if __csg_scene_app_nav_pop() != 20:
        ok = false
    if __csg_scene_app_nav_pop() != 10:
        ok = false
    # empty stack -> -1 (the OVERLAY_NONE / home_default fallback path), and stays -1
    if __csg_scene_app_nav_pop() != -1:
        ok = false
    if __csg_scene_app_nav_pop() != -1:
        ok = false
    # sequence 2: a DIFFERENT source sequence pops DIFFERENT routes (source-aware, never static)
    if !__csg_scene_app_nav_push(22):
        ok = false
    if !__csg_scene_app_nav_push(26):
        ok = false
    if __csg_scene_app_nav_pop() != 26:
        ok = false
    if __csg_scene_app_nav_pop() != 22:
        ok = false
    # capacity gate: 16 pushes succeed, the 17th fails LOUD (never silently drops a source)
    var i = 0
    while i < 16:
        if !__csg_scene_app_nav_push(i):
            ok = false
        i = i + 1
    if __csg_scene_app_nav_push(99):
        ok = false
    if __csgSceneAppNavStack.len != 16:
        ok = false
    if ok:
        return 0
    return 1
`;
  mkdirSync(OUT_DIR, { recursive: true });
  const srcPath = join(OUT_DIR, "nav_stack_harness.cheng");
  const exePath = join(OUT_DIR, "nav_stack_harness.exe");
  writeFileSync(srcPath, harness, "utf8");
  const compile = spawnSync(CHENG_COLD, [
    "system-link-exec", "--root:.", `--in:${srcPath}`, "--emit:exe",
    "--target:arm64-apple-darwin", `--out:${exePath}`,
  ], { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8", timeout: 120000 });
  assert.equal(compile.status, 0, `cheng_cold compile must succeed: ${compile.stderr}\n${compile.stdout}`);
  chmodSync(exePath, 0o755);
  const run = spawnSync(exePath, [], { encoding: "utf8", timeout: 30000 });
  assert.equal(run.status, 0, `stack adversarial harness must return 0: ${run.stderr}\n${run.stdout}`);
});

process.stdout.write(`mech23 prop-callback dispatch + nav stack: ${passed}/5 checks passed\n`);
