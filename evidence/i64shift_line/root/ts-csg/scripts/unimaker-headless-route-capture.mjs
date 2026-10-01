#!/usr/bin/env node
// unimaker-headless-route-capture.mjs — 46-route headless (no device, no browser) pixel capture +
// self-consistency oracle gate for the UniMaker retained mobile scene.
//
// Reuses two existing, unmodified channels — no new render path:
//   1. scripts/unimaker-one-click.mjs --raw-pixels --mobile-scene-initial-route <id>
//      (extract → materialize → compile → run the retained scene as a host-native executable;
//      when mobileAppExports+rawPixelDump the materializer already emits
//      `raster.RasterPaintOps` + `raster.WebRasterDumpPixels(surface)` bracketed by
//      `---CHENG_SCREENSHOT_DUMP---` / `---CHENG_DUMP_END---` markers with NO Android host
//      present() symbols required — see csg-web-materializer-smoke.mjs "Headless mobile
//      raw-pixel oracle must not require Android host render symbols").
//   2. tools/cheng-web-oracle.ts --cheng-screenshot <a.raw> --chrome-screenshot <b.raw>
//      (the same canonical per-pixel diff engine unimaker-pixel-parity-matrix.mjs uses for the
//      on-device gate; the flag names are historical, both inputs here are Cheng-rendered raws).
//
// This is a SELF-consistency gate: both sides of every diff are the Cheng scene runtime's own
// raster output (current capture vs a pinned golden capture from an earlier known-good run), not
// a comparison against the React PWA (that needs a real Chrome render — see --require-pwa-browser
// below, which is left OFF by default and reported as an explicit blocked reason when requested
// without a reachable dev server, per project instruction: never fabricate a baseline).
//
// Route enumeration is NOT hand-copied. `loadRouteCatalog` parses the `unimakerReactRouteCatalog`
// source array literal out of unimaker-one-click.mjs itself (the single production source of the
// 46 UniMaker mobile scene routes — the same list resolveMobileSceneRoutes() falls back to for the
// default project), so this tool tracks the real route set even as it changes.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { runCommand } from "./process-runner.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const oneClickScript = join(scriptDir, "unimaker-one-click.mjs");
const webOracleScript = join(repoRoot, "tools", "cheng-web-oracle.ts");
const defaultFixtureSnapshot = join(scriptDir, "unimaker-fixtures", "unimaker-pwa-content-snapshot.json");
const defaultGoldenDir = join(scriptDir, "unimaker-fixtures", "headless-route-golden");

const VIEWPORT_W = 390;
const VIEWPORT_H = 844;

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(helpText());
  process.exit(0);
}
if (!options.cheng) {
  // unimaker-one-click.mjs's own default is artifacts/bootstrap/cheng.stage3 (the C-linked cold
  // compiler), which cannot hold this pipeline's ~230MB generated per-route Cheng source (hits
  // "cold rss limit exceeded" / gate_blocker_id=cold_reachable_body_missing). The production
  // full_backend_codegen driver at artifacts/backend_driver/cheng is required; default to it
  // instead of silently inheriting one-click's weaker default.
  const backendDriverCheng = join(repoRoot, "artifacts", "backend_driver", "cheng");
  if (existsSync(backendDriverCheng)) options.cheng = backendDriverCheng;
}

const routeCatalog = loadRouteCatalog(oneClickScript);
if (routeCatalog.length === 0) fail(`could not parse unimakerReactRouteCatalog out of ${oneClickScript}`);

const routes = resolveRoutes(options.routes, routeCatalog);
const goldenDir = resolvePath(options.goldenDir || defaultGoldenDir);
const outDir = resolvePath(options.outDir || join(packageDir, "tmp", `unimaker-headless-route-capture-${Date.now()}`));
mkdirSync(outDir, { recursive: true });
if (options.updateGolden) mkdirSync(goldenDir, { recursive: true });

process.stdout.write(`route catalog: ${routeCatalog.length} routes parsed from ${oneClickScript}\n`);
process.stdout.write(`routes to run: ${routes.length}\n`);
process.stdout.write(`golden dir: ${goldenDir} (${options.updateGolden ? "WILL BE UPDATED" : "read-only baseline"})\n`);
process.stdout.write(`out dir: ${outDir}\n\n`);

const startedAt = Date.now();
const results = [];
// Multi-frame path: one one-click compile+run with --mobile-scene-multi-frame-dump emits
// ---CHENG_ROUTE_FRAME--- + routeId + screenshot dump for every embedded mobile route.
// Default ON when capturing >1 route (saves N-1 full recompiles). Fall back to per-route
// recompile when --no-multi-frame is set or only one route is requested.
const useMultiFrame = options.multiFrame && routes.length > 1;
if (useMultiFrame) {
  process.stdout.write(`[multi-frame] one compile for ${routes.length} requested routes (materializer dumps every embedded mobile route)\n`);
  const multi = await captureAndScoreMultiFrame(routes);
  results.push(...multi);
  for (const result of multi) {
    process.stdout.write(`[route] ${result.routeId} -> ${describeResult(result)}\n`);
  }
  writeIncrementalReport();
} else {
  if (routes.length > 1 && !options.multiFrame) {
    process.stdout.write(`[multi-frame] disabled; per-route recompile path\n`);
  }
  for (const routeId of routes) {
    process.stdout.write(`[route] ${routeId} ...\n`);
    const result = await captureAndScoreRoute(routeId);
    results.push(result);
    process.stdout.write(`[route] ${routeId} -> ${describeResult(result)}\n`);
    writeIncrementalReport(); // keep a live report on disk in case a later route hangs/crashes the batch
  }
}

let positiveControl = null;
if (options.injectTestRegression) {
  positiveControl = await runPositiveControl(options.injectTestRegression, results);
  process.stdout.write(`\n[positive-control] ${options.injectTestRegression} -> ${positiveControl.status}: ${positiveControl.detail}\n`);
}

const summary = buildSummary(results);
writeIncrementalReport();

process.stdout.write(`\n=== unimaker-headless-route-capture ===\n`);
process.stdout.write(`routes: ${summary.routeCount}  pass: ${summary.passCount}  fail: ${summary.failCount}  baselineCreated: ${summary.baselineCreatedCount}  error: ${summary.errorCount}\n`);
if (summary.failCount > 0) {
  process.stdout.write(`worst diffs:\n`);
  for (const w of summary.worstFailures) {
    process.stdout.write(`  ${w.routeId}: diffPixels=${w.diffPixels}/${w.totalPixels} (${w.pixelDiffPercent.toFixed(4)}%)\n`);
  }
}
if (positiveControl) process.stdout.write(`positive control (${options.injectTestRegression}): ${positiveControl.status}\n`);
process.stdout.write(`report: ${join(outDir, "unimaker-headless-route-capture.report.json")}\n`);

process.exitCode = summary.allPassed && (!positiveControl || positiveControl.status === "caught") ? 0 : 1;

// ── core capture pipeline ──

async function captureAndScoreMultiFrame(routeIds) {
  const batchDir = join(outDir, "multi-frame");
  mkdirSync(batchDir, { recursive: true });
  const oneClickOutDir = join(batchDir, "one-click");
  const runOutputFile = join(batchDir, "run.stdout.txt");
  const initialRoute = routeIds[0];
  const runResult = await runOneClick(initialRoute, oneClickOutDir, runOutputFile, { multiFrameDump: true });
  if (!runResult.ok) {
    return routeIds.map((routeId) => ({
      routeId,
      status: "error",
      reason: `multi-frame one-click failed: ${runResult.reason}`,
      runOutputFile,
      oneClickOutDir,
      multiFrame: true,
    }));
  }
  const frames = await extractMultiRouteScreenshotDumps(runOutputFile, VIEWPORT_W, VIEWPORT_H);
  if (frames.error) {
    return routeIds.map((routeId) => ({
      routeId,
      status: "error",
      reason: `multi-frame dump parse failed: ${frames.error}`,
      runOutputFile,
      oneClickOutDir,
      multiFrame: true,
    }));
  }
  const out = [];
  for (const routeId of routeIds) {
    const dump = frames.byRouteId.get(routeId);
    if (!dump) {
      out.push({
        routeId,
        status: "error",
        reason: `multi-frame run missing ---CHENG_ROUTE_FRAME--- for ${routeId} (parsed ${frames.byRouteId.size} frames: ${[...frames.byRouteId.keys()].slice(0, 8).join(",")}${frames.byRouteId.size > 8 ? "..." : ""})`,
        runOutputFile,
        oneClickOutDir,
        multiFrame: true,
      });
      continue;
    }
    const result = await scoreCapturedPixels(routeId, dump.pixels, {
      runOutputFile,
      oneClickOutDir,
      multiFrame: true,
    });
    out.push(result);
  }
  return out;
}

async function captureAndScoreRoute(routeId) {
  const routeDir = join(outDir, "routes", routeId);
  mkdirSync(routeDir, { recursive: true });
  const oneClickOutDir = join(routeDir, "one-click");
  const runOutputFile = join(routeDir, "run.stdout.txt");

  const runResult = await runOneClick(routeId, oneClickOutDir, runOutputFile, { multiFrameDump: false });
  if (!runResult.ok) {
    return { routeId, status: "error", reason: runResult.reason, runOutputFile, oneClickOutDir };
  }

  const dump = await extractScreenshotDump(runOutputFile, VIEWPORT_W, VIEWPORT_H);
  if (!dump.found) {
    return { routeId, status: "error", reason: `no CHENG_SCREENSHOT_DUMP block in run output: ${dump.parseError ?? "unknown"}`, runOutputFile, oneClickOutDir };
  }
  return scoreCapturedPixels(routeId, dump.pixels, { runOutputFile, oneClickOutDir, multiFrame: false });
}

async function scoreCapturedPixels(routeId, pixels, meta) {
  const routeDir = join(outDir, "routes", routeId);
  mkdirSync(routeDir, { recursive: true });
  const rawPath = join(routeDir, `${routeId}.raw`);
  writeRawFile(pixels, VIEWPORT_W, VIEWPORT_H, rawPath);
  const sha256 = createHash("sha256").update(pixels).digest("hex");
  const nonWhitePixels = countNonWhite(pixels);

  const goldenRawPath = join(goldenDir, `${routeId}.raw`);
  if (options.updateGolden || !existsSync(goldenRawPath)) {
    writeRawFile(pixels, VIEWPORT_W, VIEWPORT_H, goldenRawPath);
    return {
      routeId,
      status: "baseline_created",
      reason: options.updateGolden ? "operator requested --update-golden" : "no prior golden for this route; this capture becomes the baseline (not asserted correct, just recorded)",
      rawPath, goldenRawPath, sha256, nonWhitePixels,
      totalPixels: VIEWPORT_W * VIEWPORT_H,
      runOutputFile: meta.runOutputFile,
      oneClickOutDir: meta.oneClickOutDir,
      multiFrame: Boolean(meta.multiFrame),
    };
  }

  const diffReportPath = join(routeDir, "oracle-diff.report.json");
  const diff = await diffRawFrames(rawPath, goldenRawPath, diffReportPath);
  if (!diff) {
    return {
      routeId,
      status: "error",
      reason: "oracle diff produced no report",
      runOutputFile: meta.runOutputFile,
      oneClickOutDir: meta.oneClickOutDir,
      multiFrame: Boolean(meta.multiFrame),
    };
  }
  const pass = diff.diffPixels <= options.passDiffPixels;
  return {
    routeId,
    status: pass ? "pass" : "fail",
    rawPath, goldenRawPath, sha256, nonWhitePixels,
    diffPixels: diff.diffPixels,
    totalPixels: diff.totalPixels,
    pixelDiffPercent: diff.pixelDiffPercent,
    maxPixelDiff: diff.maxPixelDiff,
    diffReportPath,
    runOutputFile: meta.runOutputFile,
    oneClickOutDir: meta.oneClickOutDir,
    multiFrame: Boolean(meta.multiFrame),
  };
}

async function runOneClick(routeId, oneClickOutDir, runOutputFile, runOpts = {}) {
  const args = [
    oneClickScript,
    "--out-dir", oneClickOutDir,
    "--mobile-scene-initial-route", routeId,
    "--mobile-content-snapshot-file", options.fixtureSnapshot,
    "--raw-pixels",
    "--run-output-file", runOutputFile,
    "--glyph-sdf-precompute-timeout-ms", String(options.glyphTimeoutMs),
    "--compile-timeout-ms", String(options.compileTimeoutMs),
    "--run-timeout-ms", String(options.runTimeoutMs),
  ];
  if (runOpts.multiFrameDump) args.push("--mobile-scene-multi-frame-dump");
  // Multi-frame dumps every embedded mobile route (typically ~46), not just the --routes selection.
  // Give the run enough wall time: keep operator override if higher, else 20s * catalog size floor 10min.
  const runTimeoutMs = runOpts.multiFrameDump
    ? Math.max(options.runTimeoutMs, Math.max(600000, routeCatalog.length * 20000))
    : options.runTimeoutMs;
  // rewrite the run-timeout-ms arg already pushed above
  const runTimeoutIdx = args.indexOf("--run-timeout-ms");
  if (runTimeoutIdx >= 0 && runTimeoutIdx + 1 < args.length) args[runTimeoutIdx + 1] = String(runTimeoutMs);
  if (options.cheng) args.push("--cheng", options.cheng);
  if (options.keepGlyphSdfPrecomputeDebug) args.push("--keep-glyph-sdf-precompute-debug");
  const stdoutPath = join(oneClickOutDir, "..", "one-click.stdout.log");
  const stderrPath = join(oneClickOutDir, "..", "one-click.stderr.log");
  mkdirSync(oneClickOutDir, { recursive: true });
  const oneClickTimeoutMs = runOpts.multiFrameDump
    ? Math.max(options.oneClickTimeoutMs, options.compileTimeoutMs + runTimeoutMs + 120000)
    : options.oneClickTimeoutMs;
  try {
    await runCommand(process.execPath, args, {
      cwd: packageDir,
      encoding: "utf8",
      timeout: oneClickTimeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      stdoutPath,
      stderrPath,
    });
  } catch (err) {
    if (!existsSync(runOutputFile)) {
      return { ok: false, reason: describeError(err, stderrPath) };
    }
    // one-click can exit non-zero for reasons unrelated to the dump (e.g. --raw-pixels runs are
    // frame-bounded, not a hard app failure) — the run output file presence + dump parse below is
    // the real source of truth, mirroring how unimaker-pixel-parity-matrix.mjs treats child exit codes.
  }
  if (!existsSync(runOutputFile)) return { ok: false, reason: `run output file missing: ${runOutputFile}` };
  return { ok: true };
}

async function diffRawFrames(rawA, rawB, outPath) {
  try {
    await runCommand(process.execPath, [
      "--experimental-strip-types",
      webOracleScript,
      "--cheng-screenshot", rawA,
      "--chrome-screenshot", rawB,
      "--viewport", `${VIEWPORT_W}x${VIEWPORT_H}`,
      "--format", "json",
      "--out", outPath,
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    // The oracle exits non-zero whenever the diff misses its (unrelated, dom/layout-oriented)
    // threshold; the JSON report is still written and is the source of truth, same convention as
    // unimaker-pixel-parity-matrix.mjs.
  }
  if (!existsSync(outPath)) return null;
  const sd = readJson(outPath)?.screenshotDiff;
  if (!sd || typeof sd.pixelDiffPercent !== "number") return null;
  return {
    pixelDiffPercent: sd.pixelDiffPercent,
    diffPixels: numberOr(sd.diffPixels, 0),
    totalPixels: numberOr(sd.totalPixels, 0),
    maxPixelDiff: numberOr(sd.maxPixelDiff, 0),
  };
}

// ── positive control: prove the gate actually reddens on a real 1px change ──
// Copies a route's OWN just-captured raw frame, flips exactly one pixel's RGBA to a value that
// cannot occur by antialiasing (hard-coded far-outlier color), and re-diffs it against the same
// route's golden. This never touches the report for the real routes above (separate temp files).
async function runPositiveControl(routeId, results) {
  const target = results.find((r) => r.routeId === routeId);
  if (!target) return { status: "error", detail: `route not in this run's --routes selection: ${routeId}` };
  if (!target.rawPath || !existsSync(target.rawPath)) {
    return { status: "error", detail: `route has no captured raw to corrupt: ${routeId} (status=${target.status})` };
  }
  const goldenRawPath = target.goldenRawPath || join(goldenDir, `${routeId}.raw`);
  if (!existsSync(goldenRawPath)) return { status: "error", detail: `no golden to diff against for ${routeId}` };

  const controlDir = join(outDir, "positive-control", routeId);
  mkdirSync(controlDir, { recursive: true });
  const corruptedPath = join(controlDir, `${routeId}.corrupted.raw`);
  const buf = Buffer.from(readFileSync(target.rawPath));
  const headerBytes = 8;
  const pixelOffset = headerBytes + 4 * (Math.floor(VIEWPORT_H / 2) * VIEWPORT_W + Math.floor(VIEWPORT_W / 2)); // 1px near center
  const before = [buf[pixelOffset], buf[pixelOffset + 1], buf[pixelOffset + 2], buf[pixelOffset + 3]];
  // Pick a color guaranteed to differ from whatever was there (flip to its bitwise complement on RGB).
  buf[pixelOffset] = 255 - buf[pixelOffset];
  buf[pixelOffset + 1] = 255 - buf[pixelOffset + 1];
  buf[pixelOffset + 2] = 255 - buf[pixelOffset + 2];
  writeFileSync(corruptedPath, buf);

  return diffRawFrames(corruptedPath, goldenRawPath, join(controlDir, "oracle-diff.report.json")).then((diff) => {
    if (!diff) return { status: "error", detail: "oracle produced no report for the corrupted frame" };
    const caught = diff.diffPixels >= 1;
    return {
      status: caught ? "caught" : "MISSED",
      detail: `flipped 1 pixel at (${Math.floor(VIEWPORT_W / 2)},${Math.floor(VIEWPORT_H / 2)}) from rgba(${before.join(",")}) -> oracle reported diffPixels=${diff.diffPixels}, pixelDiffPercent=${diff.pixelDiffPercent}`,
      diffPixels: diff.diffPixels,
      pixelDiffPercent: diff.pixelDiffPercent,
      corruptedPath,
    };
  });
}

// ── screenshot dump parsing (same convention as pixel-coverage-analysis.mjs / unimaker-pixel-oracle-matrix.mjs) ──

async function extractScreenshotDump(filePath, width, height) {
  if (!existsSync(filePath)) return { found: false, parseError: "run output file does not exist" };
  const lines = createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity });
  const pixels = Buffer.alloc(width * height * 4);
  let offset = 0;
  let inDump = false;
  let found = false;
  for await (const line of lines) {
    if (line === "---CHENG_SCREENSHOT_DUMP---") { inDump = true; continue; }
    if (line === "---CHENG_DUMP_END---") break;
    if (!inDump || !line.startsWith("row: ")) continue;
    found = true;
    const parts = line.slice("row: ".length).split(",");
    const numVals = Math.min(parts.length, width * 4);
    for (let i = 0; i < numVals; i += 4) {
      pixels[offset++] = Number(parts[i]);
      pixels[offset++] = Number(parts[i + 1]);
      pixels[offset++] = Number(parts[i + 2]);
      pixels[offset++] = Number(parts[i + 3] ?? 255);
    }
    const rowBytes = width * 4;
    while (offset % rowBytes !== 0 && offset < pixels.length) pixels[offset++] = 0;
  }
  while (offset < pixels.length) pixels[offset++] = 0;
  if (!found) return { found: false, parseError: "no ---CHENG_SCREENSHOT_DUMP--- rows found" };
  return { found: true, pixels };
}

// Multi-frame run output layout (materializer mobileMultiFrameDump path):
//   ---CHENG_ROUTE_FRAME---
//   <routeId>
//   ---CHENG_SCREENSHOT_DUMP---
//   row: ...
//   ---CHENG_DUMP_END---
// repeated once per embedded mobile route.
async function extractMultiRouteScreenshotDumps(filePath, width, height) {
  if (!existsSync(filePath)) return { error: "run output file does not exist", byRouteId: new Map() };
  const lines = createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity });
  const byRouteId = new Map();
  let awaitingRouteId = false;
  let pendingRouteId = null;
  let inDump = false;
  let currentRouteId = null;
  let pixels = null;
  let offset = 0;

  const finishDump = () => {
    if (!currentRouteId || !pixels) {
      inDump = false;
      currentRouteId = null;
      pixels = null;
      offset = 0;
      return;
    }
    while (offset < pixels.length) pixels[offset++] = 0;
    byRouteId.set(currentRouteId, { pixels });
    currentRouteId = null;
    pixels = null;
    offset = 0;
    inDump = false;
  };

  for await (const line of lines) {
    if (line === "---CHENG_ROUTE_FRAME---") {
      if (inDump) finishDump();
      awaitingRouteId = true;
      pendingRouteId = null;
      continue;
    }
    if (awaitingRouteId) {
      awaitingRouteId = false;
      pendingRouteId = line.trim();
      continue;
    }
    if (line === "---CHENG_SCREENSHOT_DUMP---") {
      if (inDump) finishDump();
      currentRouteId = pendingRouteId || `__anonymous_${byRouteId.size}`;
      pendingRouteId = null;
      pixels = Buffer.alloc(width * height * 4);
      offset = 0;
      inDump = true;
      continue;
    }
    if (line === "---CHENG_DUMP_END---") {
      if (inDump) finishDump();
      continue;
    }
    if (!inDump || !line.startsWith("row: ")) continue;
    const parts = line.slice("row: ".length).split(",");
    const numVals = Math.min(parts.length, width * 4);
    for (let i = 0; i < numVals; i += 4) {
      pixels[offset++] = Number(parts[i]);
      pixels[offset++] = Number(parts[i + 1]);
      pixels[offset++] = Number(parts[i + 2]);
      pixels[offset++] = Number(parts[i + 3] ?? 255);
    }
    const rowBytes = width * 4;
    while (offset % rowBytes !== 0 && offset < pixels.length) pixels[offset++] = 0;
  }
  if (inDump) finishDump();
  if (byRouteId.size === 0) {
    return { error: "no multi-frame CHENG_ROUTE_FRAME/CHENG_SCREENSHOT_DUMP blocks found", byRouteId };
  }
  return { byRouteId };
}

function writeRawFile(pixels, width, height, outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  const header = Buffer.alloc(8);
  header.writeUInt32LE(width, 0);
  header.writeUInt32LE(height, 4);
  writeFileSync(outPath, Buffer.concat([header, pixels]));
}

function countNonWhite(pixels) {
  let n = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] !== 255 || pixels[i + 1] !== 255 || pixels[i + 2] !== 255) n++;
  }
  return n;
}

// ── route catalog: parsed out of unimaker-one-click.mjs, not hand-copied ──

function loadRouteCatalog(oneClickScriptPath) {
  const text = readFileSync(oneClickScriptPath, "utf8");
  const marker = "const unimakerReactRouteCatalog = [";
  const start = text.indexOf(marker);
  if (start < 0) return [];
  // Balanced-bracket scan from the '[' right after the marker to its matching ']', so this
  // survives reformatting/reordering of the source array without needing a hardcoded line count.
  const openIdx = start + marker.length - 1;
  let depth = 0;
  let end = -1;
  for (let i = openIdx; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return [];
  const body = text.slice(openIdx, end + 1);
  const ids = [];
  const seen = new Set();
  const re = /routeId:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); ids.push(m[1]); }
  }
  return ids;
}

// ── reporting ──

function writeIncrementalReport() {
  const summary = buildSummary(results);
  const report = {
    schema: "unimaker.headless_route_capture.v1",
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    viewport: `${VIEWPORT_W}x${VIEWPORT_H}`,
    routeCatalogSource: oneClickScript,
    routeCatalogCount: routeCatalog.length,
    goldenDir,
    updateGolden: options.updateGolden,
    fixtureSnapshot: options.fixtureSnapshot,
    multiFrame: useMultiFrame,
    requestedRoutes: routes,
    routes: results,
    summary,
    allPassed: summary.allPassed,
  };
  writeFileSync(join(outDir, "unimaker-headless-route-capture.report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
}

function buildSummary(rs) {
  const pass = rs.filter((r) => r.status === "pass");
  const fail = rs.filter((r) => r.status === "fail");
  const baseline = rs.filter((r) => r.status === "baseline_created");
  const error = rs.filter((r) => r.status === "error");
  const worstFailures = [...fail].sort((a, b) => b.pixelDiffPercent - a.pixelDiffPercent).slice(0, 10);
  return {
    routeCount: rs.length,
    passCount: pass.length,
    failCount: fail.length,
    baselineCreatedCount: baseline.length,
    errorCount: error.length,
    worstFailures,
    allPassed: error.length === 0 && fail.length === 0 && rs.length > 0,
  };
}

function describeResult(r) {
  if (r.status === "pass") return `PASS diffPixels=${r.diffPixels}/${r.totalPixels}`;
  if (r.status === "fail") return `FAIL diffPixels=${r.diffPixels}/${r.totalPixels} (${r.pixelDiffPercent.toFixed(4)}%)`;
  if (r.status === "baseline_created") return `BASELINE_CREATED (${r.reason})`;
  return `ERROR ${r.reason}`;
}

// ── CLI plumbing ──

function resolveRoutes(spec, catalog) {
  const trimmed = String(spec ?? "all").trim();
  if (trimmed === "" || trimmed === "all") return [...catalog];
  const requested = trimmed.split(",").map((r) => r.trim()).filter(Boolean);
  const catalogSet = new Set(catalog);
  const unknown = requested.filter((r) => !catalogSet.has(r));
  if (unknown.length > 0) fail(`--routes contains routes not in the parsed catalog: ${unknown.join(", ")}`);
  const seen = new Set();
  const out = [];
  for (const r of requested) { if (!seen.has(r)) { seen.add(r); out.push(r); } }
  return out;
}

function parseArgs(args) {
  const parsed = {
    routes: "all",
    outDir: "",
    goldenDir: "",
    updateGolden: false,
    fixtureSnapshot: defaultFixtureSnapshot,
    cheng: "",
    multiFrame: true,
    passDiffPixels: 0,
    glyphTimeoutMs: 900000,
    // Measured 2026-07-14: the default UniMaker project embeds all 46/47 routes into every
    // one-click compile regardless of which route is --mobile-scene-initial-route (only a
    // handful of compile-time constants differ), producing a ~230MB generated Cheng source.
    // A single `--emit:obj` pass on that source ran ≥900s (compiler_csg_typed_ir stage trace
    // still progressing, not stuck) before timing out under shared-machine contention; give it
    // real headroom rather than a short default that just produces a misleading "error" route.
    compileTimeoutMs: 2700000,
    runTimeoutMs: 120000,
    oneClickTimeoutMs: 3000000,
    keepGlyphSdfPrecomputeDebug: false,
    injectTestRegression: "",
    help: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => { i += 1; if (i >= args.length) fail(`missing value for ${arg}`); return args[i]; };
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--routes") parsed.routes = next();
    else if (arg === "--multi-frame") parsed.multiFrame = true;
    else if (arg === "--no-multi-frame") parsed.multiFrame = false;
    else if (arg === "--out-dir") parsed.outDir = next();
    else if (arg === "--golden-dir") parsed.goldenDir = next();
    else if (arg === "--update-golden") parsed.updateGolden = true;
    else if (arg === "--fixture-snapshot") parsed.fixtureSnapshot = resolvePath(next());
    else if (arg === "--cheng") parsed.cheng = resolvePath(next());
    else if (arg === "--pass-diff-pixels") parsed.passDiffPixels = nonNegativeInteger(next(), arg);
    else if (arg === "--glyph-timeout-ms") parsed.glyphTimeoutMs = positiveInteger(next(), arg);
    else if (arg === "--compile-timeout-ms") parsed.compileTimeoutMs = positiveInteger(next(), arg);
    else if (arg === "--run-timeout-ms") parsed.runTimeoutMs = positiveInteger(next(), arg);
    else if (arg === "--one-click-timeout-ms") parsed.oneClickTimeoutMs = positiveInteger(next(), arg);
    else if (arg === "--keep-glyph-sdf-precompute-debug") parsed.keepGlyphSdfPrecomputeDebug = true;
    else if (arg === "--inject-test-regression") parsed.injectTestRegression = next();
    else fail(`unknown argument: ${arg}`);
  }
  return parsed;
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(`${name} must be a positive integer`);
  return parsed;
}

function nonNegativeInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) fail(`${name} must be a non-negative integer`);
  return parsed;
}

function resolvePath(value) {
  if (!value) return value;
  return resolve(process.cwd(), value);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function numberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function describeError(err, stderrPath) {
  const parts = [err?.message || String(err)];
  if (stderrPath && existsSync(stderrPath)) {
    try {
      const stderrText = readFileSync(stderrPath, "utf8").trim();
      if (stderrText) parts.push(stderrText.split(/\r?\n/).slice(-5).join(" | "));
    } catch {
      // best-effort only
    }
  }
  return parts.join(" :: ");
}

function fail(message) {
  process.stderr.write(`unimaker-headless-route-capture: ${message}\n`);
  process.exit(1);
}

function helpText() {
  return `unimaker-headless-route-capture — headless (no device, no browser) 46-route pixel capture + self-consistency oracle gate.

Usage:
  node scripts/unimaker-headless-route-capture.mjs [options]

Options:
  --routes all|<csv>              Routes to run (default: all routes parsed from unimaker-one-click.mjs)
  --multi-frame                   One compile + multi-route dump when >1 route (default ON)
  --no-multi-frame                Force per-route recompile path even for multi-route runs
  --out-dir <dir>                 Output dir (default tmp/unimaker-headless-route-capture-<ts>)
  --golden-dir <dir>               Golden raw frame dir (default scripts/unimaker-fixtures/headless-route-golden)
  --update-golden                  (Re)write the golden baseline from this run's captures
  --fixture-snapshot <path>        --mobile-content-snapshot-file passed through to one-click
  --cheng <path>                   Cheng backend driver path passed through to one-click
  --pass-diff-pixels <n>           Max diffPixels still counted as pass (default: 0 = byte-exact)
  --glyph-timeout-ms <ms>          one-click --glyph-sdf-precompute-timeout-ms (default 900000)
  --compile-timeout-ms <ms>        one-click --compile-timeout-ms (default 2700000 = 45min; the
                                    default UniMaker project embeds all 46/47 routes into every
                                    compile, ~230MB generated source, measured >=900s per route)
  --run-timeout-ms <ms>            one-click --run-timeout-ms (default 120000)
  --one-click-timeout-ms <ms>      wall timeout for the whole one-click child process (default 3000000)
  --keep-glyph-sdf-precompute-debug
  --inject-test-regression <route> Positive control: flip 1 pixel in <route>'s captured frame and
                                    assert the oracle still reports it (must have been captured this run)

Exit code 0 only when every route is pass (byte-exact vs golden, or within --pass-diff-pixels) and,
if requested, the positive control is caught. baseline_created routes do NOT count as failures but
also are not a green "pass" — rerun once a golden exists to get a real signal.
`;
}
