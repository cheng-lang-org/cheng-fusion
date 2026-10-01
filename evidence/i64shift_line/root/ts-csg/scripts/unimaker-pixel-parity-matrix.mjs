#!/usr/bin/env node
// UniMaker per-route pixel parity matrix gate.
//
// For every requested route it drives two existing scripts as child processes and
// records the real diff numbers — nothing is fabricated or estimated:
//   1. scripts/unimaker-android-capture-run.mjs  -> on-device EGL pbuffer offscreen
//      capture of the retained scene, producing <route>.raw + capture report.
//   2. scripts/unimaker-pixel-oracle.mjs --oracle-layer retained-compositor -> compares
//      that raw against a freshly-taken puppeteer Chrome screenshot of the React PWA
//      (driven through the same r2c_truth/r2c_route query-param mapping the oracle uses).
//
// The React route mapping is NOT re-implemented here: the oracle already maps
// --react-route <route> to http://127.0.0.1:<port>/?r2c_truth=1&r2c_route=<route>, and the
// React app resolves that route in truthInitial{Tab,Overlay,App,PublishMode}. This matrix
// reuses that mapping verbatim by forwarding --react-route unchanged.
//
// Routes are processed sequentially because the adb device is a shared, single resource.
//
// ── B1 pixel-gate CJK exemption (user decision 2026-07-09; 正典 docs/cheng-pwa-1to1-remaining-work.md §2) ──
// The truth CJK typeface is 匯文明朝體. Text nodes containing Han are deliberately exempt from 1:1
// per-pixel parity (the React reference rasterises the same code points with a different hinter).
// For each compared route this gate:
//   1. reads the React ground-truth per-line text-run boxes the oracle emits (report.textNodeBoxes),
//   2. selects the boxes whose text contains ≥1 Han code point (Han判定 沿 font-subset.mjs 的
//      isHanCodePoint 口径 — single source of truth, imported by unimaker-cjk-text-mask.mjs),
//   3. masks those WHOLE boxes in BOTH raw frames at the same viewport coordinates, and
//   4. re-scores the diff with the SAME canonical oracle (tools/cheng-web-oracle.ts).
// The report prints BOTH口径: raw (unmasked) and exempted (masked). The pass line is the exempted口径;
// raw is ALWAYS printed as the fallback cross-check. Be honest about the scope: masking equalises
// the whole box, so it drops NOT just the Han glyph-rasterisation delta but everything inside an
// aligned box — mixed-run Latin/digits sharing the box, and content defects (a missing glyph, a
// wrong character, a wrong colour) too. It cannot hide geometry that escapes the box: a shifted or
// reflowed Cheng box leaves pixels outside the masked React box, which still register as diff, so an
// offset/reflow regression is not exempted. Every pixel outside all Han boxes stays under the <1%
// gate. No historical device capture existed at landing (tmp/unimaker-pixel* absent 2026-07-09);
// the mask geometry is proven by unimaker-cjk-text-mask-smoke.mjs and the real-device home_default
// rescore is hung on the next window.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "./process-runner.mjs";
import { maskRawFile, selectCjkBoxes } from "./unimaker-cjk-text-mask.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const webOracleScript = join(repoRoot, "tools", "cheng-web-oracle.ts");

const captureScript = join(scriptDir, "unimaker-android-capture-run.mjs");
const oracleScript = join(scriptDir, "unimaker-pixel-oracle.mjs");

const DEFAULT_APK_BUILD_SUMMARY = join(packageDir, "tmp", "unimaker-apk-functional-current", "unimaker-apk-build.summary.json");
const DEFAULT_RETAINED_GATE_REPORT = join(packageDir, "tmp", "unimaker-retained-gate-functional-current", "unimaker-retained-parity-gate.report.json");
const DEFAULT_ROUTE_REACHABILITY = join(packageDir, "tmp", "unimaker-retained-gate-functional-current", "unimaker-react.route-reachability.json");

const PASS_DIFF_PERCENT = 1.0; // pixelDiffPercent < 1% counts as a pass, per the parity gate contract.

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(helpText());
  process.exit(0);
}

const outDir = resolvePath(options.outDir || join(packageDir, "tmp", `pixel-parity-matrix-${Date.now()}`));
mkdirSync(outDir, { recursive: true });
const reportPath = join(outDir, "pixel-parity-matrix.report.json");

const apkBuildSummary = resolvePath(options.apkBuildSummary);
const retainedGateReport = resolvePath(options.retainedGateReport);
const routeReachabilityPath = resolvePath(options.routeReachability);

requireReadableFile(apkBuildSummary, "APK build summary");
requireReadableFile(retainedGateReport, "retained parity gate report");
requireReadableFile(routeReachabilityPath, "route reachability inventory");

const apkSummary = readJson(apkBuildSummary);
if (apkSummary?.schema !== "unimaker.apk_build.v1") {
  fail(`unexpected APK build summary schema: ${apkSummary?.schema ?? "missing"}`);
}
const gateReport = readJson(retainedGateReport);
if (gateReport?.schema !== "unimaker.retained_parity_gate.v1") {
  fail(`unexpected retained gate report schema: ${gateReport?.schema ?? "missing"}`);
}
const reachability = readJson(routeReachabilityPath);
const knownRoutes = Array.isArray(reachability?.reachableRoutes) ? reachability.reachableRoutes : [];
if (knownRoutes.length === 0) fail(`route reachability inventory has no reachableRoutes: ${routeReachabilityPath}`);
const knownRouteSet = new Set(knownRoutes);

const routes = resolveRoutes(options.routes, knownRoutes, knownRouteSet);
const skipSet = new Set(options.skip);
for (const route of skipSet) {
  if (!knownRouteSet.has(route)) fail(`--skip route not in reachability inventory: ${route}`);
}

const startedAt = Date.now();
const results = [];

for (const routeId of routes) {
  if (skipSet.has(routeId)) {
    process.stdout.write(`[skip] ${routeId} (operator --skip)\n`);
    results.push(skippedResult(routeId, "operator_skip"));
    continue;
  }
  process.stdout.write(`[route] ${routeId} ...\n`);
  const result = await runRoute(routeId);
  results.push(result);
  const tag = result.status === "compared"
    ? `${result.pass ? "PASS" : "DIFF"} exempted=${result.exemptedPixelDiffPercent?.toFixed(4)}% raw=${result.rawPixelDiffPercent?.toFixed(4)}% ${describeExemption(result.cjkExemption)}`
    : `${result.status} (${result.reason})`;
  process.stdout.write(`[route] ${routeId} -> ${tag}\n`);
}

const summary = buildSummary(results);
const report = {
  schema: "unimaker.pixel_parity_matrix.v1",
  generatedAt: new Date().toISOString(),
  elapsedMs: Date.now() - startedAt,
  viewport: options.viewport,
  device: options.device || "auto",
  passDiffPercent: PASS_DIFF_PERCENT,
  gateBasis: "exempted",
  cjkExemption: "B1 gate masks 匯文明朝體 Han text-node boxes in both frames (user decision 2026-07-09, 正典 §2); raw口径 retained for reference",
  inputs: {
    apkBuildSummary,
    retainedGateReport,
    routeReachability: routeReachabilityPath,
    apk: apkSummary.apk ?? "",
  },
  requestedRoutes: routes,
  skippedRoutes: [...skipSet],
  routeReactMapping: "http://127.0.0.1:<port>/?r2c_truth=1&r2c_route=<routeId> (forwarded to unimaker-pixel-oracle.mjs --react-route)",
  routes: results,
  summary,
  allPassed: summary.allPassed,
};
writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

process.stdout.write(`\n=== pixel parity matrix ===\n`);
process.stdout.write(`gate: exempted口径 (CJK 匯文明朝體 text-node boxes masked); raw口径 printed for reference\n`);
process.stdout.write(`routes: ${summary.routeCount}  compared: ${summary.comparedCount}  passed(exempted<${PASS_DIFF_PERCENT}%): ${summary.passedCount}  skipped: ${summary.skippedCount}  failed: ${summary.failedCount}\n`);
process.stdout.write(`cjk-exemption: routesApplied=${summary.exemption.routesApplied}/${summary.comparedCount}  maskedNodes=${summary.exemption.totalMaskedNodes}  maskedPixels=${summary.exemption.totalMaskedPixels}\n`);
for (const worst of summary.worstRoutes) {
  process.stdout.write(`  worst ${worst.routeId}: exempted=${worst.exemptedPixelDiffPercent.toFixed(4)}% (${worst.exemptedDiffPixels}px) raw=${worst.rawPixelDiffPercent.toFixed(4)}% (${worst.rawDiffPixels}px) maskedNodes=${worst.maskedNodes} maskedPixels=${worst.maskedPixels}\n`);
}
process.stdout.write(`allPassed: ${summary.allPassed}\n`);
process.stdout.write(`report: ${reportPath}\n`);
process.exitCode = summary.allPassed ? 0 : 1;

async function runRoute(routeId) {
  const routeDir = join(outDir, "routes", routeId);
  const captureDir = join(routeDir, "capture");
  const oracleDir = join(routeDir, "oracle");
  mkdirSync(captureDir, { recursive: true });
  mkdirSync(oracleDir, { recursive: true });

  const capture = await captureWithRetry(routeId, captureDir);
  if (!capture.ok) {
    return failedResult(routeId, "capture_failed", { captureReportPath: capture.reportPath, error: capture.error });
  }

  const oracle = await runOracle(routeId, oracleDir, capture.reportPath);
  const record = readOracleReport(routeId, oracle.reportPath, capture);

  if (record.status === "compared") {
    const reactRaw = join(oracleDir, "react", "screenshot_react.raw");
    record.cjkExemption = await applyCjkExemption(routeDir, oracle.reportPath, capture.rawPath, reactRaw);
    finalizeExemptedRecord(record);
  }

  if (!options.keepRaw) {
    cleanupRaw(capture.rawPath);
    cleanupRaw(join(oracleDir, "react", "screenshot_react.raw"));
  }
  return record;
}

// Mask the CJK (匯文明朝體) text-node boxes in both frames and re-score with the canonical oracle.
// Returns an explicit exemption record — applied=false with a reason is reported, never silently
// swallowed. The pass line downstream uses the exempted口径; raw is always kept and printed.
async function applyCjkExemption(routeDir, oracleReportPath, chengRaw, reactRaw) {
  const inert = (reason) => ({ applied: false, reason, maskedNodes: 0, maskedPixels: 0 });
  if (!existsSync(chengRaw) || !existsSync(reactRaw)) return inert("raw_frame_missing");
  const oracleReport = readJson(oracleReportPath);
  const boxes = oracleReport?.textNodeBoxes;
  if (!Array.isArray(boxes)) return inert("no_text_node_boxes_in_oracle_report");
  // extractTextRunBoxes is defensive: any puppeteer failure — and the still-unverified real-device
  // path — returns a present-but-empty [], not a populated list. Distinguish that from "boxes exist
  // but none are Han": report it explicitly as no_text_boxes so an unwired/failed extraction cannot
  // masquerade as a silently-applied exemption. Either way applied=false and finalizeExemptedRecord
  // falls the gate back to the raw口径 for this route.
  if (boxes.length === 0) return inert("no_text_boxes");
  const cjkBoxes = selectCjkBoxes(boxes);
  if (cjkBoxes.length === 0) return inert("no_cjk_text_nodes");

  const maskDir = join(routeDir, "cjk-mask");
  mkdirSync(maskDir, { recursive: true });
  const maskedCheng = join(maskDir, "cheng.masked.raw");
  const maskedReact = join(maskDir, "react.masked.raw");
  let chengMask;
  let reactMask;
  try {
    chengMask = maskRawFile(chengRaw, cjkBoxes, maskedCheng);
    reactMask = maskRawFile(reactRaw, cjkBoxes, maskedReact);
  } catch (err) {
    // A malformed frame is surfaced as an explicit inert reason for this one route rather than
    // aborting the whole matrix run; the gate still uses this route's raw口径 unchanged.
    return inert(`mask_error:${String(err?.message ?? err)}`);
  }
  const exemptedReportPath = join(maskDir, "pixel-oracle.exempted.report.json");
  const diff = await runExemptedCompare(maskedCheng, maskedReact, exemptedReportPath);
  if (!options.keepRaw) {
    cleanupRaw(maskedCheng);
    cleanupRaw(maskedReact);
  }
  if (!diff) {
    return { applied: false, reason: "exempted_compare_unavailable", maskedNodes: cjkBoxes.length, maskedPixels: reactMask.maskedPixels };
  }
  return {
    applied: true,
    reason: "",
    maskedNodes: cjkBoxes.length,
    maskedPixels: reactMask.maskedPixels,
    chengMaskedPixels: chengMask.maskedPixels,
    pixelDiffPercent: diff.pixelDiffPercent,
    diffPixels: diff.diffPixels,
    totalPixels: diff.totalPixels,
    exemptedReportPath,
  };
}

// Re-score the masked pair with tools/cheng-web-oracle.ts — the identical algorithm that produced
// the raw口径 — so raw and exempted numbers are directly comparable. The oracle exits non-zero when
// the diff misses its strict threshold (the common case); the JSON report is still written, so the
// error is swallowed and the report is the source of truth (mirrors runOracle above).
async function runExemptedCompare(chengRaw, reactRaw, outPath) {
  try {
    await runCommand(process.execPath, [
      "--experimental-strip-types",
      webOracleScript,
      "--cheng-screenshot", chengRaw,
      "--chrome-screenshot", reactRaw,
      "--viewport", options.viewport,
      "--format", "json",
      "--out", outPath,
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: options.oracleTimeoutMs,
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    // Swallow: report presence + contents is the source of truth below.
  }
  if (!existsSync(outPath)) return null;
  const sd = readJson(outPath)?.screenshotDiff;
  if (!sd || typeof sd.pixelDiffPercent !== "number") return null;
  return {
    pixelDiffPercent: sd.pixelDiffPercent,
    diffPixels: numberOr(sd.diffPixels, 0),
    totalPixels: numberOr(sd.totalPixels, 0),
  };
}

// Promote the exempted口径 to the pass decision while preserving the raw口径 for printing.
function finalizeExemptedRecord(record) {
  const ex = record.cjkExemption;
  record.rawPixelDiffPercent = record.pixelDiffPercent;
  record.rawDiffPixels = record.diffPixels;
  record.exemptedPixelDiffPercent = ex.applied ? ex.pixelDiffPercent : record.pixelDiffPercent;
  record.exemptedDiffPixels = ex.applied ? ex.diffPixels : record.diffPixels;
  record.pass = record.exemptedPixelDiffPercent < PASS_DIFF_PERCENT;
}

async function captureWithRetry(routeId, captureDir) {
  const captureReportPath = join(captureDir, "unimaker-android-capture.report.json");
  const rawOut = join(captureDir, `cheng_${routeId}.raw`);
  const maxAttempts = 1 + options.captureRetries;
  let lastError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const args = [
      captureScript,
      "--apk-build-summary", apkBuildSummary,
      "--out-dir", captureDir,
      "--raw-out", rawOut,
      "--route-state", routeId,
      "--viewport", options.viewport,
      "--timeout-ms", String(options.captureTimeoutMs),
    ];
    if (options.device) args.push("--device", options.device);
    if (options.adb) args.push("--adb", options.adb);
    try {
      await runCommand(process.execPath, args, {
        cwd: packageDir,
        encoding: "utf8",
        timeout: options.captureTimeoutMs + 60000,
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch (err) {
      lastError = describeError(err);
    }
    const report = existsSync(captureReportPath) ? readJson(captureReportPath) : null;
    if (report?.available === true && report?.status === "ok" && report?.rawPath && existsSync(report.rawPath)) {
      return { ok: true, reportPath: captureReportPath, rawPath: report.rawPath, rawSha256: report.rawSha256 ?? "", report };
    }
    lastError = report?.error || report?.reason || lastError || "capture report not available";
    if (attempt < maxAttempts) {
      process.stdout.write(`  capture attempt ${attempt}/${maxAttempts} failed (${lastError}); retrying\n`);
    }
  }
  return { ok: false, reportPath: captureReportPath, error: lastError };
}

async function runOracle(routeId, oracleDir, captureReportPath) {
  const oracleReportPath = join(oracleDir, "pixel-oracle.report.json");
  const args = [
    oracleScript,
    "--oracle-layer", "retained-compositor",
    "--out-dir", oracleDir,
    "--viewport", options.viewport,
    "--react-route", routeId,
    "--retained-gate-report", retainedGateReport,
    "--apk-build-summary", apkBuildSummary,
    "--android-capture-report", captureReportPath,
    "--port", String(options.oraclePort),
  ];
  // The oracle exits non-zero whenever the diff misses its strict threshold, which is the
  // common case here (parity is measured, not asserted). The report is still written, so we
  // capture the error and read the report rather than treating exit code as failure.
  try {
    await runCommand(process.execPath, args, {
      cwd: packageDir,
      encoding: "utf8",
      timeout: options.oracleTimeoutMs,
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (err) {
    // Swallow: report presence + contents is the source of truth below.
    if (!existsSync(oracleReportPath)) {
      return { reportPath: oracleReportPath, error: describeError(err) };
    }
  }
  return { reportPath: oracleReportPath };
}

function readOracleReport(routeId, oracleReportPath, capture) {
  if (!existsSync(oracleReportPath)) {
    return failedResult(routeId, "oracle_no_report", { captureReportPath: capture.reportPath, rawSha256: capture.rawSha256 });
  }
  const report = readJson(oracleReportPath);
  const retained = report?.retainedCompositor ?? (report?.oracleLayer === "retained-compositor" ? report : null);
  const screenshot = report?.screenshotDiff;
  const reactPng = join(dirname(oracleReportPath), "react", "screenshot_react.png");
  if (!screenshot || typeof screenshot.pixelDiffPercent !== "number") {
    const reason = retained && retained.pixelAvailable === false
      ? `pixel_oracle_unavailable:${retained.blockedReason || "unknown"}`
      : "oracle_no_screenshot_diff";
    return failedResult(routeId, reason, {
      captureReportPath: capture.reportPath,
      oracleReportPath,
      rawSha256: capture.rawSha256,
    });
  }
  const pixelDiffPercent = screenshot.pixelDiffPercent;
  return {
    routeId,
    status: "compared",
    pass: pixelDiffPercent < PASS_DIFF_PERCENT,
    pixelDiffPercent,
    diffPixels: numberOr(screenshot.diffPixels, 0),
    totalPixels: numberOr(screenshot.totalPixels, 0),
    maxPixelDiff: numberOr(screenshot.maxPixelDiff, 0),
    matchRate: numberOr(report.avgMatchRate, null),
    rawSha256: capture.rawSha256,
    screenshotPath: existsSync(reactPng) ? reactPng : "",
    captureReportPath: capture.reportPath,
    oracleReportPath,
    reason: "",
  };
}

function buildSummary(results) {
  const compared = results.filter((r) => r.status === "compared");
  const passed = compared.filter((r) => r.pass);
  const skipped = results.filter((r) => r.status === "skipped");
  const failed = results.filter((r) => r.status === "failed");
  const worstRoutes = [...compared]
    .sort((a, b) => b.exemptedPixelDiffPercent - a.exemptedPixelDiffPercent)
    .slice(0, 5)
    .map((r) => ({
      routeId: r.routeId,
      exemptedPixelDiffPercent: r.exemptedPixelDiffPercent,
      exemptedDiffPixels: r.exemptedDiffPixels,
      rawPixelDiffPercent: r.rawPixelDiffPercent,
      rawDiffPixels: r.rawDiffPixels,
      maskedNodes: r.cjkExemption?.maskedNodes ?? 0,
      maskedPixels: r.cjkExemption?.maskedPixels ?? 0,
    }));
  const exemption = {
    routesApplied: compared.filter((r) => r.cjkExemption?.applied === true).length,
    totalMaskedNodes: compared.reduce((sum, r) => sum + (r.cjkExemption?.maskedNodes ?? 0), 0),
    totalMaskedPixels: compared.reduce((sum, r) => sum + (r.cjkExemption?.maskedPixels ?? 0), 0),
  };
  const allPassed =
    failed.length === 0 &&
    skipped.length === 0 &&
    compared.length > 0 &&
    passed.length === compared.length;
  return {
    routeCount: results.length,
    comparedCount: compared.length,
    passedCount: passed.length,
    skippedCount: skipped.length,
    failedCount: failed.length,
    worstRoutes,
    exemption,
    allPassed,
  };
}

function describeExemption(ex) {
  if (!ex) return "cjk=n/a";
  if (ex.applied) return `cjk=masked(nodes=${ex.maskedNodes},px=${ex.maskedPixels})`;
  return `cjk=inert(${ex.reason})`;
}

function skippedResult(routeId, reason) {
  return { routeId, status: "skipped", pass: false, pixelDiffPercent: null, diffPixels: 0, totalPixels: 0, matchRate: null, rawSha256: "", screenshotPath: "", reason };
}

function failedResult(routeId, reason, extra = {}) {
  return {
    routeId,
    status: "failed",
    pass: false,
    pixelDiffPercent: null,
    diffPixels: 0,
    totalPixels: 0,
    matchRate: null,
    rawSha256: extra.rawSha256 ?? "",
    screenshotPath: "",
    captureReportPath: extra.captureReportPath ?? "",
    oracleReportPath: extra.oracleReportPath ?? "",
    reason: extra.error ? `${reason}: ${extra.error}` : reason,
  };
}

function resolveRoutes(spec, knownRoutes, knownRouteSet) {
  const trimmed = String(spec ?? "all").trim();
  if (trimmed === "" || trimmed === "all") return [...knownRoutes];
  const requested = trimmed.split(",").map((r) => r.trim()).filter(Boolean);
  if (requested.length === 0) fail("--routes resolved to an empty list");
  const unknown = requested.filter((r) => !knownRouteSet.has(r));
  if (unknown.length > 0) {
    fail(`--routes contains routes not in reachability inventory: ${unknown.join(", ")}`);
  }
  return dedupe(requested);
}

function cleanupRaw(path) {
  if (path && existsSync(path)) rmSync(path, { force: true });
}

function parseArgs(args) {
  const parsed = {
    routes: "all",
    outDir: "",
    device: process.env.ANDROID_SERIAL || "",
    adb: process.env.ADB || "",
    apkBuildSummary: DEFAULT_APK_BUILD_SUMMARY,
    retainedGateReport: DEFAULT_RETAINED_GATE_REPORT,
    routeReachability: DEFAULT_ROUTE_REACHABILITY,
    viewport: "390x844",
    skip: [],
    keepRaw: false,
    oraclePort: 45217,
    captureRetries: 2,
    captureTimeoutMs: 180000,
    oracleTimeoutMs: 240000,
    help: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      i += 1;
      if (i >= args.length) fail(`missing value for ${arg}`);
      return args[i];
    };
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--routes") parsed.routes = next();
    else if (arg === "--out-dir") parsed.outDir = next();
    else if (arg === "--device") parsed.device = next();
    else if (arg === "--adb") parsed.adb = next();
    else if (arg === "--apk-build-summary") parsed.apkBuildSummary = next();
    else if (arg === "--retained-gate-report") parsed.retainedGateReport = next();
    else if (arg === "--route-reachability") parsed.routeReachability = next();
    else if (arg === "--viewport") parsed.viewport = next();
    else if (arg === "--skip") parsed.skip.push(...next().split(",").map((r) => r.trim()).filter(Boolean));
    else if (arg === "--keep-raw") parsed.keepRaw = true;
    else if (arg === "--oracle-port") parsed.oraclePort = positiveInteger(next(), arg);
    else if (arg === "--capture-retries") parsed.captureRetries = nonNegativeInteger(next(), arg);
    else if (arg === "--capture-timeout-ms") parsed.captureTimeoutMs = positiveInteger(next(), arg);
    else if (arg === "--oracle-timeout-ms") parsed.oracleTimeoutMs = positiveInteger(next(), arg);
    else fail(`unknown argument: ${arg}`);
  }
  parseViewport(parsed.viewport);
  return parsed;
}

function parseViewport(value) {
  const match = String(value).match(/^(\d+)x(\d+)$/);
  if (!match) fail(`invalid --viewport: ${value}`);
  return [Number(match[1]), Number(match[2])];
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function numberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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

function requireReadableFile(path, label) {
  if (!path || !existsSync(path)) fail(`missing ${label}: ${path}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function describeError(err) {
  if (!err) return "unknown error";
  const parts = [err.message || String(err)];
  const stderr = String(err.stderr ?? "").trim();
  if (stderr) parts.push(stderr.split(/\r?\n/).slice(-3).join(" | "));
  return parts.join(" :: ");
}

function resolvePath(value) {
  if (!value) return value;
  return resolve(process.cwd(), value);
}

function fail(message) {
  process.stderr.write(`unimaker-pixel-parity-matrix: ${message}\n`);
  process.exit(1);
}

function helpText() {
  return `Usage: node scripts/unimaker-pixel-parity-matrix.mjs [options]

Runs the retained-scene (real device) vs React PWA (Chrome) per-pixel parity oracle for
every UniMaker route and aggregates the diff numbers into one matrix report.

For each route it reuses two existing scripts unchanged:
  unimaker-android-capture-run.mjs   (on-device EGL pbuffer offscreen RGBA capture)
  unimaker-pixel-oracle.mjs          (--oracle-layer retained-compositor pixel compare)

Options:
  --routes all|<csv>            Routes to compare (default all 46 reachable routes)
  --out-dir <dir>               Output dir (default tmp/pixel-parity-matrix-<ts>)
  --device <serial>             adb serial; default ANDROID_SERIAL or sole ready device
  --adb <path>                  adb command override
  --apk-build-summary <file>    unimaker.apk_build.v1 summary (default functional-current)
  --retained-gate-report <file> unimaker.retained_parity_gate.v1 report (default functional-current)
  --route-reachability <file>   route inventory JSON providing the route list
  --viewport <WxH>              Capture/compare viewport (default 390x844)
  --skip <csv>                  Routes to record as skipped (must exist in inventory)
  --keep-raw                    Keep intermediate .raw files (default: deleted after compare)
  --oracle-port <port>          React dev server port for the oracle (default 45217)
  --capture-retries <n>         Device capture retries per route (default 2)
  --capture-timeout-ms <ms>     Per-route capture timeout (default 180000)
  --oracle-timeout-ms <ms>      Per-route oracle timeout (default 240000)

Exit code 0 only when every attempted route compared and passed (pixelDiffPercent < 1%).
`;
}
