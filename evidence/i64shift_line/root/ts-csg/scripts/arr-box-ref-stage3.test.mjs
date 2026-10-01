// arr-box-ref-stage3.test.mjs
//
// 回归锁: mechanism 12 (React useRef 数组 ref 形状族 — pendingIceCandidatesRef family) 的 stage3 真编
// 真跑复刻. 不满足于静态正则(见 scene-runtime-smoke-source.mech12.test.mjs) — 用真实
// buildCompiledHandlerTable() 产出的完整 __cht_apply 调度器(含真实 KV load/store 布线), 拼进一个真实
// 可执行程序, 用正典 driver(/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3, 只读)编译+
// 执行, 断言跨多次真实 dispatch 的 exit 分化.
//
// IMPORTANT (import 解析口径, 已实测钉死): `import cheng/core/runtime/web_scene_runtime as scene`
// 相对 **进程 CWD** 解析(见 cold_parser.c:cold_import_source_path 最终 fallback
// `snprintf(out, "src/%.*s.cheng", module_path)`), 与 `--root:`/`--in:` 参数值无关. 所以本测试必须以
// `cwd: SHADOW_ROOT` 启动 driver 子进程(SHADOW_ROOT = 本 shadow clone 的仓库根, 其
// `src/core/runtime/web_scene_runtime.cheng` 正是本次改动的那份文件), 否则会静默解析失败(import
// 不落地任何符号, 直到某个 `scene.XXX` 调用点触发 "unresolved function call" 才报错) 或(更危险地)
// 悄悄解析到别处的旧版本. 实测证据: 同一份 `--in:` 相对路径, cwd 为 shadow 根时
// `compile_input_source_line_count≈47xxx`(真拉入 web_scene_runtime.cheng 全文 21000+ 行); cwd 为无关
// 目录时行数仅个位数(import 静默空转).
//
// Usage: node scripts/arr-box-ref-stage3.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCompiledHandlerTable } from "./scene-runtime-smoke-source.mjs";

const CHENG = "/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage3"; // canonical driver, read-only main tree
// scripts/ -> ts-csg/ -> <shadow root> (two levels up from this file).
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

// ---------------------------------------------------------------------------
// Build the REAL compiled handler table for three handlers exercising all four mechanism-12
// shapes, mirroring ChessPage.tsx's flushPendingIceCandidates / handleIncomingVoiceIceCandidate
// exactly (same op shapes as scene-runtime-smoke-source.mech12.test.mjs's fixture helpers — kept
// independent here per mech11 precedent, not imported, so this file's own construction is a fully
// separate witness).
function componentFn() {
  return { kind: "csg.function", id: "fn.component", name: "ChessPageTest", parameters: [], returnType: "void" };
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
function arrClearFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.arrlit`, function: fid, block, opKind: "array_literal", elementCount: 0, elements: [], spreadFlags: [] },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "property_write", name: "current", receiver: `${idBase}.ref`, value: `${idBase}.arrlit` },
  ];
}
function arrCopyReadFacts(fid, block, refName, localName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.arrlit`, function: fid, block, opKind: "array_literal", elementCount: 1, elements: [`${idBase}.cur`], spreadFlags: [true] },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "local_write", name: localName, value: `${idBase}.arrlit` },
  ];
}
function arrPushFacts(fid, block, refName, srcIdentifierName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.src`, function: fid, block, opKind: "identifier", name: srcIdentifierName },
    { kind: "csg.op", id: `${idBase}.spread`, function: fid, block, opKind: "spread", value: `${idBase}.src` },
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.call`, function: fid, block, opKind: "call", callee: `${refName}.current.push`, memberName: "push", receiver: `${idBase}.cur`, arguments: [`${idBase}.spread`] },
  ];
}

function buildHandlerTableSource() {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("pendingIceCandidatesRef", 1),
    ...arrUseRefFacts("stagingRef", 3),
    ...arrUseRefFacts("otherRef", 5),
    ...arrUseRefFacts("archiveRef", 7),
    ...handlerBindingFacts("pushStaged", "fn.pushStaged", 10),
    ...handlerBindingFacts("clearPending", "fn.clearPending", 20),
    ...handlerBindingFacts("archiveAndRefill", "fn.archiveAndRefill", 30),
    // pushStaged: const staged = [...stagingRef.current]; pendingIceCandidatesRef.current.push(...staged)
    // — mirrors ChessPage.tsx:993 (push) composed with the copy-read that must feed it (real source
    // spreads a plain local, e.g. `candidates` from a payload helper; here `staged` from stagingRef).
    ...arrCopyReadFacts("fn.pushStaged", "block.ps", "stagingRef", "staged", "ps1"),
    ...arrPushFacts("fn.pushStaged", "block.ps", "pendingIceCandidatesRef", "staged", "ps2"),
    // clearPending: pendingIceCandidatesRef.current = []  — mirrors ChessPage.tsx:706/939.
    ...arrClearFacts("fn.clearPending", "block.cp", "pendingIceCandidatesRef", "cp1"),
    // archiveAndRefill: mirrors ChessPage.tsx:938-939's copy-then-clear (flushPendingIceCandidates)
    // PLUS an intervening refill from a DIFFERENT ref, to positively prove the copy-read is a real
    // independent snapshot (not aliased to the slot var — see the "aliasing safety" check below):
    //   const pending = [...pendingIceCandidatesRef.current]
    //   pendingIceCandidatesRef.current = []
    //   const fresh = [...otherRef.current]
    //   pendingIceCandidatesRef.current.push(...fresh)
    //   archiveRef.current.push(...pending)
    ...arrCopyReadFacts("fn.archiveAndRefill", "block.ar", "pendingIceCandidatesRef", "pending", "ar1"),
    ...arrClearFacts("fn.archiveAndRefill", "block.ar", "pendingIceCandidatesRef", "ar2"),
    ...arrCopyReadFacts("fn.archiveAndRefill", "block.ar", "otherRef", "fresh", "ar3"),
    ...arrPushFacts("fn.archiveAndRefill", "block.ar", "pendingIceCandidatesRef", "fresh", "ar4"),
    ...arrPushFacts("fn.archiveAndRefill", "block.ar", "archiveRef", "pending", "ar5"),
  ];
  const sceneFacts = [eventHandlerFact("pushStaged"), eventHandlerFact("clearPending"), eventHandlerFact("archiveAndRefill")];
  return buildCompiledHandlerTable(coreFacts, sceneFacts);
}

// Hand-written (non-generated) test scaffolding: builds a candidate record and seeds a KV slot
// directly, bypassing the compiled dispatcher entirely — this is TEST SETUP, not itself exercising
// mechanism 12's translation (which only starts at the __cht_apply call sites below).
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

await check("stage3: push(...copy-read) then clear observably round-trip through real KV (len 2 -> 0)", async () => {
  const cht = await buildHandlerTableSource();
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 3);

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
    '    add(seed, mkCandidate("candA", "0", true, int64(0)))',
    '    add(seed, mkCandidate("candB", "1", true, int64(1)))',
    '    let seedStatus = scene.WebSceneSetStateValueInternal(graph, "arr:stagingRef", scene.WebSceneEncodeIceCandidateArrayState(seed), true)',
    "    if seedStatus < 0:",
    "        return 90",
    "    # shape 3 (copy-read) + shape 2 (spread-push): pushStaged copies stagingRef into a local",
    "    # then pushes it into pendingIceCandidatesRef.",
    '    let r1 = __cht_apply(graph, "invoke:pushStaged")',
    "    if r1 != 1:",
    "        return 91",
    '    var afterPush: scene.WebSceneIceCandidateRecord[]',
    '    if !scene.WebSceneParseIceCandidateArrayState(scene.WebSceneStateValueForRef(graph, "arr:pendingIceCandidatesRef"), afterPush):',
    "        return 92",
    "    if afterPush.len != 2:",
    "        return 93",
    '    if afterPush[0].candidate != "candA" || afterPush[1].candidate != "candB":',
    "        return 94",
    "    # shape 1 (clear-reassign): clearPending must empty pendingIceCandidatesRef.",
    '    let r2 = __cht_apply(graph, "invoke:clearPending")',
    "    if r2 != 1:",
    "        return 95",
    '    let afterClearRaw = scene.WebSceneStateValueForRef(graph, "arr:pendingIceCandidatesRef")',
    '    if afterClearRaw != "[]":',
    "        return 96",
    '    var afterClear: scene.WebSceneIceCandidateRecord[]',
    '    if !scene.WebSceneParseIceCandidateArrayState(afterClearRaw, afterClear):',
    "        return 97",
    "    if afterClear.len != 0:",
    "        return 98",
    "    return 42",
    "",
  ].join("\n");

  const outDir = mkdtempSync(join(SHADOW_ROOT, "tmp_mech12_stage3-"));
  const outDirRel = outDir.slice(SHADOW_ROOT.length + 1);
  try {
    writeFileSync(join(outDir, "prog.cheng"), program);
    const exit = compileAndRun(`${outDirRel}/prog.cheng`, `${outDirRel}/prog.exe`, `${outDirRel}/report.txt`, "push-clear");
    assert.equal(exit, 42, `push(len=2)->clear(len=0) round-trip must reach the success code, got exit=${exit} (see fail-code map in source: 90-98)`);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

await check("stage3: copy-read is a real independent snapshot, unaffected by an intervening clear+refill (aliasing safety)", async () => {
  const cht = await buildHandlerTableSource();
  assert.deepEqual(cht.skips, []);

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
    "    var pendingSeed: scene.WebSceneIceCandidateRecord[]",
    '    add(pendingSeed, mkCandidate("candA", "0", true, int64(0)))',
    '    add(pendingSeed, mkCandidate("candB", "1", true, int64(1)))',
    '    let s1 = scene.WebSceneSetStateValueInternal(graph, "arr:pendingIceCandidatesRef", scene.WebSceneEncodeIceCandidateArrayState(pendingSeed), true)',
    "    if s1 < 0:",
    "        return 90",
    "    var otherSeed: scene.WebSceneIceCandidateRecord[]",
    '    add(otherSeed, mkCandidate("candC", "0", true, int64(0)))',
    '    add(otherSeed, mkCandidate("candD", "1", true, int64(1)))',
    '    add(otherSeed, mkCandidate("candE", "2", true, int64(2)))',
    '    let s2 = scene.WebSceneSetStateValueInternal(graph, "arr:otherRef", scene.WebSceneEncodeIceCandidateArrayState(otherSeed), true)',
    "    if s2 < 0:",
    "        return 91",
    "    # archiveAndRefill: copy pendingIceCandidatesRef into `pending`, clear it, refill it from",
    "    # otherRef (DIFFERENT content/count), then push `pending` into archiveRef. If the copy-read",
    "    # aliased the slot var instead of making a real copy, the intervening clear+refill would",
    "    # corrupt what archiveRef receives.",
    '    let r1 = __cht_apply(graph, "invoke:archiveAndRefill")',
    "    if r1 != 1:",
    "        return 92",
    "    var archived: scene.WebSceneIceCandidateRecord[]",
    '    if !scene.WebSceneParseIceCandidateArrayState(scene.WebSceneStateValueForRef(graph, "arr:archiveRef"), archived):',
    "        return 93",
    "    if archived.len != 2:",
    "        return 94",
    '    if archived[0].candidate != "candA" || archived[1].candidate != "candB":',
    "        return 95",
    "    var refilled: scene.WebSceneIceCandidateRecord[]",
    '    if !scene.WebSceneParseIceCandidateArrayState(scene.WebSceneStateValueForRef(graph, "arr:pendingIceCandidatesRef"), refilled):',
    "        return 96",
    "    if refilled.len != 3:",
    "        return 97",
    '    if refilled[0].candidate != "candC" || refilled[1].candidate != "candD" || refilled[2].candidate != "candE":',
    "        return 98",
    "    return 53",
    "",
  ].join("\n");

  const outDir = mkdtempSync(join(SHADOW_ROOT, "tmp_mech12_stage3-"));
  const outDirRel = outDir.slice(SHADOW_ROOT.length + 1);
  try {
    writeFileSync(join(outDir, "prog.cheng"), program);
    const exit = compileAndRun(`${outDirRel}/prog.cheng`, `${outDirRel}/prog.exe`, `${outDirRel}/report.txt`, "archive-refill");
    assert.equal(exit, 53, `archived pending must survive the intervening clear+refill untouched, got exit=${exit} (see fail-code map in source: 90-98)`);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

process.stdout.write(`PASS (${passed.n}/2)\n`);
