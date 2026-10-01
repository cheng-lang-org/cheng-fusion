// mech16-nativescalar-stage3.test.mjs
//
// Regression lock: mechanism 16 (React useRef native-scalar box-ref, declaration-driven fallback —
// ChessPage.tsx voiceIceFlushTimerRef/callSetupTimerRef/callClockTimerRef family) stage3 real
// compile+run, mirroring mech13-handle-ref-stage3.test.mjs / mech15-handle-teardown-stage3.test.mjs's
// methodology exactly (real buildCompiledHandlerTable() output + real __cht_apply dispatcher, real
// KV load/store wiring, compiled+executed by the canonical driver, exit-code divergence across real
// dispatches).
//
// Scope note (honest, not a shortcut — same boundary mech13/mech15's own stage3 tests already
// established): this file exercises the CORE new mechanism — the classifier fallback that types a
// `useRef<number | null>` scalar box-ref's `.current = null` write (a shape that was PREVIOUSLY
// unclassifiable: the literal branch's 3 `typeof` checks all miss `data === null`, see
// scene-runtime-smoke-source.mjs's scalarTypeOfValueOp) via the ref's OWN declared type, and proves
// the real int64 KV round-trip end-to-end on the canonical driver. It does NOT stage3-link the two
// new @importc host bridges (cheng_host_clear_timeout/cheng_host_clear_interval) — per
// mech16_verdict.md §5's own scope boundary ("C 侧...真实设备/headless诚实失败两态实现体是 S2/S3 工作,
// 本清单只到注册+契约头声明止步"), no C implementation for those symbols exists yet, so linking a
// handler that calls them would fail at the link stage for a reason orthogonal to this mechanism
// (same as mech13's stopStreamTracks / mech15's chengHostRtcPeerConnectionTeardown, neither of which
// their own stage3 tests link either). The bridge call's CODEGEN TEXT (the exact
// `chengHostClearTimeout(__chtRef_voiceIceFlushTimerRef)` / `@importc("cheng_host_clear_timeout")`
// strings) is proven correct by scene-runtime-smoke-source.mech16.test.mjs instead.
//
// The non-zero starting value is seeded directly into the KV (`scene.WebSceneSetStateValueInternal`,
// same key format `ref:<name>` the generated `chtBoxRefLoadLine`/`chtBoxRefStoreLine` consume) rather
// than through a compiled "set" handler, because EVERY real write shape for this ref family is
// either `= null` (the shape under test) or `= window.setTimeout(...)`/`setInterval(...)` (never
// compiles at all, by design — see the .mech16.test.mjs honest-negative checks) — there is no
// pure-Cheng-compilable non-zero write shape to reuse mech13's own "typed-identifier write lands 77"
// pattern with.
//
// Usage: node scripts/mech16-nativescalar-stage3.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";
import { makeScratchPackage } from "./cheng-scratch-package.mjs";

const scratch = makeScratchPackage("mech16_stage3");

const CHENG = "/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3"; // canonical driver, read-only main tree
const SHADOW_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function compileAndRun(relSourcePath, relOutPath, relReportPath, label) {
  const compile = spawnSync(CHENG, [
    "system-link-exec",
    `--root:${scratch.rootDir}`,
    `--in:${relSourcePath}`,
    "--emit:exe",
    "--target:arm64-apple-darwin",
    `--out:${relOutPath}`,
    `--report-out:${relReportPath}`,
  ], { cwd: scratch.rootDir, encoding: "utf8", timeout: 120000 });
  const outAbs = join(scratch.rootDir, relOutPath);
  assert.equal(compile.status, 0, `stage3 compile of ${label} must succeed (rc=${compile.status}): ${compile.stderr}\n${compile.stdout}\n[kept at ${scratch.rootDir}]`);
  assert.match(compile.stdout + compile.stderr, /real_backend_codegen=1/, `${label} must hit real backend codegen, not a stub`);
  chmodSync(outAbs, 0o755);
  const run = spawnSync(outAbs, [], { encoding: "utf8", cwd: scratch.rootDir });
  return run.status;
}

function componentFn() {
  return { kind: "csg.function", id: "fn.component", name: "ChessPageTest", parameters: [], returnType: "void" };
}
function useRefFacts(refName, ordinalBase, declaredTypeText = "number") {
  return [
    { kind: "csg.op", id: `op.useRef.call.${refName}`, function: "fn.component", block: "block.component", opKind: "call", ordinal: ordinalBase, callee: "useRef", arguments: [], returnType: `MutableRefObject<${declaredTypeText} | null>` },
    { kind: "csg.op", id: `op.useRef.write.${refName}`, function: "fn.component", block: "block.component", opKind: "local_write", ordinal: ordinalBase + 1, name: refName, value: `op.useRef.call.${refName}` },
  ];
}
function handlerBindingFacts(handlerName, targetFid, ordinalBase) {
  return [
    { kind: "csg.op", id: `op.fnvalue.${handlerName}`, function: "fn.component", block: "block.component", opKind: "function_value", ordinal: ordinalBase, targetFunction: targetFid },
    { kind: "csg.op", id: `op.localwrite.${handlerName}`, function: "fn.component", block: "block.component", opKind: "local_write", ordinal: ordinalBase + 1, name: handlerName, value: `op.fnvalue.${handlerName}` },
    { kind: "csg.function", id: targetFid, name: "<anonymous>", parameters: [], returnType: "void" },
  ];
}
function eventHandlerFact(handlerName) {
  return { kind: "csg.web.scene.event_handler", effect: `invoke:${handlerName}`, routeIndex: 0, nodeId: 0 };
}

// `if (<refName>.current) { <refName>.current = null; }` — the real clearVoiceTimers/
// clearQueuedVoiceIceCandidates shape MINUS the host-bridge call (see file header scope note) —
// condition-gated null-clear, reused verbatim from mech13-handle-ref-stage3.test.mjs's own
// conditionalNullClearFacts helper (same op shape, this mechanism does not change the read/branch
// side at all — only the WRITE side's classification).
function conditionalNullClearFacts(fid, block, refName, thenBlock, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref1`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur1`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref1` },
    { kind: "csg.op", id: `${idBase}.branch`, function: fid, block, opKind: "branch_if", condition: `${idBase}.cur1`, thenBlock },
    { kind: "csg.data", id: `${idBase}.null`, dataKind: "null", value: null },
    { kind: "csg.op", id: `${idBase}.nulllit`, function: fid, block: thenBlock, opKind: "literal", data: `${idBase}.null` },
    { kind: "csg.op", id: `${idBase}.ref2`, function: fid, block: thenBlock, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write2`, function: fid, block: thenBlock, opKind: "property_write", name: "current", receiver: `${idBase}.ref2`, value: `${idBase}.nulllit` },
  ];
}

function buildHandlerTableSource() {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("voiceIceFlushTimerRef", 1),
    ...handlerBindingFacts("clearQueuedVoiceIceCandidates", "fn.clearIce", 10),
    ...conditionalNullClearFacts("fn.clearIce", "block.clearIce", "voiceIceFlushTimerRef", "block.clearIce.then", "ci1"),
    ...useRefFacts("callClockTimerRef", 20),
    ...handlerBindingFacts("clearVoiceTimers", "fn.clearTimers", 30),
    ...conditionalNullClearFacts("fn.clearTimers", "block.clearTimers", "callClockTimerRef", "block.clearTimers.then", "ct1"),
  ];
  const sceneFacts = [eventHandlerFact("clearQueuedVoiceIceCandidates"), eventHandlerFact("clearVoiceTimers")];
  return buildCompiledHandlerTable(coreFacts, sceneFacts);
}

const passed = { n: 0 };
async function check(name, fn) {
  await fn();
  passed.n++;
  process.stdout.write(`  ok - ${name}\n`);
}

await check("stage3: a KV-seeded non-zero handle round-trips through the fallback-typed int64 slot and the condition-gated null-write clears it for real (two independent refs)", async () => {
  const cht = await buildHandlerTableSource();
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 2);
  assert.match(cht.code, /var __chtRef_voiceIceFlushTimerRef: int64 = int64\(0\)/, "voiceIceFlushTimerRef must get a real int64 slot, zero-initialized");
  assert.match(cht.code, /var __chtRef_callClockTimerRef: int64 = int64\(0\)/, "callClockTimerRef must get a real int64 slot, zero-initialized");

  const program = [
    "import cheng/core/runtime/web_scene_runtime as scene",
    "import std/strings as strings",
    "",
    cht.code,
    "",
    "fn main(): int32 =",
    "    var graph: scene.WebSceneGraph",
    "    graph.activeRouteIndex = -1",
    "    # never-written: KV read returns empty string, the fallback-typed slot's chtStrToInt64(\"\")",
    "    # must be a real zero, not garbage — proves the zero-init path for a ref whose EVERY real",
    "    # write shape used to be unclassifiable (fv-unknown) before mechanism 16.",
    '    let before = scene.WebSceneStateValueForRef(graph, "ref:voiceIceFlushTimerRef")',
    '    if before != "" && before != "0":',
    "        return 90",
    "    # seed a real non-zero handle directly into the KV (no pure-Cheng-compilable write shape",
    "    # exists for this ref family to do it via a compiled handler — see file header).",
    '    scene.WebSceneSetStateValueInternal(graph, "ref:voiceIceFlushTimerRef", "424242", true)',
    '    scene.WebSceneSetStateValueInternal(graph, "ref:callClockTimerRef", "13579", true)',
    "    # the condition-gated null-clear (the shape mechanism 16 newly classifies) must observe the",
    "    # REAL seeded handle as truthy (int64(424242) != int64(0)) and clear it to a real int64(0),",
    "    # never a fabricated/garbage value.",
    '    let r1 = __cht_apply(graph, "invoke:clearQueuedVoiceIceCandidates")',
    "    if r1 != 1:",
    "        return 91",
    '    let after1 = scene.WebSceneStateValueForRef(graph, "ref:voiceIceFlushTimerRef")',
    '    if after1 != "0":',
    "        return 92",
    "    # idempotent: clearing an already-null handle must be a harmless no-op (guard stays false).",
    '    let r2 = __cht_apply(graph, "invoke:clearQueuedVoiceIceCandidates")',
    "    if r2 != 1:",
    "        return 93",
    '    let after1again = scene.WebSceneStateValueForRef(graph, "ref:voiceIceFlushTimerRef")',
    '    if after1again != "0":',
    "        return 94",
    "    # a SECOND, independently-declared native-scalar ref (callClockTimerRef) must round-trip",
    "    # through its OWN slot, unaffected by the first ref's clear.",
    '    let before2 = scene.WebSceneStateValueForRef(graph, "ref:callClockTimerRef")',
    '    if before2 != "13579":',
    "        return 95",
    '    let r3 = __cht_apply(graph, "invoke:clearVoiceTimers")',
    "    if r3 != 1:",
    "        return 96",
    '    let after2 = scene.WebSceneStateValueForRef(graph, "ref:callClockTimerRef")',
    '    if after2 != "0":',
    "        return 97",
    "    return 53",
  ].join("\n");

  const srcRel = "tmp/mech16_stage3_nativescalar.cheng";
  const outRel = "tmp/mech16_stage3_nativescalar.exe";
  const reportRel = "tmp/mech16_stage3_nativescalar.report";
  mkdirSync(join(scratch.rootDir, "src", "ts-csg/tmp"), { recursive: true });
  mkdirSync(join(scratch.rootDir, "tmp"), { recursive: true });
  writeFileSync(join(scratch.rootDir, "src", "ts-csg", srcRel), program);
  const exit = compileAndRun(join("src", "ts-csg", srcRel), outRel, reportRel, "mech16 native-scalar stage3");
  assert.equal(exit, 53, `expected exit=53 (all real KV round-trips correct), got ${exit}`);
});

process.stdout.write(`PASS (${passed.n}/${passed.n})\n`);
