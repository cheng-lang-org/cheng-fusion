// mech19r2-arrdrain-reachability-stage3.test.mjs
//
// 机制19 r2 回归锁(真实 stage3 编译+执行, 非 codegen 文本正则): array-drain(`.current.splice(0)`)
// 家族的 CALL 型写可达性 admission(§scene-runtime-smoke-source.mjs 的 mechanism-19-r2 注释)不是
// codegen 文本层面的假象——同一批次里, 一个孤儿 drain 写 ref(orphanDrainRef, 唯一写点在孤儿函数里,
// 从未被任何 handler 根触达)被排除(fv-unknown), 同批次一个健康 drain 写 ref(healthyDrainRef, 写在
// 读取它的同一个可达 handler 里)完全不受影响——真实通过正典 driver 编译+执行, 断言真实 KV 状态,
// 证明 mech19 r2 新增的可达性判定不会连坐同批次的健康 ref(same convention as mech16-statetype-
// writeonly-stage3.test.mjs 的 readHealthy 零连坐设计 + mech19_r1v_a_verdict.md §6 的
// rev-a-reachability-stage3.test.mjs)。
//
// IMPORTANT (import 解析口径, 已实测钉死, 同 arr-box-ref-stage3.test.mjs/mech17-arraydrain-stage3.
// test.mjs 的注意事项): driver 子进程必须以 `cwd: SHADOW_ROOT` 启动。
//
// Usage: node scripts/mech19r2-arrdrain-reachability-stage3.test.mjs   (after `npm run build`)

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
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
  return { kind: "csg.function", id: "fn.component", name: "Mech19R2StageTestComponent", parameters: [], returnType: "void" };
}
function orphanFn(fid) {
  return { kind: "csg.function", id: fid, name: "<anonymous-orphan>", parameters: [], returnType: "void" };
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
function arrLengthReadFacts(fid, block, refName, tag) {
  const idBase = `op.${tag}`;
  return [
    { kind: "csg.op", id: `${idBase}.ref`, function: fid, block, opKind: "identifier", name: refName },
    { kind: "csg.op", id: `${idBase}.cur`, function: fid, block, opKind: "property_read", name: "current", receiver: `${idBase}.ref` },
    { kind: "csg.op", id: `${idBase}.len`, function: fid, block, opKind: "property_read", name: "length", receiver: `${idBase}.cur` },
    { kind: "csg.op", id: `${idBase}.ret`, function: fid, block, opKind: "return", value: `${idBase}.len` },
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

await check("stage3: reachability-safety-net-admitted array-drain write really persists through real KV, AND a sibling orphan array-drain ref excluded in the SAME batch has zero collateral effect on it", async () => {
  const coreFacts = [
    componentFn(),
    ...arrUseRefFacts("healthyDrainRef", 1),
    ...arrUseRefFacts("archiveRef", 3),
    ...handlerBindingFacts("drainHealthy", "fn.drainHealthy", 10),
    // drainHealthy: const drained = healthyDrainRef.current.splice(0); archiveRef.current.push(...drained);
    ...arrDrainFacts("fn.drainHealthy", "block.dh", "healthyDrainRef", "drained", "dh1"),
    ...arrPushFactsRealistic("fn.drainHealthy", "block.dh", "archiveRef", "drained", "dh2"),
    // Sibling orphan ref in the SAME compile batch: its ONLY write is an orphan splice(0) drain,
    // never reachable from any handler root. Read side lives in a DIFFERENT, otherwise-independent
    // reachable handler (readOrphanDrainLen) — must be excluded (fv-unknown), and must have ZERO
    // effect on drainHealthy's own compilation/execution.
    ...arrUseRefFacts("orphanDrainRef", 20),
    orphanFn("fn.orphanDrainWriter"),
    ...arrDrainFacts("fn.orphanDrainWriter", "block.odw", "orphanDrainRef", "orphanDrained", "odw1"),
    ...handlerBindingFacts("readOrphanDrainLen", "fn.readOrphanDrainLen", 30),
    ...arrLengthReadFacts("fn.readOrphanDrainLen", "block.rodl", "orphanDrainRef", "rodl1"),
  ];
  const sceneFacts = [eventHandlerFact("drainHealthy"), eventHandlerFact("readOrphanDrainLen")];
  const cht = await buildCompiledHandlerTable(coreFacts, sceneFacts);

  // Admission-layer assertions (mirrors the offline mech19.test.mjs coverage, kept here too so this
  // file is a self-contained witness of both layers for the exact same fixture).
  assert.equal(cht.count, 1, `only drainHealthy may compile: ${JSON.stringify(cht.skips)}`);
  assert.deepEqual(cht.names, ["drainHealthy"]);
  assert.equal(cht.skips.length, 1);
  assert.match(cht.skips[0].reason, /^fv-unknown:orphanDrainRef$/, JSON.stringify(cht.skips));
  assert.ok(!cht.code.includes("orphanDrainWriter"), "the orphan writer must never surface in the compiled output");

  // Runtime-layer assertion: drainHealthy's REAL KV round-trip, unaffected by the excluded sibling.
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
    '    let seedStatus = scene.WebSceneSetStateValueInternal(graph, "arr:healthyDrainRef", scene.WebSceneEncodeIceCandidateArrayState(seed), true)',
    "    if seedStatus < 0:",
    "        return 90",
    '    let r1 = __cht_apply(graph, "invoke:drainHealthy")',
    "    if r1 != 1:",
    "        return 91",
    "    # decisive check 1: the drained value really persists downstream through real KV.",
    '    var archived: scene.WebSceneIceCandidateRecord[]',
    '    if !scene.WebSceneParseIceCandidateArrayState(scene.WebSceneStateValueForRef(graph, "arr:archiveRef"), archived):',
    "        return 92",
    "    if archived.len != 2:",
    "        return 93",
    '    if archived[0].candidate != "candA" || archived[1].candidate != "candB":',
    "        return 94",
    "    # decisive check 2: the source ref is genuinely emptied in KV (real setLen(0)).",
    '    let afterDrainRaw = scene.WebSceneStateValueForRef(graph, "arr:healthyDrainRef")',
    '    if afterDrainRaw != "[]":',
    "        return 95",
    "    # decisive check 3: readOrphanDrainLen was never compiled at all — dispatching its invoke:",
    "    # name must be a genuine no-op (unmatched dispatch), never a crash, never a stray write.",
    '    let r2 = __cht_apply(graph, "invoke:readOrphanDrainLen")',
    "    if r2 != 0:",
    "        return 96",
    "    return 53",
    "",
  ].join("\n");

  const outDir = mkdtempSync(join(SHADOW_ROOT, "tmp_mech19r2_arrdrain_reach_stage3-"));
  const outDirRel = outDir.slice(SHADOW_ROOT.length + 1);
  try {
    writeFileSync(join(outDir, "prog.cheng"), program);
    const exit = compileAndRun(`${outDirRel}/prog.cheng`, `${outDirRel}/prog.exe`, `${outDirRel}/report.txt`, "drain-healthy-reachability");
    assert.equal(exit, 53, `real KV round-trip + zero collateral from the excluded sibling must hold, got exit=${exit} (see fail-code map in source: 90-96)`);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

process.stdout.write(`PASS (${passed.n}/1)\n`);
