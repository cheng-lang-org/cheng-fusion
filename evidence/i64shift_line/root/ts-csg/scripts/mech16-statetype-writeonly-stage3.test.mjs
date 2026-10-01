// mech16-statetype-writeonly-stage3.test.mjs
//
// r5 round (mech16_r4v_b_m16r4_verdict.md — REFUTED, real defect): absorbs the review's own two
// probes (adv-r4-writeonly-setter-probe.mjs / adv-r4-writeonly-setter-stage3-probe.mjs) into
// permanent PASS-means-correct regressions, mirroring mech16-statetype-stage3.test.mjs's real
// compile+run methodology (real buildCompiledHandlerTable() output, real cheng.stage3 driver — not
// mocked).
//
// The defect the review found: `stateType`'s WRITE-path consumer (the plain-setter `slots` array,
// scene-runtime-smoke-source.mjs ~6755, feeding the `badSlot` gate) used to default a missing lookup
// to `"str"` (`|| "str"`) — a value that always PASSES the very next `chtIsWritableSlotType` check,
// so a handler that only WRITES an ambiguous/unmappable state name (never reads it — the read path's
// own `fv-unknown` honesty was already correct and unaffected by this bug) silently sailed into
// `compiled`, emitting a Cheng function body referencing a KV slot variable that
// `emitStateSlots`/`chtStateInit` never declares (because the ambiguity check correctly excluded it
// from the slot table) — an undeclared-symbol reference, and because `buildCompiledHandlerTable`
// merges every compiled handler into ONE Cheng module, this dragged down an otherwise-healthy,
// completely unrelated handler bundled in the same compile unit alongside it.
//
// Check A (JS layer, real buildCompiledHandlerTable(), not mocked): a write-only setter targeting a
// same-name-conflicting-type useState (`resetCount`, only calls `setCount(777)`, never reads `count`)
// must be excluded from `compiled` with an honest `slot-badtype:` skip — the SAME fail-closed
// treatment the read path (`fv-unknown:`) and the functional-updater path (`fu-badtype:`) already
// had — and, decisively, the unrelated healthy handler bundled in the SAME compile batch
// (`readHealthy`, an unrelated component's unrelated `healthyState`) must be UNAFFECTED: present in
// `cht.names`, absent from `cht.skips`, and the merged `cht.code` must contain zero references to the
// excluded state's slot var/setter (no dangling `__cht_count`/`setCount(`).
//
// Check B (real stage3 boundary): pre-fix, the review's stage3 probe fed this exact fixture (plus the
// stage3-only round-trip wiring) into a real cheng.stage3 build and got `compile.status=2,
// unresolved function call 'setCount'` for the WHOLE merged unit — taking the unrelated healthy
// `readHealthy` handler down with it (never independently compiled; both live in the same `cht.code`
// string). Post-fix, `resetCount` never reaches `compiled` at all, so the merged unit contains only
// `readHealthy` — a real `cheng.stage3 system-link-exec` build of that unit must succeed
// (`real_backend_codegen=1`) and `readHealthy`'s dispatch must execute correctly, proving the healthy
// handler is no longer collateral damage.
//
// Usage: node scripts/mech16-statetype-writeonly-stage3.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

const CHENG = "/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3"; // canonical driver, read-only main tree
const SHADOW_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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

// Shared fixture: two components declare conflicting-type `count` (number vs string, componentA vs
// componentB — same collision shape as mech16.test.mjs checks 12/13), a THIRD handler on componentA
// only WRITES `count` via `setCount(777)` (never reads it — the write-path-specific shape the review
// found), and a completely unrelated fourth component/handler (`readHealthy` / `healthyState`) that
// must never be implicated by anything above.
function buildFixture() {
  const coreFacts = [
    { kind: "csg.function", id: "fn.componentA", name: "ComponentA", parameters: [], returnType: "void" },
    { kind: "csg.function", id: "fn.componentB", name: "ComponentB", parameters: [], returnType: "void" },
    ...useStateFactsAt("count", "setCountA", "fn.componentA", "wstA", 1, "number"),
    ...handlerBindingFactsAt("fn.componentA", "block.componentA", "readCountA", "fn.readA", 10),
    ...returnFreeVarFacts("fn.readA", "block.readA", "count", "wra1"),
    { kind: "csg.function", id: "fn.readA", name: "<anonymous>", parameters: [], returnType: "number" },
    ...useStateFactsAt("count", "setCountB", "fn.componentB", "wstB", 20, "string"),
    ...handlerBindingFactsAt("fn.componentB", "block.componentB", "readCountB", "fn.readB", 30),
    ...returnFreeVarFacts("fn.readB", "block.readB", "count", "wrb1"),
    { kind: "csg.function", id: "fn.readB", name: "<anonymous>", parameters: [], returnType: "string" },
    ...handlerBindingFactsAt("fn.componentA", "block.componentA", "resetCount", "fn.resetCount", 40),
    { kind: "csg.function", id: "fn.resetCount", name: "<anonymous>", parameters: [], returnType: "void" },
    { kind: "csg.data", id: "data.wlit777", dataKind: "number", value: 777 },
    { kind: "csg.op", id: "op.wlit777", function: "fn.resetCount", block: "block.resetCount", opKind: "literal", ordinal: 1, data: "data.wlit777", literalKind: "number" },
    { kind: "csg.op", id: "op.wsetcount.call", function: "fn.resetCount", block: "block.resetCount", opKind: "call", ordinal: 2, callee: "setCount", arguments: ["op.wlit777"] },
    { kind: "csg.function", id: "fn.componentC", name: "ComponentC", parameters: [], returnType: "void" },
    ...useStateFactsAt("healthyState", "setHealthyState", "fn.componentC", "wstC", 1, "number"),
    ...handlerBindingFactsAt("fn.componentC", "block.componentC", "readHealthy", "fn.readHealthy", 10),
    ...returnFreeVarFacts("fn.readHealthy", "block.readHealthy", "healthyState", "wrh1"),
    { kind: "csg.function", id: "fn.readHealthy", name: "<anonymous>", parameters: [], returnType: "number" },
  ];
  const sceneFacts = [
    eventHandlerFact("readCountA", 0, 0),
    eventHandlerFact("readCountB", 0, 1),
    eventHandlerFact("resetCount", 0, 2),
    eventHandlerFact("readHealthy", 0, 3),
  ];
  return { coreFacts, sceneFacts };
}

const passed = { n: 0 };
async function check(name, fn) {
  await fn();
  passed.n++;
  process.stdout.write(`  ok - ${name}\n`);
}

await check("write-only setter on an ambiguous state name (resetCount: setCount(777), never reads count) is excluded with an honest slot-badtype skip — the read path (fv-unknown) and the write path now agree", async () => {
  const { coreFacts, sceneFacts } = buildFixture();
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const skipA = cht.skips.find((s) => s.name === "readCountA");
  const skipB = cht.skips.find((s) => s.name === "readCountB");
  const skipReset = cht.skips.find((s) => s.name === "resetCount");
  assert.match(skipA?.reason ?? "", /fv-unknown:count/, "read path A must stay fv-unknown, unaffected by this round's write-path fix");
  assert.match(skipB?.reason ?? "", /fv-unknown:count/, "read path B must stay fv-unknown, unaffected by this round's write-path fix");
  assert.match(skipReset?.reason ?? "", /slot-badtype:count/, `write-only setter must be excluded with an honest slot-badtype skip, got: ${JSON.stringify(cht.skips)}`);
  assert.ok(!cht.names.includes("resetCount"), "resetCount must never reach the compiled set");
});

await check("the write-only setter's exclusion never drags down the unrelated healthy handler bundled in the SAME compile batch (readHealthy/healthyState, an unrelated component/state) — decisive refutation of the review's blast-radius finding", async () => {
  const { coreFacts, sceneFacts } = buildFixture();
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.ok(cht.names.includes("readHealthy"), "the unrelated healthy handler must still compile normally");
  assert.ok(!cht.skips.some((s) => s.name === "readHealthy"), "the unrelated healthy handler must never be skipped");
  assert.match(cht.code, /fn readHealthy\(healthyState: int64\): int64 =/);
  // decisive: the merged module must carry ZERO trace of the excluded state's slot var or setter —
  // not truncated/malformed, simply never emitted, so there is nothing an undeclared-symbol reference
  // could point at.
  assert.ok(!cht.code.includes("__cht_count"), "excluded slot var __cht_count must never appear in the merged module");
  assert.ok(!cht.code.includes("setCount("), "excluded setter call must never appear in the merged module");
});

await check("stage3: the merged unit (only the unrelated healthy handler survives compiled) builds and runs correctly on the real canonical driver — the healthy handler is no longer collateral damage", async () => {
  const { coreFacts, sceneFacts } = buildFixture();
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.names, ["readHealthy"], "sanity: only the unrelated healthy handler should have survived into this compile unit");

  const program = [
    "import cheng/core/runtime/web_scene_runtime as scene",
    "import std/strings as strings",
    "",
    cht.code,
    "",
    "fn main(): int32 =",
    "    var graph: scene.WebSceneGraph",
    "    graph.activeRouteIndex = -1",
    '    scene.WebSceneSetStateValueInternal(graph, "healthyState", "42", true)',
    '    let r = __cht_apply(graph, "invoke:readHealthy")',
    "    if r != 1:",
    "        return 90",
    "    return 53",
  ].join("\n");

  const srcRel = "tmp/mech16_writeonly_healthy.cheng";
  const outRel = "tmp/mech16_writeonly_healthy.exe";
  const reportRel = "tmp/mech16_writeonly_healthy.report";
  mkdirSync(join(SHADOW_ROOT, "ts-csg/tmp"), { recursive: true });
  writeFileSync(join(SHADOW_ROOT, "ts-csg", srcRel), program);
  const compile = spawnSync(CHENG, [
    "system-link-exec",
    "--root:.",
    `--in:${join("ts-csg", srcRel)}`,
    "--emit:exe",
    "--target:arm64-apple-darwin",
    `--out:${join("ts-csg", outRel)}`,
    `--report-out:${join("ts-csg", reportRel)}`,
  ], { cwd: SHADOW_ROOT, encoding: "utf8", timeout: 120000 });
  assert.equal(compile.status, 0, `stage3 compile of the surviving healthy-only unit must succeed (rc=${compile.status}): ${compile.stderr}\n${compile.stdout}`);
  assert.match(compile.stdout + compile.stderr, /real_backend_codegen=1/, "must hit real backend codegen, not a stub");
  const outAbs = join(SHADOW_ROOT, "ts-csg", outRel);
  chmodSync(outAbs, 0o755);
  const run = spawnSync(outAbs, [], { encoding: "utf8", cwd: SHADOW_ROOT });
  assert.equal(run.status, 53, `expected exit=53 (readHealthy dispatched successfully, unaffected by the excluded write-only setter's exclusion), got ${run.status}`);
});

process.stdout.write(`PASS (${passed.n}/${passed.n})\n`);
