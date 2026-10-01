// mech15-handle-teardown-stage3.test.mjs
//
// Regression lock: mechanism 15 (RTCPeerConnection opaque host-handle ref — ChessPage.tsx
// peerConnectionRef family) stage3 real compile+run, mirroring mech13-handle-ref-stage3.test.mjs's
// methodology exactly (real buildCompiledHandlerTable() output + real __cht_apply dispatcher, real
// KV load/store wiring, compiled+executed by the canonical driver).
//
// Scope note (honest, not a shortcut — same boundary mech13-handle-ref-stage3.test.mjs's own file
// header already documents): this file exercises the KV-SYNCED int64 handle SLOT'S real round-trip
// through a typed-identifier write (mirrors mech13 shape ⑤) and the alias-read + null-clear sequence
// (releaseVoiceRuntime's OWN first two statements, `const connection = peerConnectionRef.current;
// peerConnectionRef.current = null;` — both PURE Cheng, no @importc). Stage3-linking the FOLDED
// teardown bridge's own @importc symbol (cheng_host_rtc_peer_connection_teardown) requires the same
// full Darwin runtime-provider bundle mech13's file header already scoped out — no mech8/11/12/13
// stage3 test has ever needed to exercise that either. The fold's own generated-code TEXT (exact
// bridge call substitution, whole 4-property+try/catch block replaced) is verified instead by
// scene-runtime-smoke-source.mech15.test.mjs test 4/5 (mirrors how mech13.test.mjs test 2 verifies
// the stopStreamTracks bridge redirect at the text level, not via stage3 linking).
//
// Usage: node scripts/mech15-handle-teardown-stage3.test.mjs   (after `npm run build`)

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
    { kind: "csg.op", id: `op.useRef.call.${refName}`, function: "fn.component", block: "block.component", opKind: "call", ordinal: ordinalBase, callee: "useRef", arguments: [], returnType: "MutableRefObject<RTCPeerConnection | null>" },
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

// `const stream: RTCPeerConnection = <literalValue>; <refName>.current = stream;` — shape ⑤.
function typedIdentifierWriteFacts(fid, block, refName, localName, literalValue, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.data", id: `${idBase}.lit`, dataKind: "number", value: literalValue },
    { kind: "csg.op", id: `${idBase}.litop`, function: fid, block, opKind: "literal", data: `${idBase}.lit` },
    { kind: "csg.op", id: `${idBase}.decl`, function: fid, block, opKind: "local_write", name: localName, value: `${idBase}.litop`, typeText: "RTCPeerConnection", declarationKind: "const" },
    { kind: "csg.op", id: `${idBase}.src`, function: fid, block, opKind: "identifier", name: localName },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.src` },
  ];
}

// `const connection = <refName>.current; <refName>.current = null;` — releaseVoiceRuntime's OWN
// first two real statements (689-690), the alias-read + null-clear that precedes the guarded
// teardown block. Both PURE Cheng codegen (scalar box-ref bare-read into a local + null-clear
// write) — no @importc, real KV round-trip verifiable end-to-end.
function aliasReadThenNullClearFacts(fid, block, refName, aliasName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref1`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur1`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref1` },
    { kind: "csg.op", id: `${idBase}.aliasdecl`, function: fid, block, opKind: "local_write", name: aliasName, value: `${idBase}.cur1`, typeText: "RTCPeerConnection | null", declarationKind: "const" },
    { kind: "csg.data", id: `${idBase}.null1`, dataKind: "null", value: null },
    { kind: "csg.op", id: `${idBase}.nulllit1`, function: fid, block, opKind: "literal", data: `${idBase}.null1` },
    { kind: "csg.op", id: `${idBase}.ref2`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write2`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref2`, value: `${idBase}.nulllit1` },
    // return the alias value so the compiled handler observably reports what it read before clearing.
    { kind: "csg.op", id: `${idBase}.aliasread`, function: fid, block, opKind: "identifier", name: aliasName },
    { kind: "csg.op", id: `${idBase}.ret`, function: fid, block, opKind: "return", value: `${idBase}.aliasread` },
  ];
}

// mech15 r3 permanent regression (stage3 form, absorbed from the r2-review adversarial finding —
// mech15_review_a_m15r2_verdict.md, REFUTED: real stage3 run observed exit=99, the STALE alias
// value, not the real handle 4242). Both op shapes verified against a REAL `--emit=csg-core` dump
// (see mech15_impl_r3_verdict.md): reassignment compiles to `opKind:"assign"` (left -> a separate
// `identifier` op), lexical block shadow compiles to an ordinary `opKind:"local_write"` inside a
// nested block reached via `{opKind:"block",nestedBlock}` — both carry the SAME per-function
// monotonic `ordinal` the extractor assigns to every op regardless of block.
function aliasTeardownWithReassignFacts(fid, block, refName, declTypeText, aliasName, eventProps, closeMethod, thenBlock, tryBlock, catchBlock, tag) {
  let n = 0;
  const ord = () => n++;
  const idBase = `op.${tag}`;
  const facts = [
    { kind: "csg.op", id: `${idBase}.ref1`, function: fid, block, opKind: "identifier", name: refName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.cur1`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref1`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.aliasdecl`, function: fid, block, opKind: "local_write", name: aliasName, value: `${idBase}.cur1`, typeText: `${declTypeText} | null`, declarationKind: "let", ordinal: ord() },
    { kind: "csg.data", id: `${idBase}.null1`, dataKind: "null", value: null },
    { kind: "csg.op", id: `${idBase}.nulllit1`, function: fid, block, opKind: "literal", data: `${idBase}.null1`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.ref2`, function: fid, block, opKind: "identifier", name: refName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.write2`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref2`, value: `${idBase}.nulllit1`, ordinal: ord() },
    // INJECTED: `connection = 999;` — real shape verified = opKind:"assign", left -> its own
    // identifier op (not a local_write).
    { kind: "csg.data", id: `${idBase}.escapeVal`, dataKind: "number", value: 999 },
    { kind: "csg.op", id: `${idBase}.escapelit`, function: fid, block, opKind: "literal", data: `${idBase}.escapeVal`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.assignlhs`, function: fid, block, opKind: "identifier", name: aliasName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.reassign`, function: fid, block, opKind: "assign", operator: "FirstAssignment", left: `${idBase}.assignlhs`, right: `${idBase}.escapelit`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.condref`, function: fid, block, opKind: "identifier", name: aliasName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.branch`, function: fid, block, opKind: "branch_if", condition: `${idBase}.condref`, thenBlock, ordinal: ord() },
  ];
  eventProps.forEach((prop, i) => {
    facts.push({ kind: "csg.data", id: `${idBase}.pnull${i}`, dataKind: "null", value: null });
    facts.push({ kind: "csg.op", id: `${idBase}.pnulllit${i}`, function: fid, block: thenBlock, opKind: "literal", data: `${idBase}.pnull${i}`, ordinal: ord() });
    facts.push({ kind: "csg.op", id: `${idBase}.pref${i}`, function: fid, block: thenBlock, opKind: "identifier", name: aliasName, ordinal: ord() });
    facts.push({ kind: "csg.op", id: `${idBase}.pwrite${i}`, function: fid, block: thenBlock, opKind: "property_write", name: prop, receiver: `${idBase}.pref${i}`, value: `${idBase}.pnulllit${i}`, ordinal: ord() });
  });
  facts.push({ kind: "csg.op", id: `${idBase}.closeref`, function: fid, block: tryBlock, opKind: "identifier", name: aliasName, ordinal: ord() });
  facts.push({ kind: "csg.op", id: `${idBase}.closecall`, function: fid, block: tryBlock, opKind: "call", callee: `${aliasName}.${closeMethod}`, memberName: closeMethod, receiver: `${idBase}.closeref`, arguments: [], argumentCount: 0, ordinal: ord() });
  facts.push({ kind: "csg.op", id: `${idBase}.try`, function: fid, block: thenBlock, opKind: "try", tryBlock, catchBlock, ordinal: ord() });
  return facts;
}

function aliasTeardownWithShadowFacts(fid, block, refName, declTypeText, aliasName, eventProps, closeMethod, shadowBlock, thenBlock, tryBlock, catchBlock, tag) {
  let n = 0;
  const ord = () => n++;
  const idBase = `op.${tag}`;
  const facts = [
    { kind: "csg.op", id: `${idBase}.ref1`, function: fid, block, opKind: "identifier", name: refName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.cur1`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref1`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.aliasdecl`, function: fid, block, opKind: "local_write", name: aliasName, value: `${idBase}.cur1`, typeText: `${declTypeText} | null`, declarationKind: "const", ordinal: ord() },
    { kind: "csg.data", id: `${idBase}.null1`, dataKind: "null", value: null },
    { kind: "csg.op", id: `${idBase}.nulllit1`, function: fid, block, opKind: "literal", data: `${idBase}.null1`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.ref2`, function: fid, block, opKind: "identifier", name: refName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.write2`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref2`, value: `${idBase}.nulllit1`, ordinal: ord() },
    // INJECTED: `{ const connection = 999; }` — legal lexical-block-shadowing redeclaration, real
    // shape verified = opKind:"local_write" (declarationKind:"const") inside a nested block.
    { kind: "csg.op", id: `${idBase}.shadowwrap`, function: fid, block, opKind: "block", nestedBlock: shadowBlock, ordinal: ord() },
    { kind: "csg.data", id: `${idBase}.shadowVal`, dataKind: "number", value: 999 },
    { kind: "csg.op", id: `${idBase}.shadowlit`, function: fid, block: shadowBlock, opKind: "literal", data: `${idBase}.shadowVal`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.shadowdecl`, function: fid, block: shadowBlock, opKind: "local_write", name: aliasName, value: `${idBase}.shadowlit`, typeText: "number", declarationKind: "const", ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.condref`, function: fid, block, opKind: "identifier", name: aliasName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.branch`, function: fid, block, opKind: "branch_if", condition: `${idBase}.condref`, thenBlock, ordinal: ord() },
  ];
  eventProps.forEach((prop, i) => {
    facts.push({ kind: "csg.data", id: `${idBase}.pnull${i}`, dataKind: "null", value: null });
    facts.push({ kind: "csg.op", id: `${idBase}.pnulllit${i}`, function: fid, block: thenBlock, opKind: "literal", data: `${idBase}.pnull${i}`, ordinal: ord() });
    facts.push({ kind: "csg.op", id: `${idBase}.pref${i}`, function: fid, block: thenBlock, opKind: "identifier", name: aliasName, ordinal: ord() });
    facts.push({ kind: "csg.op", id: `${idBase}.pwrite${i}`, function: fid, block: thenBlock, opKind: "property_write", name: prop, receiver: `${idBase}.pref${i}`, value: `${idBase}.pnulllit${i}`, ordinal: ord() });
  });
  facts.push({ kind: "csg.op", id: `${idBase}.closeref`, function: fid, block: tryBlock, opKind: "identifier", name: aliasName, ordinal: ord() });
  facts.push({ kind: "csg.op", id: `${idBase}.closecall`, function: fid, block: tryBlock, opKind: "call", callee: `${aliasName}.${closeMethod}`, memberName: closeMethod, receiver: `${idBase}.closeref`, arguments: [], argumentCount: 0, ordinal: ord() });
  facts.push({ kind: "csg.op", id: `${idBase}.try`, function: fid, block: thenBlock, opKind: "try", tryBlock, catchBlock, ordinal: ord() });
  return facts;
}

// mech15 r5 permanent regression (stage3 form, absorbed from the r4-round adversarial review's
// REFUTED finding — `mech15_impl_r4_verdict.md` review-b §3-§5): a `for_of` loop's OWN iteration
// variable name-collides with the alias name. Op shapes copied verbatim from
// `mech15_r4v_b_m15r4v/ts-csg/scripts/adv-r4-forofvar-and-nested.mjs` (scenario 1) — the alias-decl
// prefix identical to `aliasReadThenNullClearFacts` above, plus an unrelated `for_of` over an inline
// array literal whose OWN `initializerName` shadows the alias, guard living inside the loop body.
function forofLoopVarCollisionFacts(fid, outerBlock, refName, aliasName, itemsRefName, eventProps, closeMethod, loopBodyBlock, thenBlock, tryBlock, catchBlock, tag) {
  let n = 0;
  const ord = () => n++;
  const idBase = `op.${tag}`;
  const facts = [
    { kind: "csg.op", id: `${idBase}.ref1`, function: fid, block: outerBlock, opKind: "identifier", name: refName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.cur1`, function: fid, block: outerBlock, opKind: "property_read", name: "current", receiver: `${idBase}.ref1`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.aliasdecl`, function: fid, block: outerBlock, opKind: "local_write", name: aliasName, value: `${idBase}.cur1`, typeText: "RTCPeerConnection | null", declarationKind: "const", ordinal: ord() },
    { kind: "csg.data", id: `${idBase}.null1`, dataKind: "null", value: null },
    { kind: "csg.op", id: `${idBase}.nulllit1`, function: fid, block: outerBlock, opKind: "literal", data: `${idBase}.null1`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.ref2`, function: fid, block: outerBlock, opKind: "identifier", name: refName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.write2`, function: fid, block: outerBlock, opKind: "property_write", name: "current", receiver: `${idBase}.ref2`, value: `${idBase}.nulllit1`, ordinal: ord() },
    // UNRELATED for_of loop over an inline array literal `[111, 222, 333]`, own iteration var name
    // COLLIDES with the alias name.
    { kind: "csg.data", id: `${idBase}.item0`, dataKind: "number", value: 111 },
    { kind: "csg.data", id: `${idBase}.item1`, dataKind: "number", value: 222 },
    { kind: "csg.data", id: `${idBase}.item2`, dataKind: "number", value: 333 },
    { kind: "csg.op", id: `${idBase}.item0op`, function: fid, block: outerBlock, opKind: "literal", data: `${idBase}.item0`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.item1op`, function: fid, block: outerBlock, opKind: "literal", data: `${idBase}.item1`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.item2op`, function: fid, block: outerBlock, opKind: "literal", data: `${idBase}.item2`, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.itemsid`, function: fid, block: outerBlock, opKind: "array_literal", elements: [`${idBase}.item0op`, `${idBase}.item1op`, `${idBase}.item2op`], spreadFlags: [false, false, false], ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.forof`, function: fid, block: outerBlock, opKind: "for_of", iterable: `${idBase}.itemsid`, initializerName: aliasName, bodyBlock: loopBodyBlock, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.condref`, function: fid, block: loopBodyBlock, opKind: "identifier", name: aliasName, ordinal: ord() },
    { kind: "csg.op", id: `${idBase}.branch`, function: fid, block: loopBodyBlock, opKind: "branch_if", condition: `${idBase}.condref`, thenBlock, ordinal: ord() },
  ];
  eventProps.forEach((prop, i) => {
    facts.push({ kind: "csg.data", id: `${idBase}.pnull${i}`, dataKind: "null", value: null });
    facts.push({ kind: "csg.op", id: `${idBase}.pnulllit${i}`, function: fid, block: thenBlock, opKind: "literal", data: `${idBase}.pnull${i}`, ordinal: ord() });
    facts.push({ kind: "csg.op", id: `${idBase}.pref${i}`, function: fid, block: thenBlock, opKind: "identifier", name: aliasName, ordinal: ord() });
    facts.push({ kind: "csg.op", id: `${idBase}.pwrite${i}`, function: fid, block: thenBlock, opKind: "property_write", name: prop, receiver: `${idBase}.pref${i}`, value: `${idBase}.pnulllit${i}`, ordinal: ord() });
  });
  facts.push({ kind: "csg.op", id: `${idBase}.closeref`, function: fid, block: tryBlock, opKind: "identifier", name: aliasName, ordinal: ord() });
  facts.push({ kind: "csg.op", id: `${idBase}.closecall`, function: fid, block: tryBlock, opKind: "call", callee: `${aliasName}.${closeMethod}`, memberName: closeMethod, receiver: `${idBase}.closeref`, arguments: [], argumentCount: 0, ordinal: ord() });
  facts.push({ kind: "csg.op", id: `${idBase}.try`, function: fid, block: thenBlock, opKind: "try", tryBlock, catchBlock, ordinal: ord() });
  return facts;
}

function buildHandlerTableSource() {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("peerConnectionRef", 1),
    ...handlerBindingFacts("ensurePeer", "fn.ensurePeer", 10),
    ...typedIdentifierWriteFacts("fn.ensurePeer", "block.ensurePeer", "peerConnectionRef", "connection", 4242, "ep1"),
    ...handlerBindingFacts("releasePeerPrefix", "fn.releasePeerPrefix", 20),
    ...aliasReadThenNullClearFacts("fn.releasePeerPrefix", "block.releasePeerPrefix", "peerConnectionRef", "connection", "rp1"),
  ];
  const sceneFacts = [eventHandlerFact("ensurePeer"), eventHandlerFact("releasePeerPrefix")];
  return buildCompiledHandlerTable(coreFacts, sceneFacts);
}

const passed = { n: 0 };
async function check(name, fn) {
  await fn();
  passed.n++;
  process.stdout.write(`  ok - ${name}\n`);
}

await check("stage3: RTCPeerConnection handle slot — typed-identifier write then alias-read+null-clear observably round-trip through real KV (4242 -> 4242 read back, then 0)", async () => {
  const cht = await buildHandlerTableSource();
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 2);
  assert.match(cht.code, /var __chtRef_peerConnectionRef: int64/, "must reuse the existing scalar box-ref int64 slot, no new storage mechanism");

  const program = [
    "import cheng/core/runtime/web_scene_runtime as scene",
    "import std/strings as strings",
    "",
    cht.code,
    "",
    "fn main(): int32 =",
    "    var graph: scene.WebSceneGraph",
    "    graph.activeRouteIndex = -1",
    "    # never-written: KV read returns empty string, chtStrToInt64(\"\") must be a real zero.",
    '    let beforeEnsure = scene.WebSceneStateValueForRef(graph, "ref:peerConnectionRef")',
    '    if beforeEnsure != "" && beforeEnsure != "0":',
    "        return 90",
    "    # typed-identifier write must land the real value 4242 in the KV-synced slot.",
    '    let r1 = __cht_apply(graph, "invoke:ensurePeer")',
    "    if r1 != 1:",
    "        return 91",
    '    let afterEnsure = scene.WebSceneStateValueForRef(graph, "ref:peerConnectionRef")',
    '    if afterEnsure != "4242":',
    "        return 92",
    "    # alias-read (releaseVoiceRuntime's own first statement) must observe the real 4242 handle,",
    "    # then the ref's own null-clear write must zero the KV slot — the exact prefix sequence the",
    "    # real teardown idiom's `if (connection)` guard is evaluated against.",
    '    let r2 = __cht_apply(graph, "invoke:releasePeerPrefix")',
    "    if r2 != 1:",
    "        return 93",
    '    let afterRelease = scene.WebSceneStateValueForRef(graph, "ref:peerConnectionRef")',
    '    if afterRelease != "0":',
    "        return 94",
    "    # idempotent: releasing an already-null handle must be a harmless no-op, not a crash/miswrite.",
    '    let r3 = __cht_apply(graph, "invoke:releasePeerPrefix")',
    "    if r3 != 1:",
    "        return 95",
    '    let afterReleaseAgain = scene.WebSceneStateValueForRef(graph, "ref:peerConnectionRef")',
    '    if afterReleaseAgain != "0":',
    "        return 96",
    "    return 53",
  ].join("\n");

  const srcRel = "tmp/mech15_stage3_handleteardown.cheng";
  const outRel = "tmp/mech15_stage3_handleteardown.exe";
  const reportRel = "tmp/mech15_stage3_handleteardown.report";
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(join(SHADOW_ROOT, "ts-csg/tmp"), { recursive: true });
  writeFileSync(join(SHADOW_ROOT, "ts-csg", srcRel), program);
  const exit = compileAndRun(join("ts-csg", srcRel), join("ts-csg", outRel), join("ts-csg", reportRel), "mech15 handle-teardown prefix stage3");
  assert.equal(exit, 53, `expected exit=53 (all real KV round-trips correct), got ${exit}`);
});

// mech15 r3 permanent regression (stage3 form): before this fix, feeding the EXACT generated body
// this reassignment fixture produces into a stage3 program and probing what value the folded
// bridge call observed gave exit=99 (the STALE alias 999), never 42 (the real handle 4242) — see
// mech15_review_a_m15r2_verdict.md. The fix refuses the fold entirely (interfering write detected),
// so the whole handler fails to transpile (property-write on an unsupported int64 receiver) and is
// OMITTED from the generated dispatcher outright — proving no path exists for ANY value (real or
// stale) to reach a bridge call, and that calling the uncompiled handler name is a harmless no-op
// that leaves the real ref state untouched (not a crash, not a silent partial effect).
await check("stage3 r3 regression: reassignment between alias decl and teardown guard never reaches a bridge call — handler is honestly omitted, ref state untouched", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("peerConnectionRef", 1),
    ...handlerBindingFacts("ensurePeerReassign", "fn.ensureReassign", 10),
    ...typedIdentifierWriteFacts("fn.ensureReassign", "block.ensureReassign", "peerConnectionRef", "streamR", 4242, "erp1"),
    ...handlerBindingFacts("releaseVoiceRuntimeEscapeReassign", "fn.escapeReassign", 20),
    ...aliasTeardownWithReassignFacts(
      "fn.escapeReassign", "block.escapeReassign", "peerConnectionRef", "RTCPeerConnection", "connection",
      ["onicecandidate", "onconnectionstatechange", "oniceconnectionstatechange", "ontrack"], "close",
      "block.escapeReassign.then", "block.escapeReassign.try", "block.escapeReassign.catch", "erx1",
    ),
  ];
  const sceneFacts = [eventHandlerFact("ensurePeerReassign"), eventHandlerFact("releaseVoiceRuntimeEscapeReassign")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const escapeSkip = cht.skips.find((s) => s.name === "releaseVoiceRuntimeEscapeReassign");
  assert.ok(escapeSkip, `escape handler must fail to transpile honestly (fold refused): ${JSON.stringify(cht.skips)}`);
  assert.doesNotMatch(cht.code, /chengHostRtcPeerConnectionTeardown/, "no bridge call may ever be generated for the reassignment-escape shape");
  assert.doesNotMatch(cht.code, /releaseVoiceRuntimeEscapeReassign/, "the whole handler must be omitted from the dispatcher, not partially wired");

  const program = [
    "import cheng/core/runtime/web_scene_runtime as scene",
    "import std/strings as strings",
    "",
    cht.code,
    "",
    "fn main(): int32 =",
    "    var graph: scene.WebSceneGraph",
    "    graph.activeRouteIndex = -1",
    '    let r1 = __cht_apply(graph, "invoke:ensurePeerReassign")',
    "    if r1 != 1:",
    "        return 91",
    '    let afterEnsure = scene.WebSceneStateValueForRef(graph, "ref:peerConnectionRef")',
    '    if afterEnsure != "4242":',
    "        return 92",
    "    # the escape handler was never compiled in — invoking it must be a harmless dispatcher",
    "    # miss (return 0), never a crash, never a silent partial effect on the real ref state.",
    '    let r2 = __cht_apply(graph, "invoke:releaseVoiceRuntimeEscapeReassign")',
    "    if r2 != 0:",
    "        return 93",
    '    let afterEscape = scene.WebSceneStateValueForRef(graph, "ref:peerConnectionRef")',
    '    if afterEscape != "4242":',
    "        return 94",
    "    return 53",
  ].join("\n");

  const srcRel = "tmp/mech15_stage3_alias_escape_reassign.cheng";
  const outRel = "tmp/mech15_stage3_alias_escape_reassign.exe";
  const reportRel = "tmp/mech15_stage3_alias_escape_reassign.report";
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(join(SHADOW_ROOT, "ts-csg/tmp"), { recursive: true });
  writeFileSync(join(SHADOW_ROOT, "ts-csg", srcRel), program);
  const exit = compileAndRun(join("ts-csg", srcRel), join("ts-csg", outRel), join("ts-csg", reportRel), "mech15 r3 reassignment-escape stage3");
  assert.equal(exit, 53, `expected exit=53 (no stale value ever reached anything, real ref state untouched), got ${exit}`);
});

// Same proof for the lexical-block-shadowing form (`{ const connection = 999; }`) — the task's own
// acceptance bar explicitly requires this form to ALSO be caught, not just direct reassignment.
await check("stage3 r3 regression: lexical-block-shadowing redeclaration between alias decl and teardown guard never reaches a bridge call — handler is honestly omitted, ref state untouched", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("peerConnectionRef", 1),
    ...handlerBindingFacts("ensurePeerShadow", "fn.ensureShadow", 10),
    ...typedIdentifierWriteFacts("fn.ensureShadow", "block.ensureShadow", "peerConnectionRef", "streamS", 4242, "esp1"),
    ...handlerBindingFacts("releaseVoiceRuntimeEscapeShadow", "fn.escapeShadow", 20),
    ...aliasTeardownWithShadowFacts(
      "fn.escapeShadow", "block.escapeShadow", "peerConnectionRef", "RTCPeerConnection", "connection",
      ["onicecandidate", "onconnectionstatechange", "oniceconnectionstatechange", "ontrack"], "close",
      "block.escapeShadow.shadow", "block.escapeShadow.then", "block.escapeShadow.try", "block.escapeShadow.catch", "esx1",
    ),
  ];
  const sceneFacts = [eventHandlerFact("ensurePeerShadow"), eventHandlerFact("releaseVoiceRuntimeEscapeShadow")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const escapeSkip = cht.skips.find((s) => s.name === "releaseVoiceRuntimeEscapeShadow");
  assert.ok(escapeSkip, `escape handler must fail to transpile honestly (fold refused): ${JSON.stringify(cht.skips)}`);
  assert.doesNotMatch(cht.code, /chengHostRtcPeerConnectionTeardown/, "no bridge call may ever be generated for the block-shadow-escape shape");
  assert.doesNotMatch(cht.code, /releaseVoiceRuntimeEscapeShadow/, "the whole handler must be omitted from the dispatcher, not partially wired");

  const program = [
    "import cheng/core/runtime/web_scene_runtime as scene",
    "import std/strings as strings",
    "",
    cht.code,
    "",
    "fn main(): int32 =",
    "    var graph: scene.WebSceneGraph",
    "    graph.activeRouteIndex = -1",
    '    let r1 = __cht_apply(graph, "invoke:ensurePeerShadow")',
    "    if r1 != 1:",
    "        return 91",
    '    let afterEnsure = scene.WebSceneStateValueForRef(graph, "ref:peerConnectionRef")',
    '    if afterEnsure != "4242":',
    "        return 92",
    '    let r2 = __cht_apply(graph, "invoke:releaseVoiceRuntimeEscapeShadow")',
    "    if r2 != 0:",
    "        return 93",
    '    let afterEscape = scene.WebSceneStateValueForRef(graph, "ref:peerConnectionRef")',
    '    if afterEscape != "4242":',
    "        return 94",
    "    return 53",
  ].join("\n");

  const srcRel = "tmp/mech15_stage3_alias_escape_shadow.cheng";
  const outRel = "tmp/mech15_stage3_alias_escape_shadow.exe";
  const reportRel = "tmp/mech15_stage3_alias_escape_shadow.report";
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(join(SHADOW_ROOT, "ts-csg/tmp"), { recursive: true });
  writeFileSync(join(SHADOW_ROOT, "ts-csg", srcRel), program);
  const exit = compileAndRun(join("ts-csg", srcRel), join("ts-csg", outRel), join("ts-csg", reportRel), "mech15 r3 block-shadow-escape stage3");
  assert.equal(exit, 53, `expected exit=53 (no stale value ever reached anything, real ref state untouched), got ${exit}`);
});

// mech15 r5 permanent regression (stage3 form, absorbed from the r4-round adversarial review's
// REFUTED finding — `mech15_impl_r4_verdict.md` review-b §3-§5): before this test existed, the
// review's surgical short-circuit (disabling ONLY the `for_of` branch inside
// `functionHasOtherWriteToName`, leaving `local_write`/`assign` untouched) left every committed
// mech15 stage3 test green — the folded-collision danger (guard observing the loop's per-iteration
// array element 111/222/333 instead of the real handle 4242) had zero automated coverage. The r4
// source fix already refuses the fold (handler fails to transpile, `property write ... on
// unsupported receiver type 'int64'`), so — mirroring the r3 reassignment/shadow stage3 tests above
// exactly — this proves no path exists for ANY value to reach a bridge call, and that invoking the
// never-compiled handler name is a harmless dispatcher no-op that leaves the real ref state
// untouched.
await check("stage3 r5 regression (ex-REFUTED r4 review-b): for_of loop-var name collision with the alias never reaches a bridge call — handler is honestly omitted, ref state untouched", async () => {
  const coreFacts = [
    componentFn(),
    ...useRefFacts("peerConnectionRef", 1),
    ...handlerBindingFacts("ensurePeerFV", "fn.ensureFV", 10),
    ...typedIdentifierWriteFacts("fn.ensureFV", "block.ensureFV", "peerConnectionRef", "streamFV", 4242, "fve1"),
    ...handlerBindingFacts("releaseFVCollision", "fn.releaseFVCollision", 20),
    ...forofLoopVarCollisionFacts(
      "fn.releaseFVCollision", "block.releaseFVCollision", "peerConnectionRef", "connection", "items",
      ["onicecandidate", "onconnectionstatechange", "oniceconnectionstatechange", "ontrack"], "close",
      "block.releaseFVCollision.loopbody", "block.releaseFVCollision.then", "block.releaseFVCollision.try", "block.releaseFVCollision.catch", "fvx1",
    ),
  ];
  const sceneFacts = [eventHandlerFact("ensurePeerFV"), eventHandlerFact("releaseFVCollision")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);
  const escapeSkip = cht.skips.find((s) => s.name === "releaseFVCollision");
  assert.ok(escapeSkip, `for_of-loopvar-collision handler must fail to transpile honestly (fold refused): ${JSON.stringify(cht.skips)}`);
  assert.doesNotMatch(cht.code, /chengHostRtcPeerConnectionTeardown/, "no bridge call may ever be generated for the for_of-loopvar-collision shape");
  assert.doesNotMatch(cht.code, /releaseFVCollision/, "the whole handler must be omitted from the dispatcher, not partially wired");

  const program = [
    "import cheng/core/runtime/web_scene_runtime as scene",
    "import std/strings as strings",
    "",
    cht.code,
    "",
    "fn main(): int32 =",
    "    var graph: scene.WebSceneGraph",
    "    graph.activeRouteIndex = -1",
    '    let r1 = __cht_apply(graph, "invoke:ensurePeerFV")',
    "    if r1 != 1:",
    "        return 91",
    '    let afterEnsure = scene.WebSceneStateValueForRef(graph, "ref:peerConnectionRef")',
    '    if afterEnsure != "4242":',
    "        return 92",
    "    # the collision handler was never compiled in — invoking it must be a harmless dispatcher",
    "    # miss (return 0), never a crash, never a silent partial effect on the real ref state.",
    '    let r2 = __cht_apply(graph, "invoke:releaseFVCollision")',
    "    if r2 != 0:",
    "        return 93",
    '    let afterCollision = scene.WebSceneStateValueForRef(graph, "ref:peerConnectionRef")',
    '    if afterCollision != "4242":',
    "        return 94",
    "    return 53",
  ].join("\n");

  const srcRel = "tmp/mech15_stage3_forofvar_collision.cheng";
  const outRel = "tmp/mech15_stage3_forofvar_collision.exe";
  const reportRel = "tmp/mech15_stage3_forofvar_collision.report";
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync(join(SHADOW_ROOT, "ts-csg/tmp"), { recursive: true });
  writeFileSync(join(SHADOW_ROOT, "ts-csg", srcRel), program);
  const exit = compileAndRun(join("ts-csg", srcRel), join("ts-csg", outRel), join("ts-csg", reportRel), "mech15 r5 for_of-loopvar-collision stage3");
  assert.equal(exit, 53, `expected exit=53 (no stray value ever reached anything, real ref state untouched), got ${exit}`);
});

process.stdout.write(`PASS (${passed.n}/${passed.n})\n`);
