// mech12-adversarial-stage3.test.mjs
//
// ADVERSARIAL REVIEW, stage3 real compile+run (driver =
// /Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3, read-only main tree): independently
// re-derives the "spread argument evaluated exactly once" claim under a NESTED composition the
// implementer's own tests never construct. Every implementer push fixture (mech12.test.mjs +
// arr-box-ref-stage3.test.mjs) routes the copy-read through an intermediate named local first
// (`const staged = [...stagingRef.current]; pendingIceCandidatesRef.current.push(...staged)`).
// This test instead nests the copy-read DIRECTLY as the push's spread source with NO intermediate
// binding — `pendingIceCandidatesRef.current.push(...[...archiveRef.current])` — the single
// statement JS form (ChessPage.tsx's own single-step call sites are structurally free to take this
// shape; the implementer's classifier code path (isArrPushCall via ID-backreference, independent of
// what the spread wraps) does not special-case "the spread source happens to itself be another
// array-box-ref copy-read"). If the push handler's `let src = <emitExpr(argOp.value)>` materialization
// were buggy in a way that evaluates its argument twice (the exact JS single-evaluation violation
// this review's brief calls out), this shape would double the copy-read's underlying `while` loop,
// which is directly observable both in the generated source text and in the real KV item count after
// one real dispatch (seed archiveRef with a KNOWN count; after exactly one push dispatch,
// pendingIceCandidatesRef must hold EXACTLY that count, not double it).
//
// Usage: node scripts/mech12-adversarial-stage3.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rmSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";
import { makeScratchPackage } from "./cheng-scratch-package.mjs";

const scratch = makeScratchPackage("mech12_adv_stage3");

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
  assert.equal(compile.status, 0, `stage3 compile of ${label} must succeed (rc=${compile.status}): ${compile.stderr}\n${compile.stdout}\n[sources kept at ${scratch.rootDir}]`);
  assert.match(compile.stdout + compile.stderr, /real_backend_codegen=1/, `${label} must hit real backend codegen, not a stub`);
  chmodSync(outAbs, 0o755);
  const run = spawnSync(outAbs, [], { encoding: "utf8", cwd: SHADOW_ROOT });
  return run.status;
}

function componentFn() {
  return { kind: "csg.function", id: "fn.component", name: "AdvStage3Test", parameters: [], returnType: "void" };
}
function arrUseRefFacts(refName, ordinalBase) {
  return [
    { kind: "csg.op", id: `op.useRef.call.${refName}`, function: "fn.component", block: "block.component", opKind: "call", ordinal: ordinalBase, callee: "useRef", arguments: [], returnType: "MutableRefObject<RTCIceCandidateInit[]>" },
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

// `<pushRn>.current.push(...[...<copyRn>.current])` — the copy-read array_literal is the spread's
// VALUE directly, with NO intermediate local_write binding (unlike every implementer fixture).
function nestedCopyIntoPushFacts(fid, block, pushRn, copyRn, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.copyRef`, function: fid, block, opKind: "identifier", name: copyRn },
    { kind: "csg.op", id: `${idBase}.copyCur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.copyRef` },
    { kind: "csg.op", id: `${idBase}.copyLit`, function: fid, block, opKind: "array_literal", elementCount: 1, elements: [`${idBase}.copyCur`], spreadFlags: [true] },
    { kind: "csg.op", id: `${idBase}.spread`, function: fid, block, opKind: "spread", value: `${idBase}.copyLit` },
    { kind: "csg.op", id: `${idBase}.pushRef`, function: fid, block, opKind: "identifier", name: pushRn },
    { kind: "csg.op", id: `${idBase}.pushCur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.pushRef` },
    { kind: "csg.op", id: `${idBase}.pushCall`, function: fid, block, opKind: "call", callee: `${pushRn}.current.push`, memberName: "push", receiver: `${idBase}.pushCur`, arguments: [`${idBase}.spread`] },
  ];
}

function mkCandidateHelper() {
  return [
    "fn mkCandidate(c: str, mid: str, idxPresent: bool, idx: int64): scene.WebSceneIceCandidateRecord =",
    "    var rec: scene.WebSceneIceCandidateRecord",
    "    rec.candidate = c",
    "    rec.sdpMid = mid",
    "    rec.sdpMLineIndexPresent = idxPresent",
    "    rec.sdpMLineIndex = idx",
    "    return rec",
  ].join("\n");
}

const passed = { n: 0 };
async function check(name, fn) {
  await fn();
  passed.n++;
  process.stdout.write(`  ok - ${name}\n`);
}

await check("ADVERSARIAL: classifier + emitExpr correctly handle push(...[...ref.current]) with no intermediate local", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("pendingIceCandidatesRef", 1),
    ...arrUseRefFacts("archiveRef", 3),
    ...handlerBindingFacts("pushNested", "fn.pushNested", 10),
    ...nestedCopyIntoPushFacts("fn.pushNested", "block.h", "pendingIceCandidatesRef", "archiveRef", "h1"),
  ];
  const sceneFacts = [eventHandlerFact("pushNested")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);

  // Static corroboration: the copy-read's own `while` loop (reading archiveRef's slot) must appear
  // EXACTLY ONCE, and the push's own append loop (writing pendingIceCandidatesRef's slot) must ALSO
  // appear exactly once, chained through a single let-bound temp — never duplicated.
  const bodyStart = cht.code.indexOf("fn pushNested(): void =");
  const bodyEnd = cht.code.indexOf("\n\nvar __cht_dirty:", bodyStart);
  assert.ok(bodyStart >= 0 && bodyEnd > bodyStart, `must find the generated handler body in:\n${cht.code}`);
  const body = cht.code.slice(bodyStart, bodyEnd);
  const copyLoops = (body.match(/while \w+ < __chtRef_archiveRef\.len:/g) || []).length;
  assert.equal(copyLoops, 1, `archiveRef copy-read loop must appear exactly once, found ${copyLoops} in:\n${body}`);
  const pushLoops = (body.match(/add\(__chtRef_pendingIceCandidatesRef,/g) || []).length;
  assert.equal(pushLoops, 1, `pendingIceCandidatesRef push-append call site must appear exactly once, found ${pushLoops} in:\n${body}`);

  const program = [
    "import cheng/core/runtime/web_scene_runtime as scene",
    "import std/strings as strings",
    "",
    mkCandidateHelper(),
    "",
    cht.code,
    "",
    "fn main(): int32 =",
    "    var graph: scene.WebSceneGraph",
    "    graph.activeRouteIndex = -1",
    "    var seed: scene.WebSceneIceCandidateRecord[]",
    '    add(seed, share(mkCandidate("nestA", "0", true, int64(0))))',
    '    add(seed, share(mkCandidate("nestB", "1", true, int64(1))))',
    '    let s1 = scene.WebSceneSetStateValueInternal(graph, "arr:archiveRef", scene.WebSceneEncodeIceCandidateArrayState(seed), true)',
    "    if s1 < 0:",
    "        return 90",
    "    # ONE real dispatch of push(...[...archiveRef.current]) with no intermediate local.",
    "    # If the spread source were evaluated twice, pendingIceCandidatesRef would end up with 4",
    "    # items (2 real + 2 duplicated), not 2.",
    '    let r1 = __cht_apply(graph, "invoke:pushNested")',
    "    if r1 != 1:",
    "        return 91",
    "    var afterPush: scene.WebSceneIceCandidateRecord[]",
    '    if !scene.WebSceneParseIceCandidateArrayState(scene.WebSceneStateValueForRef(graph, "arr:pendingIceCandidatesRef"), afterPush):',
    "        return 92",
    "    if afterPush.len != 2:",
    "        return 93",
    '    if afterPush[0].candidate != "nestA" || afterPush[1].candidate != "nestB":',
    "        return 94",
    "    # archiveRef itself must be untouched by the push (a copy-read, not a drain).",
    "    var archiveAfter: scene.WebSceneIceCandidateRecord[]",
    '    if !scene.WebSceneParseIceCandidateArrayState(scene.WebSceneStateValueForRef(graph, "arr:archiveRef"), archiveAfter):',
    "        return 95",
    "    if archiveAfter.len != 2:",
    "        return 96",
    "    return 61",
    "",
  ].join("\n");

  try {
    const srcRel = scratch.writeSource("prog.cheng", program);
    const exit = compileAndRun(srcRel, "prog.exe", "report.txt", "nested-copy-into-push");
    assert.equal(exit, 61, `nested push(...[...ref.current]) must evaluate the copy-read exactly once (2 items in, 2 items pushed), got exit=${exit} (see fail-code map: 90-96)`);
  } finally {
    rmSync(scratch.rootDir, { recursive: true, force: true });
  }
});

process.stdout.write(`PASS (${passed.n}/1)\n`);
