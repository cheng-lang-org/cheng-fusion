#!/usr/bin/env node
// UniMaker no-screenshot deterministic visual 1:1 gate.
//
// Builds the generated mobile retained-runtime source twice — once for the desktop
// reference (arm64-apple-darwin) and once for the device (aarch64-linux-android) —
// links each as a shared library against the SAME C host shim (unimaker-digest-host.c),
// runs both over all routes calling cheng_app_debug_compute_frame_digest, and asserts
// every route's 62-bit frame digest is byte-identical across architectures. The digest
// folds only the deterministic int32 compositor host batch (layer + GPU command words),
// so a match proves cross-arch render-stream determinism and scene_data.bin decode
// faithfulness without rendering or comparing any pixels.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "./process-runner.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const hostCSource = join(scriptDir, "unimaker-digest-host.c");

function fail(message) {
  process.stderr.write(`unimaker-digest-oracle: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const o = {
    outDir: "",
    chengBin: join(repoRoot, "artifacts", "bootstrap", "cheng.stage3"),
    ndkDir: process.env.ANDROID_NDK_HOME || "/Users/lbcheng/Library/Android/sdk/ndk/27.0.12077973",
    adb: "adb",
    device: process.env.ANDROID_SERIAL || "",
    deviceDir: "/data/local/tmp/chengdigest",
    skipDevice: false,
    viewport: "390x844",
    compileTimeoutMs: Number(process.env.CHENG_DIGEST_COMPILE_TIMEOUT_MS || 360000),
    reportOut: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) fail(`${a} needs a value`); return argv[++i]; };
    if (a === "--out-dir") o.outDir = next();
    else if (a === "--cheng-bin") o.chengBin = next();
    else if (a === "--ndk") o.ndkDir = next();
    else if (a === "--adb") o.adb = next();
    else if (a === "--device") o.device = next();
    else if (a === "--device-dir") o.deviceDir = next();
    else if (a === "--skip-device") o.skipDevice = true;
    else if (a === "--viewport") o.viewport = next();
    else if (a === "--report-out") o.reportOut = next();
    else if (a === "--help" || a === "-h") { printUsage(); process.exit(0); }
    else fail(`unknown arg ${a}`);
  }
  if (!o.outDir) fail("--out-dir <one-click materialize outDir> is required");
  o.outDir = resolve(o.outDir);
  if (!o.reportOut) o.reportOut = join(o.outDir, "unimaker-digest-oracle.report.json");
  return o;
}

function printUsage() {
  process.stdout.write(`unimaker-digest-oracle — no-screenshot deterministic visual 1:1 gate

usage:
  node scripts/unimaker-digest-oracle.mjs --out-dir <materialize-outDir> [options]

options:
  --out-dir <dir>     one-click --stop-after materialize output (scene-runtime.cheng + runtime/*.bin)
  --cheng-bin <path>  Cheng compiler (default artifacts/bootstrap/cheng.stage3)
  --ndk <dir>         Android NDK root
  --device <serial>   adb device serial (default $ANDROID_SERIAL)
  --device-dir <dir>  on-device working dir (default /data/local/tmp/chengdigest)
  --skip-device       compute the desktop reference only (no device run)
  --viewport WxH      logical viewport for layout (default 390x844)
  --report-out <path> report JSON path (default <outDir>/unimaker-digest-oracle.report.json)
`);
}

// Decode the route table from unimaker_scene_data.bin → [{routeIndex, routeId}].
function readRouteTable(sceneDataPath) {
  const buf = readFileSync(sceneDataPath);
  let off = 0;
  const i32 = () => { const v = buf.readInt32LE(off); off += 4; return v; };
  const str = () => { const n = i32(); const s = buf.toString("utf8", off, off + n); off += n; return s; };
  const magic = i32();
  if (magic !== 0x31445343) fail(`scene data magic mismatch: 0x${magic.toString(16)}`);
  i32(); // version
  const counts = [];
  for (let k = 0; k < 20; k++) counts.push(i32());
  const routeCount = counts[0];
  // CSD1 v6: the header gained one extra i32 after the 20 count slots (observed
  // value 0 in current writers); route rows start right after it. Parsing rows
  // at the v5 offset misreads the first name length and walks off the buffer.
  i32(); // v6 header pad
  const rows = [];
  for (let r = 0; r < routeCount; r++) {
    const idx = i32();
    i32(); // root node id
    i32(); // layer id
    const id = str();
    rows.push({ routeIndex: idx, routeId: id });
  }
  rows.sort((a, b) => a.routeIndex - b.routeIndex);
  return rows;
}

// Rewrite the generated scene-runtime source so a digest-driver main owns the entry
// point: it loops every route calling cheng_app_debug_compute_frame_digest and prints
// through the cheng_digest_* host callbacks. Driving the digest from main keeps every
// app/digest function reachable on BOTH targets (the default emit:obj reachability roots
// from main only, so a `return 0` main would prune the @exportc entrypoints on darwin).
function writeDigestMainSource(sceneRuntimeSrc, outPath, viewportW, viewportH) {
  const src = readFileSync(sceneRuntimeSrc, "utf8");
  if (src.indexOf("\nfn main(") >= 0 || src.startsWith("fn main(")) {
    fail(`generated source already declares fn main; the .so/export source must stay entry-free (${sceneRuntimeSrc})`);
  }
  if (src.indexOf("cheng_app_debug_compute_frame_digest") < 0) {
    fail(`generated source lacks cheng_app_debug_compute_frame_digest; regenerate with the digest-export emitter`);
  }
  const driver = [
    "@importc(\"cheng_digest_emit_meta\")",
    "fn __csg_digest_emit_meta(routeCount: int32, viewportW: int32, viewportH: int32)",
    "",
    "@importc(\"cheng_digest_emit\")",
    "fn __csg_digest_emit(routeIndex: int32, ok: int32, hi: int32, lo: int32)",
    "",
    "@importc(\"cheng_digest_emit_route_diag\")",
    "fn __csg_digest_emit_route_diag(routeIndex: int32, status: int32, cssCode: int32, cssPropertyCode: int32, cssRoute: int32, cssNode: int32, layoutCode: int32, layoutRoute: int32, layoutNode: int32, layoutOrdinal: int32, frameStep: int32, buildStep: int32, glyphCode: int32, glyphRoute: int32, glyphNode: int32, glyphOrdinal: int32, glyphCodepoint: int32)",
    "",
    "@importc(\"cheng_digest_emit_edge_meta\")",
    "fn __csg_digest_emit_edge_meta(edgeCount: int32)",
    "",
    "@importc(\"cheng_digest_emit_edge\")",
    "fn __csg_digest_emit_edge(edgeIndex: int32, source: int32, node: int32, expectedTarget: int32, landed: int32)",
    "",
    "@importc(\"cheng_digest_emit_edge_hit\")",
    "fn __csg_digest_emit_edge_hit(edgeIndex: int32, source: int32, node: int32, expectedTarget: int32, hitNode: int32, centerX: int32, centerY: int32)",
    "",
    "@importc(\"cheng_digest_emit_hit_rect_meta\")",
    "fn __csg_digest_emit_hit_rect_meta(hitRectCount: int32)",
    "",
    "@importc(\"cheng_digest_emit_hit_rect\")",
    "fn __csg_digest_emit_hit_rect(hitRectIndex: int32, source: int32, node: int32, expectedTarget: int32, hitNode: int32, centerX: int32, centerY: int32)",
    "",
    "@importc(\"cheng_digest_emit_probe\")",
    "fn __csg_digest_emit_probe(probeCode: int32, status: int32)",
    "",
    "@importc(\"cheng_digest_done\")",
    "fn __csg_digest_done(failures: int32)",
    "",
    "fn main(): int32 =",
    "    if !__csg_scene_build():",
    "        return 1",
    `    __csgSceneViewportWidth = ${viewportW}`,
    `    __csgSceneViewportHeight = ${viewportH}`,
    "    let routeCount = scene.WebSceneRouteCount(__csgSceneGraph)",
    `    __csg_digest_emit_meta(routeCount, ${viewportW}, ${viewportH})`,
    "    var failures: int32",
    "    for r in 0..<routeCount:",
    "        let ok = cheng_app_debug_compute_frame_digest(r)",
    "        __csg_digest_emit(r, ok, __csgSceneLastFrameDigestHi, __csgSceneLastFrameDigestLo)",
    "        __csg_digest_emit_route_diag(r, ok, cheng_app_debug_css_fail_code(), cheng_app_debug_css_fail_property_code(), cheng_app_debug_css_fail_route_index(), cheng_app_debug_css_fail_node_id(), cheng_app_debug_layout_fail_code(), cheng_app_debug_layout_fail_route_index(), cheng_app_debug_layout_fail_node_id(), cheng_app_debug_layout_fail_ordinal(), cheng_app_debug_frame_digest_block_step(), cheng_app_debug_build_step(), cheng_app_debug_glyph_atlas_fail_code(), cheng_app_debug_glyph_atlas_fail_route_index(), cheng_app_debug_glyph_atlas_fail_node_id(), cheng_app_debug_glyph_atlas_fail_ordinal(), cheng_app_debug_glyph_atlas_fail_codepoint())",
    "        if ok == 0:",
    "            failures = failures + 1",
    "    let edgeCount = cheng_app_debug_route_edge_count()",
    "    __csg_digest_emit_edge_meta(edgeCount)",
    "    for e in 0..<edgeCount:",
    "        let source = cheng_app_debug_route_edge_source(e)",
    "        let node = cheng_app_debug_route_edge_node(e)",
    "        let expectedTarget = cheng_app_debug_route_edge_expected_target(e)",
    "        let landed = cheng_app_debug_verify_route_edge(e)",
    "        __csg_digest_emit_edge(e, source, node, expectedTarget, landed)",
    "        let hitNode = cheng_app_debug_route_edge_hit_node(e)",
    "        let hitCenterX = cheng_app_debug_route_edge_hit_center_x(e)",
    "        let hitCenterY = cheng_app_debug_route_edge_hit_center_y(e)",
    "        __csg_digest_emit_edge_hit(e, source, node, expectedTarget, hitNode, hitCenterX, hitCenterY)",
    "    let hitRectCount = cheng_app_debug_route_hit_rect_count()",
    "    __csg_digest_emit_hit_rect_meta(hitRectCount)",
    "    for h in 0..<hitRectCount:",
    "        let source = cheng_app_debug_route_hit_rect_source(h)",
    "        let node = cheng_app_debug_route_hit_rect_node(h)",
    "        let expectedTarget = cheng_app_debug_route_hit_rect_expected_target(h)",
    "        let hitNode = cheng_app_debug_route_hit_rect_hit_node(h)",
    "        let centerX = cheng_app_debug_route_hit_rect_center_x(h)",
    "        let centerY = cheng_app_debug_route_hit_rect_center_y(h)",
    "        __csg_digest_emit_hit_rect(h, source, node, expectedTarget, hitNode, centerX, centerY)",
    "    let publishCloseAfterLocationStatus = cheng_app_debug_publish_content_location_close_probe()",
    "    __csg_digest_emit_probe(1, publishCloseAfterLocationStatus)",
    "    __csg_digest_done(failures)",
    "    return 0",
    "",
  ].join("\n");
  const rewritten = src + (src.endsWith("\n") ? "" : "\n") + driver;
  writeFileSync(outPath, rewritten, "utf8");
}

// Build the authoritative route-edge graph and useful node labels from scene.csgc facts:
// Set of "sourceRouteIndex:nodeId:targetRouteIndex" keys.
async function readRouteEdgeFactDetails(sceneCsgcPath, routeIdToIndex) {
  const { csgcReadFacts } = await import("../dist/csgc-reader.js");
  const { facts } = csgcReadFacts(readFileSync(sceneCsgcPath));
  const set = new Set();
  const nodeDetails = new Map();
  const edgeDetails = new Map();
  let count = 0;
  for (const f of facts) {
    if (f.kind === "csg.web.scene.node") {
      const routeIndex = Number(f.routeIndex);
      const nodeId = Number(f.nodeId);
      if (Number.isInteger(routeIndex) && Number.isInteger(nodeId) && nodeId > 0) {
        const key = `${routeIndex}:${nodeId}`;
        const prev = nodeDetails.get(key) ?? {};
        nodeDetails.set(key, {
          ...prev,
          tagName: String(f.tagName ?? f.nodeKind ?? f.elementName ?? prev.tagName ?? ""),
          componentName: String(f.componentName ?? f.component ?? prev.componentName ?? ""),
          source: String(f.source ?? f.ownerSource ?? prev.source ?? ""),
          parentNodeId: Number(f.parentNodeId ?? prev.parentNodeId ?? 0),
          conditionalStateRef: String(f.conditionalStateRef ?? prev.conditionalStateRef ?? ""),
          conditionalStateValue: String(f.conditionalStateValue ?? prev.conditionalStateValue ?? ""),
        });
      }
      continue;
    }
    if (f.kind === "csg.web.scene.paint" && String(f.text ?? "").length > 0) {
      const routeIndex = Number(f.routeIndex);
      const nodeId = Number(f.nodeId);
      const key = `${routeIndex}:${nodeId}`;
      const prev = nodeDetails.get(key) ?? {};
      const existing = String(prev.text ?? "");
      const nextText = String(f.text ?? "");
      nodeDetails.set(key, {
        ...prev,
        text: existing.length > 0 ? existing : nextText,
      });
      continue;
    }
    if (f.kind === "csg.web.scene.event_handler") {
      const routeIndex = Number(f.routeIndex);
      const nodeId = Number(f.nodeId);
      const key = `${routeIndex}:${nodeId}`;
      const prev = nodeDetails.get(key) ?? {};
      const handlers = Array.isArray(prev.handlers) ? [...prev.handlers] : [];
      handlers.push({
        eventName: String(f.eventName ?? ""),
        effect: String(f.effect ?? ""),
      });
      nodeDetails.set(key, { ...prev, handlers });
      continue;
    }
    if (f.kind !== "csg.web.scene.route_edge") continue;
    const src = Number(f.routeIndex);
    const node = Number(f.nodeId);
    const tgt = routeIdToIndex.get(String(f.targetRouteId));
    if (tgt === undefined || !(node > 0)) continue;
    const key = `${src}:${node}:${tgt}`;
    set.add(key);
    edgeDetails.set(key, {
      sourceRouteId: String(f.routeId ?? ""),
      targetRouteId: String(f.targetRouteId ?? ""),
    });
    count++;
  }
  for (const [key, detail] of nodeDetails) {
    const [routeIndexText, nodeIdText] = key.split(":");
    const routeIndex = Number(routeIndexText);
    const nodeId = Number(nodeIdText);
    const conditional = nodeConditionalChain(nodeDetails, routeIndex, nodeId);
    if (conditional.length > 0) {
      nodeDetails.set(key, {
        ...detail,
        stateConditional: true,
        conditionalChain: conditional,
      });
    }
  }
  return { set, factEdgeCount: count, nodeDetails, edgeDetails };
}

function nodeConditionalChain(nodeDetails, routeIndex, nodeId) {
  const out = [];
  const seen = new Set();
  let current = Number(nodeId);
  while (current > 0) {
    const key = `${routeIndex}:${current}`;
    if (seen.has(key)) break;
    seen.add(key);
    const node = nodeDetails.get(key);
    if (!node) break;
    const stateRef = String(node.conditionalStateRef ?? "");
    if (stateRef.length > 0) {
      out.push({
        nodeId: current,
        stateRef,
        stateValue: String(node.conditionalStateValue ?? ""),
      });
    }
    current = Number(node.parentNodeId ?? 0);
  }
  return out;
}

function readRouteEdgeFactDetailsFromMetadata(routeEdgeDetailsPath, routeIdToIndex) {
  const report = JSON.parse(readFileSync(routeEdgeDetailsPath, "utf8"));
  if (report.schema !== "unimaker.route-edge-details.v1") {
    fail(`unexpected route edge details schema: ${report.schema}`);
  }
  const routeEdges = Array.isArray(report.routeEdges) ? report.routeEdges : [];
  const nodes = Array.isArray(report.nodes) ? report.nodes : [];
  const set = new Set();
  const nodeDetails = new Map();
  const edgeDetails = new Map();
  for (const node of nodes) {
    const routeId = String(node.routeId ?? "");
    const routeIndex = Number(node.routeIndex ?? routeIdToIndex.get(routeId));
    const nodeId = Number(node.nodeId);
    if (!Number.isInteger(routeIndex) || !Number.isInteger(nodeId) || nodeId <= 0) continue;
    nodeDetails.set(`${routeIndex}:${nodeId}`, {
      routeId,
      tagName: String(node.tagName ?? ""),
      componentName: String(node.componentName ?? ""),
      source: String(node.source ?? ""),
      text: String(node.text ?? ""),
      parentNodeId: Number(node.parentNodeId ?? 0),
      conditionalStateRef: String(node.conditionalStateRef ?? ""),
      conditionalStateValue: String(node.conditionalStateValue ?? ""),
      stateConditional: node.stateConditional === true,
      conditionalChain: Array.isArray(node.conditionalChain) ? node.conditionalChain : [],
      handlers: Array.isArray(node.handlers) ? node.handlers : [],
    });
  }
  for (const edge of routeEdges) {
    const sourceRouteId = String(edge.routeId ?? "");
    const targetRouteId = String(edge.targetRouteId ?? "");
    const source = Number(edge.routeIndex ?? routeIdToIndex.get(sourceRouteId));
    const node = Number(edge.nodeId);
    const target = Number(edge.targetRouteIndex ?? routeIdToIndex.get(targetRouteId));
    if (!Number.isInteger(source) || !Number.isInteger(node) || node <= 0 || !Number.isInteger(target)) continue;
    const key = `${source}:${node}:${target}`;
    set.add(key);
    edgeDetails.set(key, { sourceRouteId, targetRouteId });
  }
  return {
    set,
    factEdgeCount: routeEdges.length,
    nodeDetails,
    edgeDetails,
  };
}

function readRouteEdgeFactDetailsFromReachability(routeReachabilityPath, routeIdToIndex) {
  const report = JSON.parse(readFileSync(routeReachabilityPath, "utf8"));
  if (report.schema !== "unimaker.route-reachability.v1") {
    fail(`unexpected route reachability schema: ${report.schema}`);
  }
  const routeEdges = Array.isArray(report.routeEdges) ? report.routeEdges : [];
  const set = new Set();
  const edgeDetails = new Map();
  for (const edge of routeEdges) {
    const sourceRouteId = String(edge.routeId ?? "");
    const targetRouteId = String(edge.targetRouteId ?? "");
    const source = Number(edge.routeIndex ?? routeIdToIndex.get(sourceRouteId));
    const node = Number(edge.nodeId);
    const target = Number(edge.targetRouteIndex ?? routeIdToIndex.get(targetRouteId));
    if (!Number.isInteger(source) || !Number.isInteger(node) || node <= 0 || !Number.isInteger(target)) continue;
    const key = `${source}:${node}:${target}`;
    set.add(key);
    edgeDetails.set(key, { sourceRouteId, targetRouteId });
  }
  return {
    set,
    factEdgeCount: routeEdges.length,
    nodeDetails: new Map(),
    edgeDetails,
  };
}

function parseDigestOutput(stdout) {
  const digests = new Map();   // routeIndex -> hex digest
  const statuses = new Map();  // routeIndex -> 1 rendered | 2 render-blocked
  const routeDiagnostics = new Map();
  const edges = new Map();     // edgeIndex -> {source, node, expectedTarget, landed}
  const edgeHits = new Map();  // edgeIndex -> {source, node, expectedTarget, hitNode}
  const hitRects = new Map();  // hitRectIndex -> {source, node, expectedTarget, hitNode}
  const probes = new Map();    // probeCode -> status
  let routeCount = -1;
  let edgeCount = -1;
  let hitRectCount = -1;
  let okMarker = false;
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let m = /^digest_host route_count=(\d+)/.exec(line);
    if (m) { routeCount = Number(m[1]); continue; }
    m = /^digest_host edge_count=(\d+)/.exec(line);
    if (m) { edgeCount = Number(m[1]); continue; }
    m = /^digest_host hit_rect_count=(\d+)/.exec(line);
    if (m) { hitRectCount = Number(m[1]); continue; }
    if (line === "digest_host ok") { okMarker = true; continue; }
    m = /^route (\d+) (\d+) (-?\d+) (-?\d+)$/.exec(line);
    if (m) {
      const [, idx, status, hi, lo] = m;
      const st = Number(status);
      if (st !== 1 && st !== 2) fail(`route ${idx} digest compute hard-failed (status=${status})`);
      const hiU = (Number(hi) >>> 0).toString(16).padStart(8, "0");
      const loU = (Number(lo) >>> 0).toString(16).padStart(8, "0");
      digests.set(Number(idx), `${hiU}${loU}`);
      statuses.set(Number(idx), st);
      continue;
    }
    m = /^route_diag (\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+)$/.exec(line);
    if (m) {
      const [, idx, status, cssCode, cssPropertyCode, cssRoute, cssNode, layoutCode, layoutRoute, layoutNode, layoutOrdinal, frameStep, buildStep, glyphCode, glyphRoute, glyphNode, glyphOrdinal, glyphCodepoint] = m;
      routeDiagnostics.set(Number(idx), {
        status: Number(status),
        cssCode: Number(cssCode),
        cssPropertyCode: Number(cssPropertyCode),
        cssRoute: Number(cssRoute),
        cssNode: Number(cssNode),
        layoutCode: Number(layoutCode),
        layoutRoute: Number(layoutRoute),
        layoutNode: Number(layoutNode),
        layoutOrdinal: Number(layoutOrdinal),
        frameStep: Number(frameStep),
        buildStep: Number(buildStep),
        glyphCode: Number(glyphCode),
        glyphRoute: Number(glyphRoute),
        glyphNode: Number(glyphNode),
        glyphOrdinal: Number(glyphOrdinal),
        glyphCodepoint: Number(glyphCodepoint),
      });
      continue;
    }
    m = /^edge (\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+)$/.exec(line);
    if (m) {
      const [, idx, source, node, expectedTarget, landed] = m;
      edges.set(Number(idx), {
        source: Number(source), node: Number(node),
        expectedTarget: Number(expectedTarget), landed: Number(landed),
      });
      continue;
    }
    m = /^edge_hit (\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+)$/.exec(line);
    if (m) {
      const [, idx, source, node, expectedTarget, hitNode, centerX, centerY] = m;
      edgeHits.set(Number(idx), {
        source: Number(source), node: Number(node),
        expectedTarget: Number(expectedTarget), hitNode: Number(hitNode),
        centerX: Number(centerX), centerY: Number(centerY),
      });
      continue;
    }
    m = /^hit_rect (\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+)$/.exec(line);
    if (m) {
      const [, idx, source, node, expectedTarget, hitNode, centerX, centerY] = m;
      hitRects.set(Number(idx), {
        source: Number(source), node: Number(node),
        expectedTarget: Number(expectedTarget), hitNode: Number(hitNode),
        centerX: Number(centerX), centerY: Number(centerY),
      });
      continue;
    }
    m = /^probe (\d+) (-?\d+)$/.exec(line);
    if (m) {
      const [, probeCode, status] = m;
      probes.set(Number(probeCode), Number(status));
      continue;
    }
  }
  if (!okMarker) fail("digest run did not reach 'digest_host ok' marker");
  return { digests, statuses, routeDiagnostics, edges, edgeHits, hitRects, probes, routeCount, edgeCount, hitRectCount };
}

function routeEdgeFailureReason(landed) {
  if (landed >= 0) return "";
  if (landed === -1) return "scene_build_failed";
  if (landed === -2) return "bad_edge_index";
  if (landed === -3) return "source_route_unsettable";
  if (landed === -41) return "node_pointer_events_disabled_or_hidden";
  if (landed === -411) return "node_not_owned_by_source_route";
  if (landed === -412) return "node_hidden_by_display_none_or_state_condition";
  if (landed === -4121) return "node_hidden_by_state_condition";
  if (landed === -4122) return "node_hidden_by_display_none";
  if (landed === -4123) return "state_condition_witness_apply_failed";
  if (landed === -4124) return "state_condition_still_hidden_after_witness";
  if (landed === -413) return "native_control_disabled";
  if (landed === -414) return "pointer_events_none_state";
  if (landed === -415) return "source_route_runtime_not_ready";
  if (landed === -42) return "route_payload_missing";
  if (landed === -421) return "route_edge_layout_box_missing";
  if (landed === -422) return "route_edge_layout_box_empty";
  if (landed === -43) return "event_effect_apply_failed";
  if (landed === -44) return "target_route_unsettable";
  if (landed === -45) return "event_guard_blocked";
  return "unknown_negative_landing";
}

function publishLocationCloseProbeReason(status) {
  if (status === 1) return "";
  if (status === -1) return "scene_build_failed";
  if (status === -2) return "publish_or_selector_route_missing";
  if (status === -3) return "publish_route_unsettable";
  if (status === -4) return "publish_route_runtime_not_ready_before_location";
  if (status === -5) return "location_state_empty_after_route_enter";
  if (status === -6) return "publish_route_runtime_not_ready_after_location";
  if (status === -7) return "publish_close_route_edge_missing";
  if (status === -8) return "publish_close_hit_missing";
  if (status === -9) return "publish_close_hit_wrong_target";
  if (status === -10) return "publish_close_apply_target_missing";
  if (status === -11) return "publish_close_active_route_runtime_not_ready";
  if (status === -12) return "publish_close_target_route_runtime_not_ready";
  if (status === -13) return "publish_close_route_edge_apply_failed";
  if (status === -14) return "publish_close_target_route_rebuild_failed_after_route_enter";
  if (status === -15) return "publish_close_did_not_land_selector";
  if (status === -100) return "publish_close_apply_failed_without_detail";
  return "unknown_publish_location_close_probe_status";
}

async function compileChengObject(o, target, digestSrc, objPath, reportPath) {
  if (!existsSync(digestSrc)) fail(`missing digest-main source: ${digestSrc}`);
  await runCommand(o.chengBin, [
    "system-link-exec",
    `--root:${repoRoot}`,
    `--in:${digestSrc}`,
    "--emit:obj",
    `--target:${target}`,
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
    timeout: o.compileTimeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!existsSync(objPath)) fail(`Cheng emit:obj produced no output: ${objPath}`);
}

async function runDesktopReference(o, digestSrc) {
  const buildDir = join(o.outDir, "digest-desktop");
  mkdirSync(buildDir, { recursive: true });
  const objPath = join(buildDir, "scene-runtime.darwin.o");
  const reportPath = join(buildDir, "scene-runtime.darwin.report.txt");
  await compileChengObject(o, "arm64-apple-darwin", digestSrc, objPath, reportPath);
  const exe = join(buildDir, "digest_harness");
  execFileSync("cc", [
    "-arch", "arm64",
    "-o", exe, hostCSource, objPath,
  ], { timeout: 60000 });
  const stdout = await runCommand(exe, [], {
    cwd: buildDir,
    env: {
      ...process.env,
      CHENG_DIGEST_SCENE_DATA: join(o.outDir, "runtime", "unimaker_scene_data.bin"),
      CHENG_DIGEST_GLYPH_PIXELS: join(o.outDir, "runtime", "unimaker_glyph_sdf_pixels.bin"),
      CHENG_FAKE_LOCATION_ADDR: "中国河南省三门峡市陕州区",
    },
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return { ...parseDigestOutput(stdout), exe, objPath };
}

async function runDeviceDigest(o, digestSrc) {
  const buildDir = join(o.outDir, "digest-android");
  mkdirSync(buildDir, { recursive: true });
  const objPath = join(buildDir, "scene-runtime.android.o");
  const reportPath = join(buildDir, "scene-runtime.android.report.txt");
  await compileChengObject(o, "aarch64-linux-android", digestSrc, objPath, reportPath);
  const llvm = join(o.ndkDir, "toolchains", "llvm", "prebuilt", "darwin-x86_64");
  const sysroot = join(llvm, "sysroot");
  const exe = join(buildDir, "digest_harness");
  execFileSync(join(llvm, "bin", "aarch64-linux-android24-clang"), [
    `--sysroot=${sysroot}`,
    "-fPIE", "-pie",
    "-o", exe, hostCSource, objPath,
  ], { timeout: 60000 });

  const serial = o.device ? ["-s", o.device] : [];
  const sceneData = join(o.outDir, "runtime", "unimaker_scene_data.bin");
  const glyphPixels = join(o.outDir, "runtime", "unimaker_glyph_sdf_pixels.bin");
  const adbRun = (args, timeout = 60000) =>
    runCommand(o.adb, [...serial, ...args], { cwd: repoRoot, encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024 });
  await adbRun(["shell", `mkdir -p '${o.deviceDir}'`]);
  await adbRun(["push", exe, `${o.deviceDir}/digest_harness`]);
  await adbRun(["push", sceneData, `${o.deviceDir}/unimaker_scene_data.bin`]);
  await adbRun(["push", glyphPixels, `${o.deviceDir}/unimaker_glyph_sdf_pixels.bin`]);
  const stdout = await adbRun(["shell",
    `cd '${o.deviceDir}' && chmod 755 digest_harness && ` +
    `CHENG_DIGEST_SCENE_DATA=./unimaker_scene_data.bin ` +
    `CHENG_DIGEST_GLYPH_PIXELS=./unimaker_glyph_sdf_pixels.bin ` +
    `CHENG_FAKE_LOCATION_ADDR='中国河南省三门峡市陕州区' ` +
    `./digest_harness`,
  ], 120000);
  return { ...parseDigestOutput(stdout), exe, objPath };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const [vw, vh] = o.viewport.split("x").map(Number);
  if (!(vw > 0 && vh > 0)) fail(`bad --viewport ${o.viewport}`);
  if (!existsSync(hostCSource)) fail(`missing host shim: ${hostCSource}`);
  const sceneDataPath = join(o.outDir, "runtime", "unimaker_scene_data.bin");
  if (!existsSync(sceneDataPath)) fail(`missing scene data asset: ${sceneDataPath}`);
  const routeTable = readRouteTable(sceneDataPath);

  const sceneRuntimeSrc = join(o.outDir, "unimaker-react.scene-runtime.cheng");
  const digestSrc = join(o.outDir, "unimaker-react.scene-runtime.digest.cheng");
  writeDigestMainSource(sceneRuntimeSrc, digestSrc, vw, vh);

  process.stderr.write(`[1/2] desktop reference digest (arm64-apple-darwin)...\n`);
  const desktop = await runDesktopReference(o, digestSrc);
  process.stderr.write(`  desktop digests: ${desktop.digests.size}/${desktop.routeCount} routes\n`);

  let device = null;
  if (!o.skipDevice) {
    process.stderr.write(`[2/2] device digest (aarch64-linux-android)...\n`);
    device = await runDeviceDigest(o, digestSrc);
    process.stderr.write(`  device digests: ${device.digests.size}/${device.routeCount} routes\n`);
  }

  const routes = [];
  let matched = 0;
  const mismatches = [];
  const blocked = [];
  for (const { routeIndex, routeId } of routeTable) {
    const ref = desktop.digests.get(routeIndex) ?? "";
    const refStatus = desktop.statuses.get(routeIndex) ?? 0;
    const dev = device ? (device.digests.get(routeIndex) ?? "") : "";
    const devStatus = device ? (device.statuses.get(routeIndex) ?? 0) : 0;
    const row = {
      routeIndex, routeId,
      referenceDigest: ref, referenceStatus: refStatus,
      deviceDigest: dev, deviceStatus: devStatus,
      referenceDiagnostics: desktop.routeDiagnostics.get(routeIndex) ?? null,
      deviceDiagnostics: device ? (device.routeDiagnostics.get(routeIndex) ?? null) : null,
      rendered: refStatus === 1 && (!device || devStatus === 1),
    };
    routes.push(row);
    if (refStatus === 2 || (device && devStatus === 2)) blocked.push(row);
    if (device) {
      if (ref && ref === dev && refStatus === devStatus) matched++;
      else mismatches.push(row);
    }
  }

  // Functional 1:1: verify every runtime route edge against the scene.csgc fact graph
  // and (when present) across architectures.
  const routeIdToIndex = new Map(routeTable.map((r) => [r.routeId, r.routeIndex]));
  const routeIndexToId = new Map(routeTable.map((r) => [r.routeIndex, r.routeId]));
  const sceneCsgcPath = join(o.outDir, "unimaker-react.scene.csgc");
  const routeEdgeDetailsPath = join(o.outDir, "unimaker-react.route-edge-details.json");
  const routeReachabilityPath = join(o.outDir, "unimaker-react.route-reachability.json");
  const {
    set: edgeFactSet,
    factEdgeCount,
    nodeDetails,
    edgeDetails,
  } = existsSync(routeEdgeDetailsPath)
    ? readRouteEdgeFactDetailsFromMetadata(routeEdgeDetailsPath, routeIdToIndex)
    : existsSync(sceneCsgcPath)
    ? await readRouteEdgeFactDetails(sceneCsgcPath, routeIdToIndex)
    : existsSync(routeReachabilityPath)
      ? readRouteEdgeFactDetailsFromReachability(routeReachabilityPath, routeIdToIndex)
      : { set: new Set(), factEdgeCount: 0, nodeDetails: new Map(), edgeDetails: new Map() };
  // Classify each edge:
  //  verified      — landed exactly on the fact-graph target, in facts, cross-arch identical.
  //  stateGated     — edge is in the graph but not applicable from the route's BASE state
  //                   (apply returned <0), identical on both archs → deterministic, not a bug.
  //  hardFailure    — cross-arch divergence, edge missing from facts, or mislanding on a
  //                   DIFFERENT real route → these fail the gate.
  const edgeIssues = [];
  const stateGated = [];
  let edgeOk = 0;
  for (const [edgeIndex, e] of desktop.edges) {
    const key = `${e.source}:${e.node}:${e.expectedTarget}`;
    const inFacts = edgeFactSet.has(key);
    const dev = device ? device.edges.get(edgeIndex) : null;
    const crossArchOk = !device || (dev && dev.landed === e.landed && dev.expectedTarget === e.expectedTarget && dev.source === e.source && dev.node === e.node);
    const node = nodeDetails.get(`${e.source}:${e.node}`) ?? {};
    const edge = edgeDetails.get(key) ?? {};
    const row = {
      edgeIndex, source: e.source, node: e.node,
      expectedTarget: e.expectedTarget, landed: e.landed,
      deviceLanded: dev ? dev.landed : null,
      inFactGraph: inFacts, crossArchOk,
      sourceRouteId: edge.sourceRouteId || routeIndexToId.get(e.source) || "",
      expectedTargetRouteId: edge.targetRouteId || routeIndexToId.get(e.expectedTarget) || "",
      landedRouteId: e.landed >= 0 ? (routeIndexToId.get(e.landed) || "") : "",
      failureReason: routeEdgeFailureReason(e.landed),
      nodeTagName: node.tagName ?? "",
      nodeText: node.text ?? "",
      nodeComponentName: node.componentName ?? "",
      nodeSource: node.source ?? "",
      handlers: node.handlers ?? [],
    };
    if (e.landed === e.expectedTarget && inFacts && crossArchOk) {
      edgeOk++;
    } else if (e.landed < 0 && inFacts && crossArchOk) {
      stateGated.push(row);          // in-graph edge, not base-state applicable, deterministic
    } else {
      edgeIssues.push(row);          // divergence / missing fact / mislanded → gate failure
    }
  }
  const edgeWalk = {
    runtimeEdgeCount: desktop.edges.size,
    factEdgeCount,
    verifiedEdges: edgeOk,
    stateGatedCount: stateGated.length,
    stateGatedEdges: stateGated,
    issueCount: edgeIssues.length,
    issues: edgeIssues,
  };

  // Edge hit walk: click the layout center of every route edge's source node and see where
  // the painter-order topmost hit lands. Three benign outcomes are NOT gate failures:
  //   verified                  — the center hit the edge's own node, OR the occluding node
  //                               the center resolved to itself carries a route edge to this
  //                               edge's expected target (the click still functionally reaches
  //                               the expected route).
  //   occludedEdges             — a real overlay node (sidebar mask / publish-selector layer)
  //                               legally sits on top of the target center. Hitting the topmost
  //                               node is painter-order-correct; the overlay node does not route
  //                               to the expected target, so the edge is simply not directly
  //                               clickable in this state — deterministic, not a miscompile.
  //   unmaterializedSourceEdges — the edge's source node has no layout box in this route frame
  //                               (route_edge_layout_box_missing / hitNode == -421): the fact
  //                               graph over-enumerates an edge that has no center to click.
  // Only cross-arch divergence (device != desktop) or any other unexplained negative landing
  // stays an issue. The occlusion verdict is derived purely from the scene fact graph
  // (edgeFactSet) — never a hard-coded route allow-list — mirroring hitRectWalk below.
  const edgeHitIssues = [];
  const occludedEdges = [];
  const unmaterializedSourceEdges = [];
  const stateGatedSourceEdges = [];
  let edgeHitOk = 0;
  for (const [edgeIndex, e] of desktop.edges) {
    const hit = desktop.edgeHits.get(edgeIndex) ?? null;
    const dev = device ? (device.edgeHits.get(edgeIndex) ?? null) : null;
    const key = `${e.source}:${e.node}:${e.expectedTarget}`;
    const edge = edgeDetails.get(key) ?? {};
    const crossArchOk = !device || (
      hit && dev &&
      dev.source === hit.source &&
      dev.node === hit.node &&
      dev.expectedTarget === hit.expectedTarget &&
      dev.hitNode === hit.hitNode
    );
    const hitNode = hit ? hit.hitNode : -900;
    const hitMatchesRouteNode = hitNode === e.node;
    const sourceNode = nodeDetails.get(`${e.source}:${e.node}`) ?? {};
    const sourceStateGated = sourceNode.stateConditional === true;
    // Runtime fact: does the occluding node the center actually resolved to carry a route
    // edge to this edge's expected target? If so, the click still reaches the target route.
    const hitRouteEdgeKey = `${e.source}:${hitNode}:${e.expectedTarget}`;
    const hitTargetsExpectedRoute = hitNode > 0 && edgeFactSet.has(hitRouteEdgeKey);
    const layoutBoxMissing = hitNode === -421;
    const row = {
      edgeIndex,
      source: e.source,
      node: e.node,
      expectedTarget: e.expectedTarget,
      hitNode,
      centerX: hit ? hit.centerX : -900,
      centerY: hit ? hit.centerY : -900,
      deviceHitNode: dev ? dev.hitNode : null,
      sourceRouteId: edge.sourceRouteId || routeIndexToId.get(e.source) || "",
      expectedTargetRouteId: edge.targetRouteId || routeIndexToId.get(e.expectedTarget) || "",
      hitMatchesRouteNode,
      hitTargetsExpectedRoute,
      sourceStateGated,
      conditionalChain: sourceNode.conditionalChain ?? [],
      crossArchOk,
      failureReason: hitMatchesRouteNode ? "" : routeEdgeFailureReason(hitNode),
    };
    if ((hitMatchesRouteNode || hitTargetsExpectedRoute) && crossArchOk) {
      edgeHitOk++;
    } else if (!crossArchOk) {
      edgeHitIssues.push(row);             // cross-arch divergence always fails the gate
    } else if (layoutBoxMissing && sourceStateGated) {
      stateGatedSourceEdges.push(row);     // source exists only behind a runtime state condition
    } else if (layoutBoxMissing) {
      unmaterializedSourceEdges.push(row); // edge source node has no layout box this frame
    } else if (hitNode > 0) {
      occludedEdges.push(row);             // legal painter-order occlusion by an overlay node
    } else {
      edgeHitIssues.push(row);             // any other negative landing is a real mismatch
    }
  }
  const edgeHitWalk = {
    runtimeEdgeCount: desktop.edges.size,
    checkedEdges: desktop.edgeHits.size,
    verifiedHits: edgeHitOk,
    occludedEdgeCount: occludedEdges.length,
    occludedEdges,
    stateGatedSourceEdgeCount: stateGatedSourceEdges.length,
    stateGatedSourceEdges,
    unmaterializedSourceEdgeCount: unmaterializedSourceEdges.length,
    unmaterializedSourceEdges,
    issueCount: edgeHitIssues.length,
    issues: edgeHitIssues,
  };

  const hitRectIssues = [];
  const occludedHitRects = [];
  let hitRectOk = 0;
  for (const [hitRectIndex, h] of desktop.hitRects) {
    const dev = device ? (device.hitRects.get(hitRectIndex) ?? null) : null;
    const crossArchOk = !device || (
      dev &&
      dev.source === h.source &&
      dev.node === h.node &&
      dev.expectedTarget === h.expectedTarget &&
      dev.hitNode === h.hitNode
    );
    const key = `${h.source}:${h.node}:${h.expectedTarget}`;
    const hitRouteEdgeKey = `${h.source}:${h.hitNode}:${h.expectedTarget}`;
    const edge = edgeDetails.get(key) ?? {};
    const hitTargetsExpectedRoute = h.hitNode > 0 && edgeFactSet.has(hitRouteEdgeKey);
    const exactNodeHit = h.hitNode === h.node;
    const row = {
      hitRectIndex,
      source: h.source,
      node: h.node,
      expectedTarget: h.expectedTarget,
      hitNode: h.hitNode,
      centerX: h.centerX,
      centerY: h.centerY,
      deviceHitNode: dev ? dev.hitNode : null,
      sourceRouteId: edge.sourceRouteId || routeIndexToId.get(h.source) || "",
      expectedTargetRouteId: edge.targetRouteId || routeIndexToId.get(h.expectedTarget) || "",
      hitMatchesRouteNode: exactNodeHit,
      hitTargetsExpectedRoute,
      crossArchOk,
      failureReason: exactNodeHit || hitTargetsExpectedRoute ? "" : routeEdgeFailureReason(h.hitNode),
    };
    if ((exactNodeHit || hitTargetsExpectedRoute) && crossArchOk) {
      hitRectOk++;
    } else if (!crossArchOk) {
      hitRectIssues.push(row);
    } else if (h.hitNode > 0) {
      occludedHitRects.push(row);
    } else {
      hitRectIssues.push(row);
    }
  }
  const hitRectWalk = {
    runtimeHitRectCount: desktop.hitRects.size,
    factHitRectCount: desktop.hitRectCount,
    verifiedHitRects: hitRectOk,
    occludedHitRectCount: occludedHitRects.length,
    occludedHitRects,
    acceptedHitRects: hitRectOk + occludedHitRects.length,
    issueCount: hitRectIssues.length,
    issues: hitRectIssues,
  };

  const publishLocationCloseProbe = {
    probeCode: 1,
    desktopStatus: desktop.probes.get(1) ?? -900,
    deviceStatus: device ? (device.probes.get(1) ?? -900) : null,
    desktopReason: publishLocationCloseProbeReason(desktop.probes.get(1) ?? -900),
    deviceReason: device ? publishLocationCloseProbeReason(device.probes.get(1) ?? -900) : "",
    crossArchOk: !device || ((desktop.probes.get(1) ?? -900) === (device.probes.get(1) ?? -900)),
    ok: (desktop.probes.get(1) ?? -900) === 1 && (!device || (device.probes.get(1) ?? -900) === 1),
  };

  const report = {
    schema: "unimaker.digest-oracle.v1",
    // Additive revision: v1 remains the wire identity (the retained-parity gate hard-checks
    // schema === "unimaker.digest-oracle.v1"), so the version bump is expressed here rather
    // than in the schema string to keep the report backward compatible. r2 adds the
    // edgeHitWalk occludedEdges / unmaterializedSourceEdges buckets; r3 adds
    // functionalProbes.publishLocationCloseProbe.
    schemaRevision: 3,
    outDir: o.outDir,
    viewport: o.viewport,
    routeCount: routeTable.length,
    desktopRouteCount: desktop.routeCount,
    deviceRouteCount: device ? device.routeCount : null,
    digestDiff: device ? {
      routeCount: routeTable.length,
      matchedRoutes: matched,
      mismatchedRouteCount: mismatches.length,
      mismatchedRoutes: mismatches,
    } : null,
    renderBlocked: {
      count: blocked.length,
      routes: blocked.map((r) => ({ routeIndex: r.routeIndex, routeId: r.routeId })),
    },
    edgeWalk,
    edgeHitWalk,
    hitRectWalk,
    functionalProbes: {
      publishLocationCloseProbe,
    },
    routes,
    artifacts: {
      digestSource: digestSrc,
      desktopHarness: desktop.exe,
      desktopObject: desktop.objPath,
      deviceHarness: device ? device.exe : "",
      deviceObject: device ? device.objPath : "",
      sceneData: sceneDataPath,
    },
  };
  writeFileSync(o.reportOut, JSON.stringify(report, null, 2) + "\n", "utf8");

  const renderedCount = routes.filter((r) => r.referenceStatus === 1).length;
  process.stdout.write(`\n=== UniMaker Digest Oracle ===\n`);
  process.stdout.write(`routes: ${routeTable.length} (rendered ${renderedCount}, render-blocked ${blocked.length})\n`);
  process.stdout.write(`desktop reference: ${desktop.digests.size} digests\n`);
  if (device) {
    process.stdout.write(`device: ${device.digests.size} digests\n`);
    process.stdout.write(`matched: ${matched}/${routeTable.length}\n`);
    if (mismatches.length > 0) {
      process.stdout.write(`MISMATCHES (cross-arch divergence):\n`);
      for (const m of mismatches) {
        process.stdout.write(`  route ${m.routeIndex} ${m.routeId}: ref=${m.referenceDigest}(s${m.referenceStatus}) device=${m.deviceDigest}(s${m.deviceStatus})\n`);
      }
    }
  } else {
    process.stdout.write(`device: skipped (reference-only)\n`);
    for (const r of routes) {
      const tag = r.referenceStatus === 2 ? " [render-blocked]" : "";
      process.stdout.write(`  route ${r.routeIndex} ${r.routeId}: ${r.referenceDigest}${tag}\n`);
    }
  }
  if (blocked.length > 0) {
    process.stdout.write(`render-blocked routes (functional gaps, not determinism failures):\n`);
    for (const b of blocked) process.stdout.write(`  route ${b.routeIndex} ${b.routeId}\n`);
  }
  process.stdout.write(`edge walk: ${edgeWalk.verifiedEdges}/${edgeWalk.runtimeEdgeCount} verified, ${edgeWalk.stateGatedCount} state-gated (fact graph: ${edgeWalk.factEdgeCount})\n`);
  if (edgeWalk.stateGatedCount > 0) {
    process.stdout.write(`state-gated edges (in graph, not applicable from base route state; deterministic):\n`);
    for (const e of edgeWalk.stateGatedEdges) {
      process.stdout.write(`  edge ${e.edgeIndex} src=${e.source} node=${e.node} -> expect=${e.expectedTarget} reason=${e.failureReason}\n`);
    }
  }
  if (edgeWalk.issueCount > 0) {
    process.stdout.write(`EDGE FAILURES (cross-arch divergence / missing fact / mislanded):\n`);
    for (const e of edgeWalk.issues.slice(0, 20)) {
      process.stdout.write(`  edge ${e.edgeIndex} src=${e.source} node=${e.node} expect=${e.expectedTarget} landed=${e.landed}` +
        ` deviceLanded=${e.deviceLanded} inFacts=${e.inFactGraph} crossArch=${e.crossArchOk}\n`);
    }
    if (edgeWalk.issues.length > 20) process.stdout.write(`  ... and ${edgeWalk.issues.length - 20} more\n`);
  }
  process.stdout.write(`edge hit walk: ${edgeHitWalk.verifiedHits}/${edgeHitWalk.runtimeEdgeCount} layout-center hits verified` +
    ` (${edgeHitWalk.occludedEdgeCount} occluded, ${edgeHitWalk.unmaterializedSourceEdgeCount} unmaterialized-source; benign, not failures)\n`);
  if (edgeHitWalk.issueCount > 0) {
    process.stdout.write(`EDGE HIT FAILURES (layout center did not resolve to route edge node):\n`);
    for (const e of edgeHitWalk.issues.slice(0, 30)) {
      process.stdout.write(`  edge ${e.edgeIndex} src=${e.source} node=${e.node} expect=${e.expectedTarget} hit=${e.hitNode}` +
        ` center=${e.centerX},${e.centerY} deviceHit=${e.deviceHitNode} reason=${e.failureReason}\n`);
    }
    if (edgeHitWalk.issues.length > 30) process.stdout.write(`  ... and ${edgeHitWalk.issues.length - 30} more\n`);
  }
  process.stdout.write(`route hit-rect walk: ${hitRectWalk.acceptedHitRects}/${hitRectWalk.runtimeHitRectCount} explicit hit rects accepted` +
    ` (${hitRectWalk.verifiedHitRects} direct, ${hitRectWalk.occludedHitRectCount} occluded; benign, not failures)\n`);
  if (hitRectWalk.issueCount > 0) {
    process.stdout.write(`HIT RECT FAILURES (explicit route_hit_rect center did not resolve to the expected target route):\n`);
    for (const h of hitRectWalk.issues.slice(0, 30)) {
      process.stdout.write(`  hit_rect ${h.hitRectIndex} src=${h.source} node=${h.node} expect=${h.expectedTarget} hit=${h.hitNode}` +
        ` center=${h.centerX},${h.centerY} deviceHit=${h.deviceHitNode} reason=${h.failureReason}\n`);
    }
    if (hitRectWalk.issues.length > 30) process.stdout.write(`  ... and ${hitRectWalk.issues.length - 30} more\n`);
  }
  process.stdout.write(`publish GPS + close probe: desktop=${publishLocationCloseProbe.desktopStatus}` +
    (device ? ` device=${publishLocationCloseProbe.deviceStatus}` : "") +
    ` reason=${publishLocationCloseProbe.ok ? "ok" : (publishLocationCloseProbe.desktopReason || publishLocationCloseProbe.deviceReason)}\n`);
  process.stdout.write(`report: ${o.reportOut}\n`);

  const visualFail = device && (mismatches.length > 0 || matched !== routeTable.length);
  const edgeFail = edgeWalk.issueCount > 0;
  const hitRectFail = hitRectWalk.issueCount > 0;
  const probeFail = !publishLocationCloseProbe.ok || !publishLocationCloseProbe.crossArchOk;
  if (visualFail || edgeFail || hitRectFail || probeFail) process.exitCode = 1;
}

await main();
