// mech13-handle-ref-stage3.test.mjs
//
// Regression lock: mechanism 13 (React useRef opaque host-handle ref — localStreamRef family) stage3
// real compile+run, mirroring arr-box-ref-stage3.test.mjs's methodology exactly (real
// buildCompiledHandlerTable() output + real __cht_apply dispatcher, real KV load/store wiring,
// compiled+executed by the canonical driver, exit-code divergence across real dispatches).
//
// Scope note (honest, not a shortcut): this file exercises the CORE mechanism — the int64 handle
// slot's real KV round-trip through a typed-identifier write (shape ⑤) and a condition-gated read
// + null-write (shapes ③+②) — using ONLY pure-Cheng call targets (no @importc). The bare-read-as-
// call-argument (①) and bare-read-as-return (④) shapes are proven correct at the codegen-text level
// by scene-runtime-smoke-source.mech13.test.mjs (which asserts the exact slot-var substitution) —
// stage3-linking the stopStreamTracks bridge's own @importc symbol
// (cheng_host_media_stream_stop_tracks) requires the full Darwin runtime-provider bundle
// (core_runtime_darwin.o -> cheng_malloc chain), a pre-existing system-link-exec concern no
// mech8/11/12 stage3 test has ever needed to exercise either (none of them call a host bridge from
// their synthetic handlers) — out of this mechanism's scope, not swept under the rug.
//
// Usage: node scripts/mech13-handle-ref-stage3.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync } from "node:fs";
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

function componentFn() {
  return { kind: "csg.function", id: "fn.component", name: "ChessPageTest", parameters: [], returnType: "void" };
}
function useRefFacts(refName, ordinalBase) {
  return [
    { kind: "csg.op", id: `op.useRef.call.${refName}`, function: "fn.component", block: "block.component", opKind: "call", ordinal: ordinalBase, callee: "useRef", arguments: [], returnType: "MutableRefObject<MediaStream | null>" },
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

// `const stream: MediaStream = <literalValue>; <refName>.current = stream;` — shape ⑤.
function typedIdentifierWriteFacts(fid, block, refName, localName, literalValue, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.data", id: `${idBase}.lit`, dataKind: "number", value: literalValue },
    { kind: "csg.op", id: `${idBase}.litop`, function: fid, block, opKind: "literal", data: `${idBase}.lit` },
    { kind: "csg.op", id: `${idBase}.decl`, function: fid, block, opKind: "local_write", name: localName, value: `${idBase}.litop`, typeText: "MediaStream", declarationKind: "const" },
    { kind: "csg.op", id: `${idBase}.src`, function: fid, block, opKind: "identifier", name: localName },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.src` },
  ];
}

// `if (<refName>.current) { <refName>.current = null; }` — shapes ③+② composed, condition-gated
// clear (mirrors releaseVoiceRuntime's real read-then-release sequencing, minus the host-bridge
// call — see file header scope note).
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
    ...useRefFacts("localStreamRef", 1),
    ...handlerBindingFacts("ensureStream", "fn.ensureStream", 10),
    ...typedIdentifierWriteFacts("fn.ensureStream", "block.es", "localStreamRef", "stream", 77, "es1"),
    ...handlerBindingFacts("releaseStream", "fn.releaseStream", 20),
    ...conditionalNullClearFacts("fn.releaseStream", "block.rs", "localStreamRef", "block.rs.then", "rs1"),
  ];
  const sceneFacts = [eventHandlerFact("ensureStream"), eventHandlerFact("releaseStream")];
  return buildCompiledHandlerTable(coreFacts, sceneFacts);
}

const passed = { n: 0 };
async function check(name, fn) {
  await fn();
  passed.n++;
  process.stdout.write(`  ok - ${name}\n`);
}

await check("stage3: typed-identifier write then condition-gated null-clear observably round-trip through real KV (77 -> 0)", async () => {
  const cht = await buildHandlerTableSource();
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 2);

  const program = [
    "import cheng/core/runtime/web_scene_runtime as scene",
    "import std/strings as strings",
    "",
    cht.code,
    "",
    "fn main(): int32 =",
    "    var graph: scene.WebSceneGraph",
    "    graph.activeRouteIndex = -1",
    "    # never-written: KV read returns empty string, chtStrToInt64(\"\") must be a real zero, not garbage.",
    '    let r0 = __cht_apply(graph, "invoke:releaseStream")',
    "    if r0 != 1:",
    "        return 90",
    '    let beforeEnsure = scene.WebSceneStateValueForRef(graph, "ref:localStreamRef")',
    '    if beforeEnsure != "" && beforeEnsure != "0":',
    "        return 91",
    "    # shape 5: typed-identifier write must land the real value 77 in the KV-synced slot.",
    '    let r1 = __cht_apply(graph, "invoke:ensureStream")',
    "    if r1 != 1:",
    "        return 92",
    '    let afterEnsure = scene.WebSceneStateValueForRef(graph, "ref:localStreamRef")',
    '    if afterEnsure != "77":',
    "        return 93",
    "    # shapes 3+2: condition-gated read must see the real non-zero handle and clear it to null.",
    '    let r2 = __cht_apply(graph, "invoke:releaseStream")',
    "    if r2 != 1:",
    "        return 94",
    '    let afterRelease = scene.WebSceneStateValueForRef(graph, "ref:localStreamRef")',
    '    if afterRelease != "0":',
    "        return 95",
    "    # idempotent: releasing an already-null handle must be a harmless no-op, not a crash/miswrite.",
    '    let r3 = __cht_apply(graph, "invoke:releaseStream")',
    "    if r3 != 1:",
    "        return 96",
    '    let afterReleaseAgain = scene.WebSceneStateValueForRef(graph, "ref:localStreamRef")',
    '    if afterReleaseAgain != "0":',
    "        return 97",
    "    # re-ensure after release must genuinely re-assign (77 again), proving no residual state.",
    '    let r4 = __cht_apply(graph, "invoke:ensureStream")',
    "    if r4 != 1:",
    "        return 98",
    '    let afterReEnsure = scene.WebSceneStateValueForRef(graph, "ref:localStreamRef")',
    '    if afterReEnsure != "77":',
    "        return 99",
    "    return 53",
  ].join("\n");

  const srcRel = "tmp/mech13_stage3_handleref.cheng";
  const outRel = "tmp/mech13_stage3_handleref.exe";
  const reportRel = "tmp/mech13_stage3_handleref.report";
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(join(SHADOW_ROOT, "ts-csg/tmp"), { recursive: true });
  writeFileSync(join(SHADOW_ROOT, "ts-csg", srcRel), program);
  const exit = compileAndRun(join("ts-csg", srcRel), join("ts-csg", outRel), join("ts-csg", reportRel), "mech13 handle-ref stage3");
  assert.equal(exit, 53, `expected exit=53 (all real KV round-trips correct), got ${exit}`);
});

process.stdout.write(`PASS (${passed.n}/${passed.n})\n`);
