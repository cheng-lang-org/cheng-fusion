#!/usr/bin/env node
// UniMaker tab_nodes multi-row rebind validator.
//
// Extracts the (routeIndex, cardNode, titleNode, subtitleNode) tuples the
// buildNodesRowWiring generator baked into the materialized retained-runtime
// source (one tuple per fixture anchor row), appends a small assertion-driver
// main() calling the real cheng_app_nodes_update_utf8 export with synthetic
// discoveredPeers/connectedPeers JSON payloads, compiles+links it against the
// same digest-host C shim the pixel-parity oracle uses, and runs it natively
// (arm64-apple-darwin) — asserting real title/subtitle text + opacity-based
// row visibility after each push, not just "did it compile".
//
// Node ids are extracted from the generated artifact (never hardcoded), so
// the gate stays valid across materialize runs even if glyph/DOM ordering
// shifts the concrete ids. The row COUNT is asserted (must be 8, matching
// the fixture's 8 anchor rows) so a fixture shrink/grow is a loud failure,
// not a silently-adapted pass.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "./process-runner.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const hostCSource = join(scriptDir, "unimaker-digest-host.c");
const EXPECTED_ROW_COUNT = 8;

function fail(message) {
  process.stderr.write(`unimaker-nodes-multirow-validate: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const o = { outDir: "", chengBin: join(repoRoot, "artifacts", "bootstrap", "cheng.stage3") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--out-dir") o.outDir = resolve(next());
    else if (a === "--cheng-bin") o.chengBin = resolve(next());
    else fail(`unknown arg: ${a}`);
  }
  if (!o.outDir) fail("--out-dir is required (a one-click --stop-after materialize output dir)");
  return o;
}

// Structural assertions on the generated rebind code, independent of running it:
// (a) the empty-state branch distinguishes "no snapshot received yet" (keep current
//     rendering) from "snapshot received, zero peers" (falls through to the normal
//     per-row filter loop, which hides every anchor) -- see __nodesApplyRowsJson.
// (b) the local peer (top-level "peerId" on the snapshot) is excluded from the row
//     list exactly like PWA NodesPage.tsx's own-peer filter -- never a disguised row.
// (c) the tab_nodes route-enter refresh bridge exists (single-shot fetch on route
//     entry, not the runtime_create/resume-only pushes the Kotlin shell used to be
//     limited to).
function assert(cond, message) {
  if (!cond) fail(message);
}

function assertNodesRowWiringStructure(sceneRuntimeSrc) {
  assert(
    /if peersNode\.kind != json\.JArray:\s*\n\s*# runtime not started \/ no discovery yet: keep current rendering/.test(sceneRuntimeSrc),
    "generated rebind code must keep current rendering only when no snapshot has been received (peersNode not an array), not when peers is a real empty array",
  );
  assert(
    sceneRuntimeSrc.includes("    var selfPeerId: str") &&
      /selfPeerId\.len > 0 && peerId == selfPeerId/.test(sceneRuntimeSrc),
    "generated rebind code must exclude the snapshot's own top-level peerId from every row (self must never render as a peer row)",
  );
  assert(
    sceneRuntimeSrc.includes('@importc("cheng_host_nodes_snapshot_refresh")') &&
      sceneRuntimeSrc.includes("fn __csg_scene_apply_nodes_route_enter_refresh(): int32 ="),
    "generated rebind code must wire a route-enter snapshot refresh (fires on tab_nodes route entry, not just runtime_create/resume)",
  );
}

// Pull the row tuples straight out of the generated __nodesApplyRowsJson body:
// title/subtitle binds are `WebSceneApplyTextControlPaintValue(__csgSceneGraph, R, NODE, label<k>|subtitle<k>)`
// in row order; the card (row-visibility) node is the argument of the row's
// `__nodesSetRowVisible(CARD, true)` call, which appears exactly once per row.
function extractRowTuples(sceneRuntimeSrc) {
  const titleRe = /WebSceneApplyTextControlPaintValue\(__csgSceneGraph, (\d+), (\d+), label\d+\)/g;
  const subtitleRe = /WebSceneApplyTextControlPaintValue\(__csgSceneGraph, (\d+), (\d+), subtitle\d+\)/g;
  const cardRe = /__nodesSetRowVisible\((\d+), true\)/g;
  const titles = [...sceneRuntimeSrc.matchAll(titleRe)];
  const subtitles = [...sceneRuntimeSrc.matchAll(subtitleRe)];
  const cards = [...sceneRuntimeSrc.matchAll(cardRe)];
  if (titles.length === 0) fail("no tab_nodes row wiring found (buildNodesRowWiring produced 0 rows for this fixture)");
  if (titles.length !== cards.length || titles.length !== subtitles.length) {
    fail(`row tuple count mismatch: titles=${titles.length} subtitles=${subtitles.length} cards=${cards.length}`);
  }
  const routeIndex = Number(titles[0][1]);
  return {
    routeIndex,
    rows: titles.map((m, k) => {
      if (Number(m[1]) !== routeIndex) fail(`row ${k} routeIndex ${m[1]} != ${routeIndex}`);
      return { cardNode: Number(cards[k][1]), titleNode: Number(m[2]), subtitleNode: Number(subtitles[k][2]) };
    }),
  };
}

// peerId whose last-6-char label is deterministic and grep-able.
function peer(tag) {
  return `prefix${tag}`;
}

function buildDriverSource(routeIndex, rows) {
  const r = (k) => rows[k];
  const lines = [];
  lines.push('@importc("cheng_digest_emit_probe")');
  lines.push("fn __csg_digest_emit_probe(probeCode: int32, status: int32)");
  lines.push("");
  lines.push('@importc("cheng_digest_done")');
  lines.push("fn __csg_digest_done(failures: int32)");
  lines.push("");
  lines.push("fn __rowPaintTextIndex(routeIndex: int32, nodeId: int32): int32 =");
  lines.push("    var i: int32");
  lines.push("    let n = scene.WebScenePaintCount(__csgSceneGraph)");
  lines.push("    while i < n:");
  lines.push("        if scene.WebScenePaintRouteIndexAt(__csgSceneGraph, i) == routeIndex && scene.WebScenePaintNodeIdAt(__csgSceneGraph, i) == nodeId && scene.WebScenePaintKindIsText(scene.WebScenePaintKindAt(__csgSceneGraph, i)):");
  lines.push("            return i");
  lines.push("        i = i + 1");
  lines.push("    return -1");
  lines.push("");
  lines.push("fn __rowText(routeIndex: int32, nodeId: int32): str =");
  lines.push("    let idx = __rowPaintTextIndex(routeIndex, nodeId)");
  lines.push('    if idx < 0:');
  lines.push('        return "<no-paint-op>"');
  lines.push("    return scene.WebScenePaintTextAt(__csgSceneGraph, idx)");
  lines.push("");
  lines.push("fn __rowOpacity(routeIndex: int32, nodeId: int32): int32 =");
  lines.push("    let idx = __rowPaintTextIndex(routeIndex, nodeId)");
  lines.push("    if idx < 0:");
  lines.push("        return -999");
  lines.push("    return scene.WebScenePaintOpacityAt(__csgSceneGraph, idx)");
  lines.push("");
  lines.push("fn __checkStr(failures: var int32, probeCode: int32, got: str, want: str) =");
  lines.push("    if got == want:");
  lines.push("        __csg_digest_emit_probe(probeCode, 1)");
  lines.push("    else:");
  lines.push("        __csg_digest_emit_probe(probeCode, 0)");
  lines.push("        failures = failures + 1");
  lines.push("");
  lines.push("fn __checkI32(failures: var int32, probeCode: int32, got: int32, want: int32) =");
  lines.push("    if got == want:");
  lines.push("        __csg_digest_emit_probe(probeCode, 1)");
  lines.push("    else:");
  lines.push("        __csg_digest_emit_probe(probeCode, 0)");
  lines.push("        failures = failures + 1");
  lines.push("");
  lines.push("fn main(): int32 =");
  lines.push("    if !__csg_scene_build():");
  lines.push("        return 1");
  lines.push("    var failures: int32 = 0");
  lines.push("");
  const jrows = (peerIds) => `[${peerIds.map((p) => `{\\"peerId\\":\\"${p}\\"}`).join(",")}]`;
  const payload = (peerIds, connected) =>
    `"{\\"discoveredPeers\\":{\\"peers\\":${jrows(peerIds)}},\\"connectedPeers\\":[${connected.map((p) => `\\"${p}\\"`).join(",")}]}"`;
  // Same shape as `payload`, plus the real backend's top-level "peerId" (the local
  // node's own identity -- see libp2p_network_discovery_snapshot).
  const payloadWithSelf = (selfPeerId, peerIds, connected) =>
    `"{\\"peerId\\":\\"${selfPeerId}\\",\\"discoveredPeers\\":{\\"peers\\":${jrows(peerIds)}},\\"connectedPeers\\":[${connected.map((p) => `\\"${p}\\"`).join(",")}]}"`;
  // entries: [peerId, systemProfile|null] — systemProfile omitted entirely when null,
  // mirroring the real (non-fabricated) omit-when-unknown wiring.
  const jrowsWithProfile = (entries) =>
    `[${entries
      .map(([id, profile]) => {
        if (!profile) return `{\\"peerId\\":\\"${id}\\"}`;
        const fields = Object.entries(profile)
          .map(([k, v]) => `\\"${k}\\":\\"${v}\\"`)
          .join(",");
        return `{\\"peerId\\":\\"${id}\\",\\"systemProfile\\":{${fields}}}`;
      })
      .join(",")}]`;
  const payloadWithProfile = (entries, connected) =>
    `"{\\"discoveredPeers\\":{\\"peers\\":${jrowsWithProfile(entries)}},\\"connectedPeers\\":[${connected.map((p) => `\\"${p}\\"`).join(",")}]}"`;

  let probe = 0;
  const next = () => (probe += 1);

  // Scenario 1: N anchors, 3 real peers -> 3 shown, N-3 hidden.
  const p = [peer("AAAAAA"), peer("BBBBBB"), peer("CCCCCC")];
  lines.push(`    let ok1 = cheng_app_nodes_update_utf8(strToCStringTemp(${payload(p, [p[1]])}))`);
  lines.push(`    __checkI32(failures, ${next()}, ok1, 1)`);
  lines.push(`    __checkStr(failures, ${next()}, __rowText(${routeIndex}, ${r(0).titleNode}), "AAAAAA")`);
  lines.push(`    __checkStr(failures, ${next()}, __rowText(${routeIndex}, ${r(1).titleNode}), "BBBBBB")`);
  lines.push(`    __checkStr(failures, ${next()}, __rowText(${routeIndex}, ${r(2).titleNode}), "CCCCCC")`);
  lines.push(`    __checkStr(failures, ${next()}, __rowText(${routeIndex}, ${r(0).subtitleNode}), "")`);
  lines.push(`    __checkStr(failures, ${next()}, __rowText(${routeIndex}, ${r(1).subtitleNode}), "已连接")`);
  for (let k = 0; k < 3; k++) lines.push(`    __checkI32(failures, ${next()}, __rowOpacity(${routeIndex}, ${r(k).titleNode}), 255)`);
  for (let k = 3; k < rows.length; k++) lines.push(`    __checkI32(failures, ${next()}, __rowOpacity(${routeIndex}, ${r(k).titleNode}), 0)`);
  lines.push(`    __checkI32(failures, ${next()}, cheng_app_debug_nodes_count(), 3)`);
  lines.push(`    __checkI32(failures, ${next()}, cheng_app_debug_shown_count(), 3)`);
  lines.push("");

  // Scenario 2: N anchors + (N+2) real peers -> all N shown, no OOB past the last slot.
  const many = Array.from({ length: rows.length + 2 }, (_, i) => peer(String(i).padStart(6, "0")));
  lines.push(`    let ok2 = cheng_app_nodes_update_utf8(strToCStringTemp(${payload(many, [])}))`);
  lines.push(`    __checkI32(failures, ${next()}, ok2, 1)`);
  lines.push(`    __checkStr(failures, ${next()}, __rowText(${routeIndex}, ${r(0).titleNode}), "000000")`);
  lines.push(`    __checkStr(failures, ${next()}, __rowText(${routeIndex}, ${r(rows.length - 1).titleNode}), "${String(rows.length - 1).padStart(6, "0")}")`);
  for (let k = 0; k < rows.length; k++) lines.push(`    __checkI32(failures, ${next()}, __rowOpacity(${routeIndex}, ${r(k).titleNode}), 255)`);
  lines.push(`    __checkI32(failures, ${next()}, cheng_app_debug_nodes_count(), ${many.length})`);
  lines.push(`    __checkI32(failures, ${next()}, cheng_app_debug_shown_count(), ${rows.length})`);
  lines.push("");

  // Scenario 3: 0 real data, field ABSENT (runtime not started) -> keep current rendering as-is.
  lines.push(`    let ok3 = cheng_app_nodes_update_utf8(strToCStringTemp("{}"))`);
  lines.push(`    __checkI32(failures, ${next()}, ok3, 1)`);
  lines.push(`    __checkStr(failures, ${next()}, __rowText(${routeIndex}, ${r(0).titleNode}), "000000")`);
  lines.push(`    __checkI32(failures, ${next()}, __rowOpacity(${routeIndex}, ${r(0).titleNode}), 255)`);
  lines.push(`    __checkI32(failures, ${next()}, cheng_app_debug_nodes_count(), 0)`);
  lines.push(`    __checkI32(failures, ${next()}, cheng_app_debug_shown_count(), ${rows.length})`);
  lines.push("");

  // Scenario 4: shuffled peerId order -> stable positional rebind, no id-based stickiness.
  lines.push(`    let ok4a = cheng_app_nodes_update_utf8(strToCStringTemp(${payload(p, [])}))`);
  lines.push(`    __checkI32(failures, ${next()}, ok4a, 1)`);
  lines.push(`    __checkStr(failures, ${next()}, __rowText(${routeIndex}, ${r(0).titleNode}), "AAAAAA")`);
  const shuffled = [p[2], p[0], p[1]];
  lines.push(`    let ok4b = cheng_app_nodes_update_utf8(strToCStringTemp(${payload(shuffled, [])}))`);
  lines.push(`    __checkI32(failures, ${next()}, ok4b, 1)`);
  lines.push(`    __checkStr(failures, ${next()}, __rowText(${routeIndex}, ${r(0).titleNode}), "CCCCCC")`);
  lines.push(`    __checkStr(failures, ${next()}, __rowText(${routeIndex}, ${r(1).titleNode}), "AAAAAA")`);
  lines.push(`    __checkStr(failures, ${next()}, __rowText(${routeIndex}, ${r(2).titleNode}), "BBBBBB")`);
  lines.push("");

  // Scenario 5: malformed row (empty peerId mid-array) -> the bad entry is
  // skipped and later peers COMPACT upward (filter-cursor semantics, mirroring
  // PWA filteredNodes.map which never leaves holes). Positional hole semantics
  // ("only that slot hides") were the pre-filter contract before the
  // peerCursor row-filter refactor.
  const malformed = [peer("AAAAAA"), "", peer("CCCCCC")];
  lines.push(`    let ok5 = cheng_app_nodes_update_utf8(strToCStringTemp(${payload(malformed, [])}))`);
  lines.push(`    __checkI32(failures, ${next()}, ok5, 1)`);
  lines.push(`    __checkStr(failures, ${next()}, __rowText(${routeIndex}, ${r(0).titleNode}), "AAAAAA")`);
  lines.push(`    __checkI32(failures, ${next()}, __rowOpacity(${routeIndex}, ${r(0).titleNode}), 255)`);
  lines.push(`    __checkStr(failures, ${next()}, __rowText(${routeIndex}, ${r(1).titleNode}), "CCCCCC")`);
  lines.push(`    __checkI32(failures, ${next()}, __rowOpacity(${routeIndex}, ${r(1).titleNode}), 255)`);
  lines.push(`    __checkI32(failures, ${next()}, __rowOpacity(${routeIndex}, ${r(2).titleNode}), 0)`);
  lines.push("");

  // Scenario 6: real EMPTY peers array (discovery ran, found nobody) -> every row
  // legitimately hides — distinct from scenario 3 where the field is absent.
  lines.push(`    let ok6 = cheng_app_nodes_update_utf8(strToCStringTemp(${payload([], [])}))`);
  lines.push(`    __checkI32(failures, ${next()}, ok6, 1)`);
  for (let k = 0; k < rows.length; k++) lines.push(`    __checkI32(failures, ${next()}, __rowOpacity(${routeIndex}, ${r(k).titleNode}), 0)`);
  lines.push(`    __checkI32(failures, ${next()}, cheng_app_debug_nodes_count(), 0)`);
  lines.push(`    __checkI32(failures, ${next()}, cheng_app_debug_shown_count(), 0)`);
  lines.push("");

  // Scenario 7: subtitle two-state — a peer with a real (received) systemProfile
  // shows its OS label; a peer with no profile falls back to the plain
  // connected/blank state exactly as before (4404612fe behavior unchanged).
  const pProfile = [peer("DDDDDD"), peer("EEEEEE"), peer("FFFFFF")];
  const entries7 = [
    [pProfile[0], { osName: "Linux", osVersion: "5.15.0" }],
    [pProfile[1], null],
    [pProfile[2], null],
  ];
  lines.push(`    let ok7 = cheng_app_nodes_update_utf8(strToCStringTemp(${payloadWithProfile(entries7, [pProfile[1]])}))`);
  lines.push(`    __checkI32(failures, ${next()}, ok7, 1)`);
  lines.push(`    __checkStr(failures, ${next()}, __rowText(${routeIndex}, ${r(0).subtitleNode}), "Linux 5.15.0")`);
  lines.push(`    __checkStr(failures, ${next()}, __rowText(${routeIndex}, ${r(1).subtitleNode}), "已连接")`);
  lines.push(`    __checkStr(failures, ${next()}, __rowText(${routeIndex}, ${r(2).subtitleNode}), "")`);
  lines.push("");

  // Scenario 8: self-exclusion — the snapshot's top-level "peerId" (this node's own
  // identity) also happens to appear inside discoveredPeers.peers[] (what a real,
  // non-stub discovery backend would do echoing its own record back). It must never
  // render as a row: raw count still reflects every entry the backend reported, but
  // shown count and the row slots only cover the two real remote peers.
  const selfId = peer("SELFID");
  const withSelf = [selfId, peer("GGGGGG"), peer("HHHHHH")];
  lines.push(`    let ok8 = cheng_app_nodes_update_utf8(strToCStringTemp(${payloadWithSelf(selfId, withSelf, [])}))`);
  lines.push(`    __checkI32(failures, ${next()}, ok8, 1)`);
  lines.push(`    __checkStr(failures, ${next()}, __rowText(${routeIndex}, ${r(0).titleNode}), "GGGGGG")`);
  lines.push(`    __checkStr(failures, ${next()}, __rowText(${routeIndex}, ${r(1).titleNode}), "HHHHHH")`);
  lines.push(`    __checkI32(failures, ${next()}, __rowOpacity(${routeIndex}, ${r(0).titleNode}), 255)`);
  lines.push(`    __checkI32(failures, ${next()}, __rowOpacity(${routeIndex}, ${r(1).titleNode}), 255)`);
  lines.push(`    __checkI32(failures, ${next()}, __rowOpacity(${routeIndex}, ${r(2).titleNode}), 0)`);
  lines.push(`    __checkI32(failures, ${next()}, cheng_app_debug_nodes_count(), ${withSelf.length})`);
  lines.push(`    __checkI32(failures, ${next()}, cheng_app_debug_shown_count(), 2)`);
  lines.push("");

  lines.push("    __csg_digest_done(failures)");
  lines.push("    if failures > 0:");
  lines.push("        return 1");
  lines.push("    return 0");
  lines.push("");
  return { source: lines.join("\n"), assertionCount: probe };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const sceneRuntimeSrc = join(o.outDir, "unimaker-react.scene-runtime.cheng");
  if (!existsSync(sceneRuntimeSrc)) fail(`missing materialize output: ${sceneRuntimeSrc}`);
  const src = readFileSync(sceneRuntimeSrc, "utf8");
  if (src.indexOf("\nfn main(") >= 0 || src.startsWith("fn main(")) {
    fail(`generated source already declares fn main; the .so/export source must stay entry-free (${sceneRuntimeSrc})`);
  }
  assertNodesRowWiringStructure(src);
  const { routeIndex, rows } = extractRowTuples(src);
  if (rows.length !== EXPECTED_ROW_COUNT) {
    fail(`expected ${EXPECTED_ROW_COUNT} tab_nodes anchor rows, found ${rows.length} — fixture row count drifted, update this validator`);
  }
  const { source: driver, assertionCount } = buildDriverSource(routeIndex, rows);

  const buildDir = join(o.outDir, "nodes-multirow-validate");
  mkdirSync(buildDir, { recursive: true });
  const combinedSrc = join(buildDir, "combined.cheng");
  writeFileSync(combinedSrc, src + (src.endsWith("\n") ? "" : "\n") + driver, "utf8");

  const objPath = join(buildDir, "nodes-multirow.darwin.o");
  const reportPath = join(buildDir, "nodes-multirow.darwin.report.txt");
  await runCommand(o.chengBin, [
    "system-link-exec",
    `--root:${repoRoot}`,
    `--in:${combinedSrc}`,
    "--emit:obj",
    "--target:arm64-apple-darwin",
    `--out:${objPath}`,
    `--report-out:${reportPath}`,
    "--link-providers",
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CHENG_PROCESS_MAX_RSS_BYTES: "8589934592",
      BACKEND_INCREMENTAL: "0",
      BACKEND_MULTI_MODULE_CACHE: "0",
      CHENG_DISABLE_PRIMARY_OBJECT_CACHE: "1",
    },
    encoding: "utf8",
    timeout: 280000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!existsSync(objPath)) fail(`Cheng emit:obj produced no output: ${objPath}`);

  const exe = join(buildDir, "nodes_multirow_validator");
  execFileSync("cc", ["-arch", "arm64", "-o", exe, hostCSource, objPath], { timeout: 60000 });

  let stdout;
  try {
    stdout = execFileSync(exe, [], {
      cwd: buildDir,
      env: {
        ...process.env,
        CHENG_DIGEST_SCENE_DATA: join(o.outDir, "runtime", "unimaker_scene_data.bin"),
        CHENG_DIGEST_GLYPH_PIXELS: join(o.outDir, "runtime", "unimaker_glyph_sdf_pixels.bin"),
      },
      encoding: "utf8",
      timeout: 60000,
    });
  } catch (error) {
    process.stderr.write(error.stdout ?? "");
    process.stderr.write(error.stderr ?? "");
    fail(`validator run failed (rc=${error.status}): ${error.message}`);
  }
  const failedProbes = [...stdout.matchAll(/^probe (\d+) 0$/gm)].map((m) => m[1]);
  process.stdout.write(`route=${routeIndex} rows=${rows.length} assertions=${assertionCount} failed=${failedProbes.length}\n`);
  if (failedProbes.length > 0) {
    fail(`${failedProbes.length}/${assertionCount} assertions failed: probe(s) ${failedProbes.join(",")}`);
  }
  process.stdout.write("unimaker-nodes-multirow-validate: ok\n");
}

main().catch((error) => fail(error.stack ?? String(error)));
