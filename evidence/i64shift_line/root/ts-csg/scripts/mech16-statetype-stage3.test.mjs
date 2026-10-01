// mech16-statetype-stage3.test.mjs
//
// r4 round (mech16_r3v_a_m16r3b_verdict.md, independent adversarial review of r3 — REFUTED): absorbs
// the review's own two stage3 probes (adv-stateType-collision-stage3-probe.mjs /
// adv-stateType-control-stage3-probe.mjs) into permanent PASS-means-correct regressions, mirroring
// mech13-handle-ref-stage3.test.mjs / mech16-nativescalar-stage3.test.mjs's real compile+run
// methodology (real buildCompiledHandlerTable() output, real __cht_apply dispatcher, compiled+
// executed by the canonical driver — not mocked).
//
// Check A (collision, real stage3 boundary): pre-fix, the review's stage3 probe fed the SAME fixture
// used here into a real cheng.stage3 build and got a REAL, self-contradictory accepted binary
// (`fn readCountB(count: int64): str = return count`, real_backend_codegen=1, zero diagnostics, and
// at runtime an int64 bit pattern silently read as a str struct's .len field). Post-fix, the emitted
// `cht.code` for this exact fixture is the empty string — `buildCompiledHandlerTable` has NOTHING
// left to compile once every consumer of the ambiguous state name is excluded (compiled.length===0
// short-circuits before any codegen at all). This is the strongest form of "never generate a
// self-contradictory signature": there is no signature, period, so there is nothing to feed a real
// stage3 build that could exhibit the pre-fix defect — no stage3 invocation is needed to demonstrate
// this (an empty string cannot be a self-contradictory Cheng function), so this check stays at the
// buildCompiledHandlerTable level, same scope boundary mech16-nativescalar-stage3.test.mjs's own
// header documents for its own out-of-scope pieces.
//
// Check B (regression, real stage3 round-trip): the SAME-name-SAME-type sharing case (the
// established production precedent) must still compile AND run correctly end-to-end on the real
// canonical driver — both components' handlers read the one real KV-backed slot and observe the
// SAME live value, proving the fix does not disturb the legitimate cross-component sharing shape at
// actual runtime, not just at the codegen-text level.
//
// Usage: node scripts/mech16-statetype-stage3.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

const CHENG = "/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3"; // canonical driver, read-only main tree
const SHADOW_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function compileAndRun(relSourcePath, relOutPath, relReportPath, label) {
  const compile = spawnSync(CHENG, [
    "system-link-exec",
    "--root:.",
    `--in:${relSourcePath}`,
    "--emit:exe",
    "--target:arm64-apple-darwin",
    `--out:${relOutPath}`,
    `--report-out:${relReportPath}`,
  ], { cwd: SHADOW_ROOT, encoding: "utf8", timeout: 120000 });
  const outAbs = join(SHADOW_ROOT, relOutPath);
  assert.equal(compile.status, 0, `stage3 compile of ${label} must succeed (rc=${compile.status}): ${compile.stderr}\n${compile.stdout}`);
  assert.match(compile.stdout + compile.stderr, /real_backend_codegen=1/, `${label} must hit real backend codegen, not a stub`);
  chmodSync(outAbs, 0o755);
  const run = spawnSync(outAbs, [], { encoding: "utf8", cwd: SHADOW_ROOT });
  return run.status;
}

function useStateFactsAt(stateName, setterName, fnId, uniqueTag, ordinalBase, tsType) {
  const callId = `op.useState.call.${uniqueTag}`;
  return [
    { kind: "csg.op", id: callId, function: fnId, block: `block.${fnId}`, opKind: "call", ordinal: ordinalBase, callee: "useState",
      returnType: `[${tsType}, React.Dispatch<React.SetStateAction<${tsType}>>]`, arguments: [] },
    { kind: "csg.op", id: `${callId}.value`, function: fnId, block: `block.${fnId}`, opKind: "binding_extract", ordinal: ordinalBase + 1, source: callId, path: [{ index: 0 }], name: stateName },
    { kind: "csg.op", id: `${callId}.setter`, function: fnId, block: `block.${fnId}`, opKind: "binding_extract", ordinal: ordinalBase + 2, source: callId, path: [{ index: 1 }], name: setterName },
  ];
}
function handlerBindingFactsAt(ownerFid, ownerBlock, handlerName, targetFid, ordinalBase) {
  return [
    { kind: "csg.op", id: `op.fnvalue.${handlerName}`, function: ownerFid, block: ownerBlock, opKind: "function_value", ordinal: ordinalBase, targetFunction: targetFid },
    { kind: "csg.op", id: `op.localwrite.${handlerName}`, function: ownerFid, block: ownerBlock, opKind: "local_write", ordinal: ordinalBase + 1, name: handlerName, value: `op.fnvalue.${handlerName}` },
    { kind: "csg.function", id: targetFid, name: "<anonymous>", parameters: [], returnType: "void" },
  ];
}
function returnFreeVarFacts(fid, block, name, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.id`, function: fid, block, opKind: "identifier", name },
    { kind: "csg.op", id: `${idBase}.ret`, function: fid, block, opKind: "return", value: `${idBase}.id` },
  ];
}
function eventHandlerFact(handlerName, routeIndex, nodeId) {
  return { kind: "csg.web.scene.event_handler", effect: `invoke:${handlerName}`, routeIndex, nodeId };
}

const passed = { n: 0 };
async function check(name, fn) {
  await fn();
  passed.n++;
  process.stdout.write(`  ok - ${name}\n`);
}

await check("collision: same-named useState across two components, conflicting declared types (number vs string) — buildCompiledHandlerTable emits the empty program (nothing left to feed a real stage3 build), never a self-contradictory accepted signature", async () => {
  const coreFacts = [
    { kind: "csg.function", id: "fn.componentA", name: "ComponentA", parameters: [], returnType: "void" },
    { kind: "csg.function", id: "fn.componentB", name: "ComponentB", parameters: [], returnType: "void" },
    ...useStateFactsAt("count", "setCountA", "fn.componentA", "stA", 1, "number"),
    ...handlerBindingFactsAt("fn.componentA", "block.componentA", "readCountA", "fn.readA", 10),
    ...returnFreeVarFacts("fn.readA", "block.readA", "count", "ra1"),
    { kind: "csg.function", id: "fn.readA", name: "<anonymous>", parameters: [], returnType: "number" },
    ...useStateFactsAt("count", "setCountB", "fn.componentB", "stB", 20, "string"),
    ...handlerBindingFactsAt("fn.componentB", "block.componentB", "readCountB", "fn.readB", 30),
    ...returnFreeVarFacts("fn.readB", "block.readB", "count", "rb1"),
    { kind: "csg.function", id: "fn.readB", name: "<anonymous>", parameters: [], returnType: "string" },
  ];
  const sceneFacts = [eventHandlerFact("readCountA", 0, 0), eventHandlerFact("readCountB", 0, 1)];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.equal(cht.code, "", `an ambiguous state name must leave nothing compiled at all (compiled.length===0 short-circuit), got: ${JSON.stringify(cht.code)}`);
  assert.equal(cht.count, 0);
  assert.deepEqual(cht.names, []);
  const skipA = cht.skips.find((s) => s.name === "readCountA");
  const skipB = cht.skips.find((s) => s.name === "readCountB");
  assert.match(skipA?.reason ?? "", /fv-unknown:count/);
  assert.match(skipB?.reason ?? "", /fv-unknown:count/);
});

await check("stage3: same-named useState across two components, SAME declared type — real compile+run, both handlers observe the ONE shared live KV value through the shared stateType entry, unaffected by the r4 fix", async () => {
  const coreFacts = [
    { kind: "csg.function", id: "fn.componentA", name: "ComponentA", parameters: [], returnType: "void" },
    { kind: "csg.function", id: "fn.componentB", name: "ComponentB", parameters: [], returnType: "void" },
    ...useStateFactsAt("count", "setCountA", "fn.componentA", "stA2", 1, "number"),
    ...handlerBindingFactsAt("fn.componentA", "block.componentA", "readCountA2", "fn.readA2", 10),
    ...returnFreeVarFacts("fn.readA2", "block.readA2", "count", "ra2"),
    { kind: "csg.function", id: "fn.readA2", name: "<anonymous>", parameters: [], returnType: "number" },
    ...useStateFactsAt("count", "setCountB", "fn.componentB", "stB2", 20, "number"),
    ...handlerBindingFactsAt("fn.componentB", "block.componentB", "readCountB2", "fn.readB2", 30),
    ...returnFreeVarFacts("fn.readB2", "block.readB2", "count", "rb2"),
    { kind: "csg.function", id: "fn.readB2", name: "<anonymous>", parameters: [], returnType: "number" },
  ];
  const sceneFacts = [eventHandlerFact("readCountA2", 0, 0), eventHandlerFact("readCountB2", 0, 1)];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.match(cht.code, /fn readCountA2\(count: int64\): int64 =/);
  assert.match(cht.code, /fn readCountB2\(count: int64\): int64 =/);

  const program = [
    "import cheng/core/runtime/web_scene_runtime as scene",
    "import std/strings as strings",
    "",
    cht.code,
    "",
    "fn main(): int32 =",
    "    var graph: scene.WebSceneGraph",
    "    graph.activeRouteIndex = -1",
    '    scene.WebSceneSetStateValueInternal(graph, "count", "424242", true)',
    "    # component A's own handler must read the real shared live value.",
    '    let r1 = __cht_apply(graph, "invoke:readCountA2")',
    "    if r1 != 1:",
    "        return 90",
    "    # component B's handler must observe the SAME shared value, not a stale/conflicting one —",
    "    # the shared stateType entry (both declarations agree on 'number') is the single source both",
    "    # handlers' generated 'count: int64' parameter is populated from at dispatch time.",
    '    let r2 = __cht_apply(graph, "invoke:readCountB2")',
    "    if r2 != 1:",
    "        return 91",
    "    return 53",
  ].join("\n");

  const srcRel = "tmp/mech16_stage3_statetype_control.cheng";
  const outRel = "tmp/mech16_stage3_statetype_control.exe";
  const reportRel = "tmp/mech16_stage3_statetype_control.report";
  mkdirSync(join(SHADOW_ROOT, "ts-csg/tmp"), { recursive: true });
  writeFileSync(join(SHADOW_ROOT, "ts-csg", srcRel), program);
  const exit = compileAndRun(join("ts-csg", srcRel), join("ts-csg", outRel), join("ts-csg", reportRel), "mech16 stateType same-type control stage3");
  assert.equal(exit, 53, `expected exit=53 (both handlers dispatched successfully against the shared live value), got ${exit}`);
});

process.stdout.write(`PASS (${passed.n}/${passed.n})\n`);
