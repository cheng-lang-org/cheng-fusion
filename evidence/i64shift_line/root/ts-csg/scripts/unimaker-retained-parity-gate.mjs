#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runCommand } from "./process-runner.mjs";
import { summarizeSceneActionCoverage } from "./scene-action-coverage.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const defaultProjectRoot = "/Users/lbcheng/UniMaker/React.js";

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  let exitCleanupArmed = false;
  const exitCleanup = () => {
    if (exitCleanupArmed) cleanupGateRun(options);
  };
  process.once("exit", exitCleanup);

  let fatal = null;
  let gateReportPath = "";

  try {
    exitCleanupArmed = true;
    gateReportPath = await runGate(options);
  } catch (err) {
    fatal = err;
  } finally {
    try {
      cleanupGateRun(options);
    } catch (cleanupError) {
      if (fatal === null) fatal = cleanupError;
      else process.stderr.write(`unimaker-retained-parity-gate cleanup: ${cleanupError?.message || String(cleanupError)}\n`);
    } finally {
      exitCleanupArmed = false;
      process.removeListener("exit", exitCleanup);
    }
  }

  if (fatal) {
    process.stderr.write(`unimaker-retained-parity-gate: ${fatal?.stack || fatal?.message || String(fatal)}\n`);
    process.exit(1);
  }

  process.stdout.write(`unimaker-retained-parity-gate ok\n`);
  process.stdout.write(`report: ${gateReportPath}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}

async function runGate(o) {
  mkdirSync(o.outDir, { recursive: true });
  const startedAt = Date.now();

  process.stderr.write(`[1/4] materialize retained scene facts...\n`);
  await runMaterialize(o, { requireGlyphCacheHit: false });

  let summaryPath = join(o.outDir, "one-click.summary.json");
  let summary = readJson(summaryPath);
  if (summary.glyphSdfPrecompute?.cache?.cacheHit !== true) {
    process.stderr.write(`[1/4] glyph cache was cold; re-materialize with required cache hit...\n`);
    await runMaterialize(o, { requireGlyphCacheHit: true });
    summaryPath = join(o.outDir, "one-click.summary.json");
    summary = readJson(summaryPath);
  }

  validateMaterializeSummary(summary);

  process.stderr.write(`[2/4] measure compiled handler coverage...\n`);
  const cht = await measureCompiledHandlers(summary, o.outDir, o.projectRoot);
  if (cht.invokeSites !== 0) {
    throw new Error(`live invoke sites remain after CHT: ${cht.invokeSites}`);
  }
  if (cht.remainingUncompiledUnique !== 0) {
    throw new Error(`uncompiled unique handlers remain: ${cht.remainingUncompiledUnique}`);
  }
  // Gesture classification口径-lock: the gesture set is a small, explicitly-enumerated allow-list of
  // DOM pointer/touch/wheel geometry handlers that the retained discrete dispatch cannot drive. A
  // positive assertion prevents the classification from becoming a silent coverage sink — a future
  // React change that turns a real click handler into a gesture (or a gesture handler vanishing) trips
  // review instead of shrinking coverage unseen. Mirrors the pinned-benign-set discipline elsewhere.
  const EXPECTED_GESTURE_HANDLERS = ["handleMouseMove", "handleWheel", "handleTouchStart", "handleTouchMove", "handleTouchEnd"].sort();
  const actualGestureHandlers = [...(cht.gestureNames || [])].sort();
  if (actualGestureHandlers.length !== EXPECTED_GESTURE_HANDLERS.length || actualGestureHandlers.some((n, i) => n !== EXPECTED_GESTURE_HANDLERS[i])) {
    throw new Error(`gesture handler classification口径 drifted: expected [${EXPECTED_GESTURE_HANDLERS.join(", ")}], got [${actualGestureHandlers.join(", ")}]`);
  }

  process.stderr.write(`[3/4] run retained digest oracle...\n`);
  const digestReportPath = join(o.outDir, "unimaker-digest-oracle.retained-parity.report.json");
  await runCommand(process.execPath, [
    "scripts/unimaker-digest-oracle.mjs",
    "--out-dir", o.outDir,
    "--skip-device",
    "--viewport", o.viewport,
    "--report-out", digestReportPath,
    ...(o.cheng ? ["--cheng-bin", o.cheng] : []),
  ], {
    cwd: packageDir,
    env: process.env,
    encoding: "utf8",
    timeout: o.digestTimeoutMs,
    maxBuffer: 128 * 1024 * 1024,
  });
  const digest = readJson(digestReportPath);
  validateDigestReport(digest, summary);

  process.stderr.write(`[4/4] write retained parity report...\n`);
  const gateReport = {
    schema: "unimaker.retained_parity_gate.v1",
    outDir: o.outDir,
    projectRoot: o.projectRoot,
    viewport: o.viewport,
    elapsedMs: Date.now() - startedAt,
    materialize: {
      summary: summaryPath,
      domCssComplete: summary.domCss?.complete === true,
      domCssHardFailures: Number(summary.domCss?.hardFailureCount ?? -1),
      routeInventoryComplete: summary.routeInventory?.complete === true,
      expectedRouteCount: Number(summary.routeInventory?.expectedRouteCount ?? 0),
      generatedRouteCount: Number(summary.routeInventory?.generatedRouteCount ?? 0),
      routeReachabilityComplete: summary.routeReachability?.complete === true,
      reachableRouteCount: Number(summary.routeReachability?.reachableRouteCount ?? 0),
      routeCount: Number(summary.routeReachability?.routeCount ?? 0),
      edgeCount: Number(summary.routeReachability?.edgeCount ?? 0),
      scene: summary.scene,
      glyphCacheHit: summary.glyphSdfPrecompute?.cache?.cacheHit === true,
      glyphCacheKey: String(summary.glyphSdfPrecompute?.cache?.cacheKey ?? ""),
    },
    cht,
    digest: {
      report: digestReportPath,
      routeCount: Number(digest.routeCount ?? 0),
      renderedRoutes: Array.isArray(digest.routes) ? digest.routes.filter((r) => r.rendered === true).length : 0,
      renderBlockedCount: Number(digest.renderBlocked?.count ?? -1),
      runtimeEdgeCount: Number(digest.edgeWalk?.runtimeEdgeCount ?? 0),
      factEdgeCount: Number(digest.edgeWalk?.factEdgeCount ?? 0),
      verifiedEdges: Number(digest.edgeWalk?.verifiedEdges ?? 0),
      stateGatedCount: Number(digest.edgeWalk?.stateGatedCount ?? 0),
      issueCount: Number(digest.edgeWalk?.issueCount ?? -1),
      runtimeHitRectCount: Number(digest.hitRectWalk?.runtimeHitRectCount ?? 0),
      factHitRectCount: Number(digest.hitRectWalk?.factHitRectCount ?? 0),
      verifiedHitRects: Number(digest.hitRectWalk?.verifiedHitRects ?? 0),
      occludedHitRectCount: Number(digest.hitRectWalk?.occludedHitRectCount ?? 0),
      acceptedHitRects: Number(digest.hitRectWalk?.acceptedHitRects ?? digest.hitRectWalk?.verifiedHitRects ?? 0),
      hitRectIssueCount: Number(digest.hitRectWalk?.issueCount ?? -1),
    },
    cleanup: {
      intermediateFactsRemoved: !o.keepDebugArtifacts && !o.keepIntermediateFacts,
      glyphPrecomputeOutputRemoved: !o.keepDebugArtifacts && !o.keepGlyphPrecomputeOutput,
      glyphDebugArtifactsRemoved: !o.keepDebugArtifacts,
      digestBuildObjectsRemoved: !o.keepDebugArtifacts,
      fontSubsetsRemoved: !o.keepDebugArtifacts,
      productionPayloadKept: true,
      runtimeSceneDataAndPixelsRemoved: false,
    },
  };
  const reportPath = join(o.outDir, "unimaker-retained-parity-gate.report.json");
  writeFileSync(reportPath, JSON.stringify(gateReport, null, 2) + "\n", "utf8");
  return reportPath;
}

async function runMaterialize(o, { requireGlyphCacheHit }) {
  await runCommand(process.execPath, [
    "scripts/unimaker-one-click.mjs",
    "--project-root", o.projectRoot,
    "--out-dir", o.outDir,
    "--stop-after", "materialize",
    "--viewport", o.viewport,
    "--require-dom-css-coverage",
    "--retained-scene-only",
    "--keep-intermediate-facts",
    ...(o.keepExtractCache ? ["--keep-extract-cache"] : []),
    ...(o.keepDebugArtifacts || o.keepGlyphPrecomputeOutput ? ["--keep-glyph-sdf-precompute-debug"] : []),
    "--glyph-sdf-precompute-timeout-ms", String(o.materializeTimeoutMs),
    ...mobileContentSnapshotArgs(o),
    ...(requireGlyphCacheHit ? ["--require-glyph-sdf-precompute-cache-hit"] : []),
    ...(o.cheng ? ["--cheng", o.cheng] : []),
    "--no-dump",
  ], {
    cwd: packageDir,
    env: process.env,
    encoding: "utf8",
    timeout: o.materializeTimeoutMs,
    maxBuffer: 128 * 1024 * 1024,
  });
}

function validateMaterializeSummary(summary) {
  if (summary.schema !== "unimaker.one-click.v1") {
    throw new Error(`unexpected one-click summary schema: ${summary.schema}`);
  }
  if (summary.domCss?.complete !== true || Number(summary.domCss?.hardFailureCount ?? -1) !== 0) {
    throw new Error("DOM/CSS coverage is incomplete or has hard failures");
  }
  if (summary.routeInventory?.complete !== true) {
    throw new Error("route inventory is incomplete");
  }
  const expected = Number(summary.routeInventory?.expectedRouteCount ?? -1);
  const generated = Number(summary.routeInventory?.generatedRouteCount ?? -2);
  if (expected <= 0 || generated !== expected) {
    throw new Error(`route inventory count mismatch: expected=${expected} generated=${generated}`);
  }
  if (summary.routeReachability?.complete !== true) {
    throw new Error("route reachability is incomplete");
  }
  const routeCount = Number(summary.routeReachability?.routeCount ?? -1);
  const reachable = Number(summary.routeReachability?.reachableRouteCount ?? -2);
  if (routeCount <= 0 || reachable !== routeCount) {
    throw new Error(`route reachability mismatch: routeCount=${routeCount} reachable=${reachable}`);
  }
  if (Number(summary.routeReachability?.routesWithoutIncomingEdgeCount ?? -1) !== 0) {
    throw new Error(`routes without incoming edge remain: ${summary.routeReachability?.routesWithoutIncomingEdgeCount}`);
  }
  if (summary.glyphSdfPrecompute?.cache?.cacheHit !== true) {
    throw new Error("glyph SDF precompute cache did not hit");
  }
}

function mobileContentSnapshotArgs(o) {
  const args = [];
  if (o.mobileContentSnapshotFile) {
    args.push("--mobile-content-snapshot-file", o.mobileContentSnapshotFile);
  }
  if (o.mobileContentSnapshotJson) {
    args.push("--mobile-content-snapshot-json", o.mobileContentSnapshotJson);
  }
  if (o.mobileContentSnapshotCdpBaseUrl) {
    args.push("--mobile-content-snapshot-cdp-base-url", o.mobileContentSnapshotCdpBaseUrl);
  }
  if (o.mobileContentSnapshotCdpWsEndpoint) {
    args.push("--mobile-content-snapshot-cdp-ws-endpoint", o.mobileContentSnapshotCdpWsEndpoint);
  }
  if (o.mobileContentSnapshotCdpRoute) {
    args.push("--mobile-content-snapshot-cdp-route", o.mobileContentSnapshotCdpRoute);
  }
  if (o.mobileContentSnapshotCdpTimeoutMs > 0) {
    args.push("--mobile-content-snapshot-cdp-timeout-ms", String(o.mobileContentSnapshotCdpTimeoutMs));
  }
  return args;
}

async function measureCompiledHandlers(summary, outDir, projectRoot) {
  const summaryCht = normalizeCompiledHandlerSummary(summary.compiledHandlerTable);
  if (summaryCht !== null) return summaryCht;

  const { csgcReadFacts } = await import(pathToFileURL(join(packageDir, "dist", "csgc-reader.js")).href);
  const { buildCompiledHandlerTable } = await import(pathToFileURL(join(scriptDir, "scene-runtime-smoke-source.mjs")).href);
  const coreFactsPath = String(summary.facts || join(outDir, "unimaker-react.csgc"));
  const sceneFactsPath = String(summary.sceneFacts || join(outDir, "unimaker-react.scene.csgc"));
  const coreFacts = csgcReadFacts(readFileSync(coreFactsPath)).facts;
  const sceneFacts = csgcReadFacts(readFileSync(sceneFactsPath)).facts;
  const beforeInvokeNames = eventHandlerEffectNames(sceneFacts, "invoke:");
  const beforeCompiledNames = eventHandlerEffectNames(sceneFacts, "compiled:");
  const uniqueInvoke = new Set(beforeInvokeNames);
  const totalBaseline = beforeInvokeNames.length + beforeCompiledNames.length;
  const compiledHandlerTable = await buildCompiledHandlerTable(coreFacts, sceneFacts, { projectRoot });
  const invokeSites = eventHandlerEffectNames(sceneFacts, "invoke:").length;
  const compiledNames = [...new Set(eventHandlerEffectNames(sceneFacts, "compiled:"))].sort();
  const gestureNames = new Set(compiledHandlerTable.gestureNames || []);
  const gestureSites = eventHandlerEffectNames(sceneFacts, "gesture:").length;
  const remaining = [...uniqueInvoke].filter((name) => !compiledNames.includes(name) && !gestureNames.has(name)).sort();
  return {
    baselineInvokeSites: totalBaseline,
    invokeSites,
    compiledAway: totalBaseline - invokeSites,
    compiledCount: compiledNames.length,
    compiledNames,
    gestureSites,
    gestureNames: [...gestureNames],
    remainingUncompiledUnique: remaining.length,
    remainingUncompiledNames: remaining,
    skipCount: Number(compiledHandlerTable.skips?.length ?? 0),
    skipCategories: skipHistogram(compiledHandlerTable.skips ?? []),
    actionCoverage: summarizeSceneActionCoverage(sceneFacts),
  };
}

function normalizeCompiledHandlerSummary(table) {
  if (table?.schema !== "unimaker.compiled_handler_table.v1") return null;
  if (!Number.isInteger(Number(table.invokeSites)) || !Number.isInteger(Number(table.remainingUncompiledUnique))) {
    return null;
  }
  return {
    baselineInvokeSites: Number(table.baselineInvokeSites ?? 0),
    invokeSites: Number(table.invokeSites ?? 0),
    compiledAway: Number(table.compiledAway ?? 0),
    compiledCount: Number(table.compiledCount ?? 0),
    compiledNames: Array.isArray(table.compiledNames) ? [...table.compiledNames] : [],
    gestureSites: Number(table.gestureSites ?? 0),
    gestureNames: Array.isArray(table.gestureNames) ? [...table.gestureNames] : [],
    remainingUncompiledUnique: Number(table.remainingUncompiledUnique ?? 0),
    remainingUncompiledNames: Array.isArray(table.remainingUncompiledNames) ? [...table.remainingUncompiledNames] : [],
    skipCount: Number(table.skipCount ?? 0),
    skipCategories: table.skipCategories && typeof table.skipCategories === "object" ? table.skipCategories : {},
    actionCoverage: table.actionCoverage && typeof table.actionCoverage === "object" ? table.actionCoverage : null,
  };
}

function eventHandlerEffectNames(facts, prefix) {
  const out = [];
  for (const fact of facts) {
    if (fact.kind !== "csg.web.scene.event_handler" || typeof fact.effect !== "string") continue;
    for (const segment of fact.effect.split(";")) {
      if (segment.startsWith(prefix)) out.push(segment.slice(prefix.length));
    }
  }
  return out;
}

function skipHistogram(skips) {
  const hist = {};
  for (const skip of skips) {
    const reason = String(skip.reason ?? "");
    const category = reason.includes(":") ? reason.slice(0, reason.indexOf(":")) : reason;
    hist[category] = Number(hist[category] ?? 0) + 1;
  }
  return hist;
}

function validateDigestReport(digest, summary) {
  // Known-benign fact-graph over-enumeration: edges whose source node legitimately has no
  // layout box in its route's initial frame. Any NEW unmaterialized edge means a node that
  // should be tappable is hidden (e.g. broken state-driven visibility) — fail loudly instead
  // of letting it vanish into the benign bucket. When scene.csgc is available the digest
  // oracle can classify conditional sources as stateGatedSourceEdges instead, so the old
  // benign keys are allowed but no longer required to remain in this weaker bucket.
  //
  // Pinned set tightened 16 → 12 after the scene state-default seed subsystem landed: seeding
  // the ziwei overlay's initial tab/mode state (activeMainTab/activeMode/…) materialises the
  // previously state-gated ziwei nav button of each duplicated overlay↔archive edge pair, so
  // one of each pair is now verified instead of benign-unmaterialized. The remaining ziwei
  // edge of each pair and the 8 thread edges stay genuinely benign.
  const expectedUnmaterializedSourceEdges = [
    "home_ziwei_archive_open->home_ziwei_archive_open",
    "home_ziwei_archive_open->home_ziwei_overlay_open",
    "home_ziwei_overlay_open->home_ziwei_archive_open",
    "home_ziwei_overlay_open->home_ziwei_overlay_open",
    "message_thread->game_xiangqi", "message_thread->marketplace_social_picker",
    "message_thread_more_panel_open->game_xiangqi", "message_thread_more_panel_open->marketplace_social_picker",
    "node_thread->game_xiangqi", "node_thread->marketplace_social_picker",
    "node_thread_more_panel_open->game_xiangqi", "node_thread_more_panel_open->marketplace_social_picker",
  ];
  if (Number(digest.schemaRevision ?? 0) >= 2) {
    const actual = (digest.edgeHitWalk?.unmaterializedSourceEdges ?? [])
      .map((e) => `${e.sourceRouteId}->${e.expectedTargetRouteId}`).sort();
    const allowed = [...expectedUnmaterializedSourceEdges].sort();
    const extra = actual.filter((key) => {
      const at = allowed.indexOf(key);
      if (at >= 0) { allowed.splice(at, 1); return false; }
      return true;
    });
    if (extra.length > 0) {
      throw new Error(`unmaterialized-source edges drifted from pinned benign set: extra=[${extra.join(", ")}]`);
    }
  }
  if (digest.schema !== "unimaker.digest-oracle.v1") {
    throw new Error(`unexpected digest report schema: ${digest.schema}`);
  }
  const routeCount = Number(digest.routeCount ?? -1);
  const expectedRoutes = Number(summary.routeInventory?.expectedRouteCount ?? -2);
  if (routeCount !== expectedRoutes) {
    throw new Error(`digest route count mismatch: digest=${routeCount} expected=${expectedRoutes}`);
  }
  if (Number(digest.renderBlocked?.count ?? -1) !== 0) {
    throw new Error(`render-blocked routes remain: ${Number(digest.renderBlocked?.count ?? -1)}`);
  }
  const rendered = Array.isArray(digest.routes) ? digest.routes.filter((r) => r.rendered === true).length : 0;
  if (rendered !== routeCount) {
    throw new Error(`not all routes rendered: rendered=${rendered} routeCount=${routeCount}`);
  }
  const runtimeEdges = Number(digest.edgeWalk?.runtimeEdgeCount ?? -1);
  const factEdges = Number(digest.edgeWalk?.factEdgeCount ?? -2);
  const expectedEdges = Number(summary.routeReachability?.edgeCount ?? -3);
  if (runtimeEdges !== expectedEdges || factEdges !== expectedEdges) {
    throw new Error(`edge count mismatch: runtime=${runtimeEdges} fact=${factEdges} expected=${expectedEdges}`);
  }
  if (Number(digest.edgeWalk?.issueCount ?? -1) !== 0) {
    throw new Error(`digest edge failures remain: ${Number(digest.edgeWalk?.issueCount ?? -1)}`);
  }
  const runtimeHitRects = Number(digest.hitRectWalk?.runtimeHitRectCount ?? -1);
  const factHitRects = Number(digest.hitRectWalk?.factHitRectCount ?? -2);
  const expectedHitRects = Number(summary.scene?.routeHitRects ?? -3);
  if (runtimeHitRects !== expectedHitRects || factHitRects !== expectedHitRects) {
    throw new Error(`hit rect count mismatch: runtime=${runtimeHitRects} fact=${factHitRects} expected=${expectedHitRects}`);
  }
  if (Number(digest.hitRectWalk?.issueCount ?? -1) !== 0) {
    throw new Error(`digest hit-rect failures remain: ${Number(digest.hitRectWalk?.issueCount ?? -1)}`);
  }
}

function cleanupIntermediateFacts(root) {
  for (const name of [
    "unimaker-react.csgc",
    "unimaker-react.csgc.debug",
    "unimaker-react.csgweb",
    "unimaker-react.csgwebc.debug",
    "unimaker-react.scene.csgc",
  ]) {
    rmSync(join(root, name), { force: true });
  }
}

function cleanupGlyphPrecomputeOutput(root) {
  rmSync(join(root, "unimaker-react.scene-glyph-sdf-precompute.out"), { force: true });
}

export function cleanupGateRun(o) {
  cleanupGateArtifacts(o);
  sanitizeGateSummaryPaths(o);
  sanitizeDigestReports(o);
}

function cleanupGateArtifacts(o) {
  const root = o.outDir;
  if (!root || !existsSync(root)) return;
  if (!o.keepDebugArtifacts && !o.keepIntermediateFacts) cleanupIntermediateFacts(root);
  if (!o.keepDebugArtifacts && !o.keepGlyphPrecomputeOutput) cleanupGlyphPrecomputeOutput(root);
  if (o.keepDebugArtifacts) return;

  for (const path of [
    join(root, "font-subsets"),
    join(root, "digest-desktop"),
  ]) {
    rmSync(path, { recursive: true, force: true });
  }
  for (const path of [
    join(root, "unimaker-react.scene-runtime.digest.cheng"),
    join(root, "unimaker-react.scene-glyph-sdf-precompute.cheng"),
    join(root, "unimaker-react.scene-glyph-sdf-precompute"),
    join(root, "unimaker-react.scene-glyph-sdf-precompute.report.txt"),
    join(root, "unimaker-react.scene-glyph-sdf-precompute.report.txt.stderr"),
    join(root, "unimaker-react.scene-glyph-sdf-precompute.pixels.bin"),
  ]) {
    rmSync(path, { force: true });
  }
}

function sanitizeGateSummaryPaths(o) {
  const summaryPath = join(o.outDir, "one-click.summary.json");
  if (!existsSync(summaryPath)) return;
  const summary = readJson(summaryPath);
  for (const [owner, keys] of [
    [summary, ["facts", "jsonlFacts", "sceneFacts", "source", "executable", "compileReport"]],
    [summary.materializedSource, ["path"]],
    [summary.glyphSdfPrecompute, ["source", "executable", "report", "output", "sceneDataAsset", "pixelAsset"]],
  ]) {
    clearMissingSummaryPaths(owner, keys, o.outDir);
  }
  if (summary.glyphSdfPrecompute && !o.keepDebugArtifacts) {
    summary.glyphSdfPrecompute.debugArtifactsKept = false;
  }
  clearMissingFontPaths(summary.font, o.outDir);
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
}

function sanitizeDigestReports(o) {
  if (o.keepDebugArtifacts) return;
  for (const name of [
    "unimaker-digest-oracle.report.json",
    "unimaker-digest-oracle.retained-parity.report.json",
  ]) {
    const reportPath = join(o.outDir, name);
    if (!existsSync(reportPath)) continue;
    const report = readJson(reportPath);
    if (report.schema !== "unimaker.digest-oracle.v1") {
      throw new Error(`unexpected digest report schema in ${reportPath}: ${report.schema}`);
    }
    if (!report.artifacts || typeof report.artifacts !== "object" || Array.isArray(report.artifacts)) {
      throw new Error(`missing digest report artifacts object: ${reportPath}`);
    }
    clearMissingSummaryPaths(report.artifacts, [
      "digestSource",
      "desktopHarness",
      "desktopObject",
      "deviceHarness",
      "deviceObject",
      "sceneData",
    ], o.outDir);
    report.artifacts.artifactsKept = false;
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  }
}

function clearMissingSummaryPaths(owner, keys, root) {
  if (!owner || typeof owner !== "object") return;
  for (const key of keys) {
    const value = typeof owner[key] === "string" ? owner[key] : "";
    if (!value) continue;
    const path = isAbsolute(value) ? value : join(root, value);
    if (!existsSync(path)) owner[key] = "";
  }
}

function clearMissingFontPaths(font, root) {
  if (!font || typeof font !== "object") return;
  clearMissingSummaryPaths(font, ["path", "glyphText"], root);
  if (Array.isArray(font.fonts)) {
    for (const face of font.fonts) clearMissingFontPaths(face, root);
  }
}

function readJson(path) {
  if (!existsSync(path)) throw new Error(`missing JSON file: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

export function parseArgs(args) {
  const parsed = {
    projectRoot: defaultProjectRoot,
    outDir: resolve(packageDir, "tmp", `unimaker-retained-parity-gate-${process.pid}-${randomUUID()}`),
    viewport: "390x844",
    materializeTimeoutMs: 600000,
    digestTimeoutMs: 600000,
    cheng: "",
    mobileContentSnapshotFile: "",
    mobileContentSnapshotJson: "",
    mobileContentSnapshotCdpBaseUrl: "",
    mobileContentSnapshotCdpWsEndpoint: "",
    mobileContentSnapshotCdpRoute: "",
    mobileContentSnapshotCdpTimeoutMs: 0,
    keepIntermediateFacts: false,
    keepGlyphPrecomputeOutput: false,
    keepDebugArtifacts: false,
    keepExtractCache: false,
    help: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      i += 1;
      if (i >= args.length) throw new Error(`missing value for ${arg}`);
      return args[i];
    };
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--project-root") parsed.projectRoot = resolve(next());
    else if (arg === "--out-dir") parsed.outDir = resolve(next());
    else if (arg === "--viewport") parsed.viewport = next();
    else if (arg === "--materialize-timeout-ms") parsed.materializeTimeoutMs = positiveInt(next(), arg);
    else if (arg === "--digest-timeout-ms") parsed.digestTimeoutMs = positiveInt(next(), arg);
    else if (arg === "--cheng") parsed.cheng = resolve(next());
    else if (arg === "--mobile-content-snapshot-file" || arg === "--pwa-content-snapshot-file") parsed.mobileContentSnapshotFile = resolve(next());
    else if (arg === "--mobile-content-snapshot-json" || arg === "--pwa-content-snapshot-json") parsed.mobileContentSnapshotJson = next();
    else if (arg === "--mobile-content-snapshot-cdp-base-url" || arg === "--pwa-content-snapshot-cdp-base-url") parsed.mobileContentSnapshotCdpBaseUrl = next().trim();
    else if (arg === "--mobile-content-snapshot-cdp-ws-endpoint" || arg === "--pwa-content-snapshot-cdp-ws-endpoint") parsed.mobileContentSnapshotCdpWsEndpoint = next().trim();
    else if (arg === "--mobile-content-snapshot-cdp-route" || arg === "--pwa-content-snapshot-cdp-route") parsed.mobileContentSnapshotCdpRoute = next().trim();
    else if (arg === "--mobile-content-snapshot-cdp-timeout-ms" || arg === "--pwa-content-snapshot-cdp-timeout-ms") parsed.mobileContentSnapshotCdpTimeoutMs = positiveInt(next(), arg);
    else if (arg === "--keep-intermediate-facts") parsed.keepIntermediateFacts = true;
    else if (arg === "--keep-glyph-precompute-output") parsed.keepGlyphPrecomputeOutput = true;
    else if (arg === "--keep-intermediates" || arg === "--keep-debug-artifacts") parsed.keepDebugArtifacts = true;
    else if (arg === "--keep-extract-cache") parsed.keepExtractCache = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!/^[1-9][0-9]*x[1-9][0-9]*$/.test(parsed.viewport)) {
    throw new Error(`bad --viewport: ${parsed.viewport}`);
  }
  return parsed;
}

function positiveInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} must be a positive integer`);
  return n;
}

function helpText() {
  return `Usage: node scripts/unimaker-retained-parity-gate.mjs [flags]

Build and verify the UniMaker retained pure-Cheng GUI parity surface.

Flags:
  --project-root <dir>              React/PWA project root
  --out-dir <dir>                   Output directory
  --viewport <WxH>                  Logical viewport, default 390x844
  --cheng <path>                    Cheng compiler binary override, forwarded to
                                     unimaker-one-click.mjs --cheng and
                                     unimaker-digest-oracle.mjs --cheng-bin
                                     (default: each script's own default)
  --mobile-content-snapshot-file <path>
                                     PWA content snapshot JSON for retained mobile content routes
  --mobile-content-snapshot-json <json>
                                     Inline PWA content snapshot JSON
  --mobile-content-snapshot-cdp-base-url <url>
                                     Existing PWA browser base URL for CDP snapshot capture
  --mobile-content-snapshot-cdp-ws-endpoint <url>
                                     Existing PWA browser websocket endpoint for CDP snapshot capture
  --mobile-content-snapshot-cdp-route <id>
                                     Initial route id for CDP snapshot capture
  --mobile-content-snapshot-cdp-timeout-ms <n>
                                     CDP snapshot timeout
  --materialize-timeout-ms <n>      Materialize timeout, default 600000
  --digest-timeout-ms <n>           Digest timeout, default 600000
  --keep-intermediate-facts         Keep .csgc/.csgc.debug/.csgweb files
  --keep-glyph-precompute-output    Keep glyph precompute .out file
  --keep-intermediates              Keep facts, font subsets, glyph debug artifacts, and digest objects
  --keep-extract-cache              Retain the extract cache across runs (warm reruns)
`;
}
