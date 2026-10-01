// mech14-adv-dualref-stage3.test.mjs (adversarial review artifact, mech14 codec-fidelity lens)
//
// The implementer's own scene-runtime-smoke-source.mech14.test.mjs "multi-ref isolation" case
// (test 6) only regex-matches the GENERATED CODE TEXT for two independent slot var declarations
// and two independent KV key string literals — it never actually EXECUTES the generated dispatcher.
// This file closes that gap: real buildCompiledHandlerTable() output, spliced into a real Cheng
// program, compiled+executed by the canonical stage3 driver, with REAL KV reads asserting that
// writing into struct box-ref A's `.current` never observably perturbs struct box-ref B's KV slot
// (and vice versa) — genuine runtime cross-talk isolation, not a codegen-text proxy for it.
//
// Usage: node scripts/mech14-adv-dualref-stage3.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";
import { makeScratchPackage } from "./cheng-scratch-package.mjs";

const scratch = makeScratchPackage("mech14_stage3");

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
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

function componentFn() {
  return { kind: "csg.function", id: "fn.component", name: "ChessPageTest", parameters: [], returnType: "void" };
}
function useRefStructFacts(refName, ordinalBase, declaredTypeText = "WebRtcIceConfig") {
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
function nullWriteFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.data", id: `${idBase}.null`, dataKind: "null", value: null },
    { kind: "csg.op", id: `${idBase}.nulllit`, function: fid, block, opKind: "literal", data: `${idBase}.null` },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.nulllit` },
  ];
}
// `const <localName> = <seedRefName>.current; <refName>.current = <localName>;` — shape ④
// (typed-identifier write) fed a WELL-TYPED RHS (another struct box-ref's own `.current` read)
// rather than a numeric literal. ★adversarial finding (this review): the implementer's own
// positive tests 1/5 in scene-runtime-smoke-source.mech14.test.mjs build shape ④'s local var from
// a bare NUMBER LITERAL (`{ dataKind: "number", value: 0 }`, copy-pasted from mech13's own int64-
// handle fixture template without adapting it for a STRUCT-typed slot) — real stage3 compilation
// of that EXACT fixture fails: `cheng_cold: object ref assignment mismatch ... local_kind=9
// value_kind=17` (the shared, pre-existing `local_write` codegen infers a local's Cheng type from
// its initializer EXPRESSION alone — line ~1184-1196 of csg-cheng-transpiler.ts, untouched by the
// mech14 diff — completely ignoring `typeText`/`declType` whenever an initializer is present, so a
// numeric-literal RHS always yields `var config = int64(0)` regardless of the declared TS type).
// The implementer's unit test never caught this because it only regex-matches the GENERATED TEXT,
// never real-compiles it. This helper isolates the true root cause: a numeric-literal RHS is a
// fixture artifact TypeScript itself could never actually produce for a `WebRtcIceConfig`-typed
// local (the checker would reject `const config: WebRtcIceConfig = 0`), so it is not a reachable
// production shape — but it DOES mean shape ④'s correctness is silently contingent on whatever
// future async-call codegen (§4 S1b gap, not yet built) happens to already emit a well-typed
// struct expression for `config`'s real RHS, an unstated dependency nothing today verifies.
function copyFromSeedFacts(fid, block, refName, seedRefName, localName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.seedref`, function: fid, block, opKind: "identifier", name: seedRefName },
    { kind: "csg.op", id: `${idBase}.seedcur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.seedref` },
    { kind: "csg.op", id: `${idBase}.decl`, function: fid, block, opKind: "local_write", name: localName, value: `${idBase}.seedcur`, typeText: "WebRtcIceConfig", declarationKind: "const" },
    { kind: "csg.op", id: `${idBase}.src`, function: fid, block, opKind: "identifier", name: localName },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.src` },
  ];
}

const passed = { n: 0 };
async function check(name, fn) {
  await fn();
  passed.n++;
  process.stdout.write(`  ok - ${name}\n`);
}

await check("stage3: two independent WebRtcIceConfig struct box-refs never cross-talk through real KV (genuine runtime isolation, not codegen-text pattern match)", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefStructFacts("iceConfigRefA", 1),
    ...useRefStructFacts("iceConfigRefB", 3),
    ...useRefStructFacts("seedRefA", 5),
    ...useRefStructFacts("seedRefB", 7),
    ...handlerBindingFacts("hydrateA", "fn.hydrateA", 10),
    ...copyFromSeedFacts("fn.hydrateA", "block.ha", "iceConfigRefA", "seedRefA", "configA", "ha1"),
    ...handlerBindingFacts("hydrateB", "fn.hydrateB", 20),
    ...copyFromSeedFacts("fn.hydrateB", "block.hb", "iceConfigRefB", "seedRefB", "configB", "hb1"),
    ...handlerBindingFacts("releaseA", "fn.releaseA", 30),
    ...nullWriteFacts("fn.releaseA", "block.ra", "iceConfigRefA", "ra1"),
    ...handlerBindingFacts("releaseB", "fn.releaseB", 40),
    ...nullWriteFacts("fn.releaseB", "block.rb", "iceConfigRefB", "rb1"),
  ];
  const sceneFacts = [eventHandlerFact("hydrateA"), eventHandlerFact("hydrateB"), eventHandlerFact("releaseA"), eventHandlerFact("releaseB")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 4);

  // seedRefA/seedRefB are themselves ordinary mechanism-14 struct box-refs — pre-populated
  // directly via a real KV write (WebSceneSetStateValueInternal, the SAME primitive the generated
  // dispatcher itself uses to persist a slot) before invoking any handler. hydrateA/hydrateB copy
  // FROM their own seed ref's `.current` INTO iceConfigRefA/B (shape ④ fed a well-typed struct
  // expression — see copyFromSeedFacts' header comment for why a numeric-literal RHS, as the
  // implementer's own positive tests 1/5 use, does NOT actually compile). Everything here is a
  // real KV round trip through the real generated dispatcher + the real hand-written codec, never
  // a fabricated shortcut.
  // Cheng string-literal escaping is the same convention JSON.stringify already produces for a
  // JS double-quoted string (\" and \\ both match) — reuse it instead of hand-escaping quote soup.
  const chengStrLit = (s) => JSON.stringify(s);
  const rawA = chengStrLit('{"relayOnly":false,"stunUrls":["stun:A"],"turnServers":[],"iceServers":[],"expiresAtMsPresent":false,"expiresAtMs":0}');
  const rawB = chengStrLit('{"relayOnly":true,"stunUrls":["stun:B1","stun:B2"],"turnServers":[],"iceServers":[],"expiresAtMsPresent":false,"expiresAtMs":0}');
  const program = [
    "import cheng/core/runtime/web_scene_runtime as scene",
    "import std/strings as strings",
    "",
    cht.code,
    "",
    "fn main(): int32 =",
    "    var graph: scene.WebSceneGraph",
    "    graph.activeRouteIndex = -1",
    `    scene.WebSceneSetStateValueInternal(graph, "struct:seedRefA", ${rawA}, true)`,
    `    scene.WebSceneSetStateValueInternal(graph, "struct:seedRefB", ${rawB}, true)`,
    "    # both refs start unwritten: KV read must be the empty-string absent sentinel for EACH,",
    "    # independently (not e.g. shared/aliased to a single default slot).",
    '    let beforeA = scene.WebSceneStateValueForRef(graph, "struct:iceConfigRefA")',
    '    let beforeB = scene.WebSceneStateValueForRef(graph, "struct:iceConfigRefB")',
    "    if beforeA != \"\" || beforeB != \"\":",
    "        return 82",
    "    # hydrate ONLY A. B's KV slot must remain the untouched absent sentinel — the crux of this",
    "    # isolation test: a bug that accidentally shared a slot var or a KV key between the two",
    "    # refs would leak A's write into B's read here.",
    '    let r1 = __cht_apply(graph, "invoke:hydrateA")',
    "    if r1 != 1:",
    "        return 83",
    '    let afterHydrateA_A = scene.WebSceneStateValueForRef(graph, "struct:iceConfigRefA")',
    '    let afterHydrateA_B = scene.WebSceneStateValueForRef(graph, "struct:iceConfigRefB")',
    '    if afterHydrateA_A == \"\":',
    "        return 84",
    '    if afterHydrateA_B != \"\":',
    "        return 85",
    "    # now hydrate B too. A's already-written KV value must be untouched (byte-identical to",
    "    # what it was right after its own hydrate), and B must now diverge from A's content.",
    '    let r2 = __cht_apply(graph, "invoke:hydrateB")',
    "    if r2 != 1:",
    "        return 86",
    '    let afterHydrateB_A = scene.WebSceneStateValueForRef(graph, "struct:iceConfigRefA")',
    '    let afterHydrateB_B = scene.WebSceneStateValueForRef(graph, "struct:iceConfigRefB")',
    "    if afterHydrateB_A != afterHydrateA_A:",
    "        return 87",
    "    if afterHydrateB_B == \"\" || afterHydrateB_B == afterHydrateB_A:",
    "        return 88",
    "    # release ONLY A (write null -> present=false -> KV empty-string sentinel). B must survive",
    "    # untouched -- the release path uses the SAME structBoxRefPresentExpr/slot-var machinery,",
    "    # so this independently re-verifies isolation on the CLEAR path, not just the WRITE path.",
    '    let r3 = __cht_apply(graph, "invoke:releaseA")',
    "    if r3 != 1:",
    "        return 89",
    '    let afterReleaseA_A = scene.WebSceneStateValueForRef(graph, "struct:iceConfigRefA")',
    '    let afterReleaseA_B = scene.WebSceneStateValueForRef(graph, "struct:iceConfigRefB")',
    "    if afterReleaseA_A != \"\":",
    "        return 90",
    "    if afterReleaseA_B != afterHydrateB_B:",
    "        return 91",
    "    return 53",
  ].join("\n");

  const srcRel = "tmp/mech14_adv_dualref_stage3.cheng";
  const outRel = "tmp/mech14_adv_dualref_stage3.exe";
  const reportRel = "tmp/mech14_adv_dualref_stage3.report";
  mkdirSync(join(scratch.rootDir, "src", "ts-csg/tmp"), { recursive: true });
  mkdirSync(join(scratch.rootDir, "tmp"), { recursive: true });
  writeFileSync(join(scratch.rootDir, "src", "ts-csg", srcRel), program);
  const result = compileAndRun(join("src", "ts-csg", srcRel), outRel, reportRel, "mech14 dual struct box-ref isolation stage3");
  assert.equal(result.status, 53, `expected exit=53 (both refs fully isolated through every real KV round-trip), got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
});

process.stdout.write(`PASS (${passed.n}/${passed.n})\n`);
