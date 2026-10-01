// mech17-arraydrain-stage3.test.mjs
//
// 回归锁: mechanism 12 r1 扩展(queuedVoiceIceCandidatesRef 缺口诊断) — `.current.splice(0)`
// (drain-all) 的 stage3 真编真跑复刻. 不满足于静态正则(见 scene-runtime-smoke-source.mech12.test.mjs 的
// "mech17 r1 positive" 用例) — 用真实 buildCompiledHandlerTable() 产出的完整 __cht_apply 调度器(含真实
// KV load/store 布线), 拼进一个真实可执行程序, 用正典 driver(/Users/lbcheng/cheng-lang/artifacts/
// bootstrap/cheng.stage3, 只读)编译+执行, 断言真实 KV 状态跨 dispatch 的变化.
//
// Mirrors ChessPage.tsx:828 `flushQueuedVoiceIceCandidates`:
//   const candidates = queuedVoiceIceCandidatesRef.current.splice(0);
//   ...push candidates into elsewhere...
// (真实源码把 drained 值送进 sendHiddenVoiceSignal, 本测试改送进第二个 arrBoxRef 以在 KV 层面可观测。)
//
// IMPORTANT (import 解析口径, 已实测钉死, 与 arr-box-ref-stage3.test.mjs 同一注意事项): driver 子进程
// 必须以 `cwd: SHADOW_ROOT` 启动, 否则 `import cheng/core/runtime/web_scene_runtime as scene` 静默解析
// 失败或悄悄解析到别处的旧版本。
//
// Usage: node scripts/mech17-arraydrain-stage3.test.mjs   (after `npm run build`)

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
// Fixture helpers (kept independent of arr-box-ref-stage3.test.mjs's own copies, per mech11/mech12
// precedent — each stage3 file is its own separate witness, not sharing construction code).
function componentFn() {
  return { kind: "csg.function", id: "fn.component", name: "ChessPageTest17", parameters: [], returnType: "void" };
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
// `<refName>.current.splice(0)` -> `localName` — real ts-csg emission order (own `0` argument
// literal BEFORE the call op, found by ID-backreference — see scene-runtime-smoke-source.mjs's
// isArrDrainCall comment).
function arrDrainFacts(fid, block, refName, localName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.data", id: `${idBase}.zero`, dataKind: "number", value: 0 },
    { kind: "csg.op", id: `${idBase}.zerolit`, function: fid, block, opKind: "literal", data: `${idBase}.zero`, literalKind: "number" },
    { kind: "csg.op", id: `${idBase}.call`, function: fid, block, opKind: "call", callee: `${refName}.current.splice`, memberName: "splice", receiver: `${idBase}.cur`, arguments: [`${idBase}.zerolit`] },
    { kind: "csg.op", id: `${idBase}.write`, function: fid, block, opKind: "local_write", name: localName, value: `${idBase}.call` },
  ];
}
// `<refName>.current.push(...<srcIdentifierName>)` — spread-append, real emission order (argument
// sub-expressions before the call op).
function arrPushFactsRealistic(fid, block, refName, srcIdentifierName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.src`, function: fid, block, opKind: "identifier", name: srcIdentifierName },
    { kind: "csg.op", id: `${idBase}.spread`, function: fid, block, opKind: "spread", value: `${idBase}.src` },
    { kind: "csg.op", id: `${idBase}.call`, function: fid, block, opKind: "call", callee: `${refName}.current.push`, memberName: "push", receiver: `${idBase}.cur`, arguments: [`${idBase}.spread`] },
  ];
}

function buildHandlerTableSource() {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("queuedVoiceIceCandidatesRef", 1),
    ...arrUseRefFacts("archiveRef", 3),
    ...handlerBindingFacts("drainQueue", "fn.drainQueue", 10),
    // drainQueue: const drained = queuedVoiceIceCandidatesRef.current.splice(0);
    //             archiveRef.current.push(...drained);
    // — mirrors ChessPage.tsx:828 flushQueuedVoiceIceCandidates's own drain, composed with a push
    // so the drained VALUE is independently observable in KV (not just "codegen text matches").
    ...arrDrainFacts("fn.drainQueue", "block.dq", "queuedVoiceIceCandidatesRef", "drained", "dq1"),
    ...arrPushFactsRealistic("fn.drainQueue", "block.dq", "archiveRef", "drained", "dq2"),
  ];
  const sceneFacts = [eventHandlerFact("drainQueue")];
  return buildCompiledHandlerTable(coreFacts, sceneFacts);
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

await check("stage3: splice(0) drains the queue into a real usable value AND empties the source ref (real KV round-trip)", async () => {
  const cht = await buildHandlerTableSource();
  assert.deepEqual(cht.skips, [], `must compile with zero skips: ${JSON.stringify(cht.skips)}`);
  assert.equal(cht.count, 1);
  assert.deepEqual(cht.names, ["drainQueue"]);

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
    '    let seedStatus = scene.WebSceneSetStateValueInternal(graph, "arr:queuedVoiceIceCandidatesRef", scene.WebSceneEncodeIceCandidateArrayState(seed), true)',
    "    if seedStatus < 0:",
    "        return 90",
    "    # the drain call itself: queuedVoiceIceCandidatesRef.current.splice(0) -> drained,",
    "    # archiveRef.current.push(...drained)",
    '    let r1 = __cht_apply(graph, "invoke:drainQueue")',
    "    if r1 != 1:",
    "        return 91",
    "    # decisive check 1: the drained value is REAL and USABLE downstream (not garbage/zeroed) —",
    "    # archiveRef must now hold exactly the 2 seeded candidates, in order.",
    '    var archived: scene.WebSceneIceCandidateRecord[]',
    '    if !scene.WebSceneParseIceCandidateArrayState(scene.WebSceneStateValueForRef(graph, "arr:archiveRef"), archived):',
    "        return 92",
    "    if archived.len != 2:",
    "        return 93",
    '    if archived[0].candidate != "candA" || archived[1].candidate != "candB":',
    "        return 94",
    "    # decisive check 2: the SOURCE ref is genuinely emptied in the KV (real setLen(0), not a",
    "    # local-only copy) — this is what distinguishes drain from a copy-read.",
    '    let afterDrainRaw = scene.WebSceneStateValueForRef(graph, "arr:queuedVoiceIceCandidatesRef")',
    '    if afterDrainRaw != "[]":',
    "        return 95",
    "    return 53",
    "",
  ].join("\n");

  const outDir = mkdtempSync(join(SHADOW_ROOT, "tmp_mech17_drain_stage3-"));
  const outDirRel = outDir.slice(SHADOW_ROOT.length + 1);
  try {
    writeFileSync(join(outDir, "prog.cheng"), program);
    const exit = compileAndRun(`${outDirRel}/prog.cheng`, `${outDirRel}/prog.exe`, `${outDirRel}/report.txt`, "drain-queue");
    assert.equal(exit, 53, `drain must move the real seeded candidates into archiveRef and empty the source, got exit=${exit} (see fail-code map in source: 90-95)`);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

process.stdout.write(`PASS (${passed.n}/1)\n`);
