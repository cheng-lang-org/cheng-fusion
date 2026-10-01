#!/usr/bin/env node
/**
 * run-pixel-oracle.mjs — Run pixel oracle comparison for non-white surfaces
 *
 * Usage: node scripts/run-pixel-oracle.mjs
 *   --matrix-dir  <dir>   Matrix directory (default: latest)
 *   --port        <n>     React dev server port (default: 45217)
 *   --limit       <n>     Limit surfaces processed (default: all 26)
 *   --puppeteer-only      Skip oracle step, only capture React screenshots
 */

import {
  createReadStream, existsSync, mkdirSync, writeFileSync,
  readdirSync, readFileSync,
} from "node:fs";
import { mkdtempSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { spawnSync, spawn } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const projectRoot = "/Users/lbcheng/UniMaker/React.js";

// Route map (same as pixel-oracle-matrix.mjs)
const SURFACE_ROUTE_MAP = new Map([
  ["app/components/LanguageSelector.tsx",              { route: "lang_select",            label: "LanguageSelector" }],
  ["app/components/PublishTypeSelector.tsx",           { route: "publish_selector",       label: "PublishTypeSelector" }],
  ["app/components/AppMarketplace.tsx",                { route: "marketplace_main",       label: "AppMarketplace" }],
  ["app/components/HomePage.tsx",                      { route: "home_default",           label: "HomePage" }],
  ["app/components/UpdateCenterPage.tsx",              { route: "update_center_main",     label: "UpdateCenter" }],
  ["app/components/TradingOrderBook.tsx",              { route: "trading_main",           label: "TradingOrderBook" }],
  ["app/components/TradingWallet.tsx",                 { route: "trading_main",           label: "TradingWallet" }],
  ["app/components/EcomProductDetailPage.tsx",         { route: "ecom_main",              label: "EcomProductDetail" }],
  ["app/components/FortuneResultModal.tsx",            { route: "home_bazi_overlay_open", label: "FortuneResult" }],
  ["app/components/astrology/AstrologyGuideCards.tsx", { route: "home_bazi_overlay_open", label: "AstrologyGuide" }],
  ["app/bazi-main.tsx",                                { route: "home_bazi_overlay_open", label: "BaziMain" }],
  ["app/components/ContentCard.tsx",                   { route: "tab_nodes",              label: "ContentCard" }],
  ["app/components/NodesPage.tsx",                     { route: "tab_nodes",              label: "NodesPage" }],
  ["app/components/ChannelManager.tsx",                { route: "tab_nodes",              label: "ChannelManager" }],
  ["app/components/PublishModal.tsx",                  { route: "publish_content",        label: "PublishModal" }],
  ["app/components/PublishVideoWizard.tsx",            { route: "publish_content",        label: "PublishVideoWizard" }],
  ["app/components/PublishProductWizard.tsx",          { route: "publish_product",        label: "PublishProductWizard" }],
  ["app/components/PaymentConfigSection.tsx",          { route: "publish_content",        label: "PaymentConfig" }],
  ["app/components/ByopReviewConsole.tsx",             { route: "publish_content",        label: "ByopReviewConsole" }],
  ["app/components/DouDiZhuPage.tsx",                  { route: "game_doudizhu",          label: "DouDiZhu" }],
  ["app/components/AddressManager.tsx",                { route: "home_default",           label: "AddressManager" }],
  ["app/components/Sidebar.tsx",                       { route: "home_default",           label: "Sidebar" }],
  ["app/components/TransactionHistory.tsx",            { route: "home_default",           label: "TransactionHistory" }],
]);

// CLI args
const args = process.argv.slice(2);
const matrixDir = resolveArg("--matrix-dir") || findLatestMatrixDir();
const port = intArg("--port") || 45217;
const outDir = resolveArg("--out-dir") || join(packageDir, "tmp", `unimaker-matrix-oracle-${Date.now()}`);
const limit = intArg("--limit") || Infinity;
const puppeteerOnly = args.includes("--puppeteer-only");

if (!matrixDir || !existsSync(matrixDir)) {
  process.stderr.write(`error: matrix dir not found: ${matrixDir}\n`);
  process.exit(1);
}

mkdirSync(join(outDir, "cheng"), { recursive: true });
mkdirSync(join(outDir, "screenshots"), { recursive: true });

// Load report
const reportJson = join(matrixDir, "gui-matrix.report.json");
const reportData = JSON.parse(readFileSync(reportJson, "utf8"));

// The 26 non-white surface names
const NON_WHITE_NAMES = new Set([
  "001_component_anonymous_app_App.tsx",
  "002_component_anonymous_app_components_AppMarketplace.tsx",
  "003_component_anonymous_app_components_EcomProductDetailPage.tsx",
  "004_component_anonymous_app_components_ProductDetailPage.tsx",
  "005_component_anonymous_app_components_PublishProductWizard.tsx",
  "011_component_AddressManager_app_components_AddressManager.tsx",
  "013_component_AlertDialogContent_app_components_ui_alert-dialog.tsx",
  "015_component_AstrologyDailyGuideCard_app_components_astrology_AstrologyGuideCards.tsx",
  "016_component_AstrologyStandaloneApp_app_astrology-main.tsx",
  "019_component_bazi-main_app_bazi-main.tsx",
  "020_component_BreadcrumbEllipsis_app_components_ui_breadcrumb.tsx",
  "021_component_Button_app_components_ui_button.tsx",
  "022_component_ByopReviewConsole_app_components_ByopReviewConsole.tsx",
  "025_component_CarouselPrevious_app_components_ui_carousel.tsx",
  "026_component_ChannelManager_app_components_ChannelManager.tsx",
  "030_component_CommandDialog_app_components_ui_command.tsx",
  "031_component_ContentCardInner_app_components_ContentCard.tsx",
  "032_component_ContentPublishProgressOverlay_app_components_ContentPublishProgressOverlay.tsx",
  "034_component_DialogContent_app_components_ui_dialog.tsx",
  "035_component_DrawerContent_app_components_ui_drawer.tsx",
  "037_component_FatalBootScreen_app_main.tsx",
  "038_component_FortuneResultModal_app_components_FortuneResultModal.tsx",
  "041_component_ImageWithFallback_app_components_figma_ImageWithFallback.tsx",
  "043_component_InputOTPSlot_app_components_ui_input-otp.tsx",
  "049_component_NavigationMenuTrigger_app_components_ui_navigation-menu.tsx",
  "050_component_NodeDetail_app_components_NodesPage.tsx",
]);

// Collect surfaces
const surfaces = [];
for (const r of reportData.results) {
  if (r.status !== "ok" && r.status !== "run") continue;
  const dirName = r.source.split("/").slice(-2, -1)[0];
  if (!NON_WHITE_NAMES.has(dirName)) continue;

  const runfile = join(matrixDir, dirName, "surface.run.stdout.txt");
  if (!existsSync(runfile)) continue;

  const { totalPixels, nonWhitePixels, pixelData } = await extractPixelStats(runfile, 1024, 768);
  if (nonWhitePixels === 0) continue;

  const rootSource = r.rootSource || "";
  const shortName = rootSource ? rootSource.split("/").pop().replace(".tsx", "") : dirName;

  const routeEntry = SURFACE_ROUTE_MAP.get(rootSource) ||
    SURFACE_ROUTE_MAP.get(`app/components/${shortName}.tsx`) ||
    SURFACE_ROUTE_MAP.get(`app/${shortName}.tsx`) ||
    null;

  surfaces.push({
    dirName,
    rootSource,
    shortName,
    totalPixels,
    nonWhitePixels,
    pct: totalPixels > 0 ? (nonWhitePixels * 100 / totalPixels) : 0,
    routeEntry,
    hasReactRoute: routeEntry !== null,
    pixelData,
  });
}

surfaces.sort((a, b) => b.nonWhitePixels - a.nonWhitePixels);

process.stderr.write(`\n=== Pixel Oracle Runner ===\n`);
process.stderr.write(`matrix: ${matrixDir}\n`);
process.stderr.write(`non-white surfaces: ${surfaces.length}\n`);
process.stderr.write(`has React route: ${surfaces.filter(s => s.hasReactRoute).length}\n`);
process.stderr.write(`output: ${outDir}\n\n`);

const limited = surfaces.slice(0, limit);

if (limited.length === 0) {
  process.stderr.write("No surfaces to process.\n");
  process.exit(0);
}

process.stderr.write(`Processing ${limited.length} surfaces...\n\n`);

// Step 1: Start React dev server
process.stderr.write(`[1] Starting React dev server on port ${port}...\n`);
const reactUrl = `http://127.0.0.1:${port}`;
let reactServer;
try {
  const child = spawn("npm", [
    "run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort",
  ], {
    cwd: projectRoot,
    env: { ...process.env, BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  child.stdout.resume();
  child.stderr.resume();
  reactServer = child;
  await waitForHttp(`${reactUrl}/`, 60000);
  process.stderr.write(`[1] React dev server ready\n`);
} catch (err) {
  process.stderr.write(`error: React dev server failed: ${err.message}\n`);
  process.exit(1);
}

// Step 2: Launch Puppeteer
process.stderr.write(`[2] Launching Puppeteer...\n`);
const puppeteer = (await import("puppeteer")).default;
const sharp = (await import("sharp")).default;
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-setuid-sandbox"],
});
const viewportW = 1024;
const viewportH = 768;

// Step 3: Generate PNG for all surfaces first
process.stderr.write(`[3] Generating Cheng PNG files...\n`);
const pngDir = join(outDir, "cheng");
for (const s of limited) {
  if (!s.pixelData) continue;
  const pngPath = join(pngDir, `${s.dirName}.png`);
  try {
    const img = sharp(s.pixelData, { raw: { width: viewportW, height: viewportH, channels: 4 } });
    await img.png().toFile(pngPath);
    process.stderr.write(`  PNG ${s.dirName}\n`);
  } catch (err) {
    process.stderr.write(`  PNG ERR ${s.dirName}: ${err.message}\n`);
  }
}

// Step 4-5: Process each surface
const results = [];
let passed = 0;
let failed = 0;
let skipped = 0;

for (let i = 0; i < limited.length; i++) {
  const s = limited[i];
  const surfaceOutDir = join(outDir, "screenshots", s.dirName);
  mkdirSync(surfaceOutDir, { recursive: true });

  const chengRawPath = join(surfaceOutDir, "screenshot_cheng.raw");
  const chromeRawPath = join(surfaceOutDir, "screenshot_chrome.raw");
  const chromePngPath = join(surfaceOutDir, "screenshot_chrome.png");
  const oracleReportPath = join(surfaceOutDir, "pixel-oracle.report.json");
  const chengPngPath = join(surfaceOutDir, "screenshot_cheng.png");

  const label = s.routeEntry?.label || s.shortName;
  process.stderr.write(`\n[${i + 1}/${limited.length}] ${label} (${s.nonWhitePixels}/${s.totalPixels} non-white, ${s.pct.toFixed(2)}%)\n`);

  // Write Cheng raw
  writeChengRaw(s.pixelData, viewportW, viewportH, chengRawPath);

  // Also write Cheng PNG in surface dir
  if (s.pixelData) {
    const img = sharp(s.pixelData, { raw: { width: viewportW, height: viewportH, channels: 4 } });
    await img.png().toFile(chengPngPath);
  }

  // Capture React screenshot
  if (s.hasReactRoute) {
    const pageUrl = `${reactUrl}/?r2c_truth=1&r2c_route=${s.routeEntry.route}`;
    try {
      await captureReactScreenshot(browser, pageUrl, viewportW, viewportH, chromeRawPath, chromePngPath);
      process.stderr.write(`  React: ${pageUrl}\n`);
    } catch (err) {
      process.stderr.write(`  React capture FAILED: ${err.message}\n`);
      results.push({
        label, route: s.routeEntry.route, rootSource: s.rootSource,
        nonWhitePct: s.pct, nonWhitePixels: s.nonWhitePixels,
        matchRate: null, diffPixels: null, error: err.message, status: "REACT_FAIL",
      });
      failed++;
      continue;
    }
  } else {
    process.stderr.write(`  React: no route mapping — skipped\n`);
    results.push({
      label, route: null, rootSource: s.rootSource,
      nonWhitePct: s.pct, nonWhitePixels: s.nonWhitePixels,
      matchRate: null, diffPixels: null, status: "SKIP",
    });
    skipped++;
    continue;
  }

  // Run oracle comparison (handle non-zero exit)
  process.stderr.write(`  Running oracle comparison...\n`);
  const oracleResult = runOracleComparison(
    repoRoot, chengRawPath, chromeRawPath, viewportW, viewportH, oracleReportPath,
  );

  if (oracleResult.success) {
    const ms = oracleResult.report.screenshotDiff;
    const matchRate = ms.totalPixels > 0
      ? ((ms.totalPixels - ms.diffPixels) / ms.totalPixels) * 100
      : 0;
    const status = matchRate >= 95 ? "PASS" : "FAIL";
    process.stderr.write(`  Oracle: ${matchRate.toFixed(2)}% match (${ms.diffPixels}/${ms.totalPixels} diff)\n`);
    if (status === "PASS") passed++;
    else failed++;
    results.push({
      label, route: s.routeEntry.route, rootSource: s.rootSource,
      nonWhitePct: s.pct, nonWhitePixels: s.nonWhitePixels,
      matchRate: parseFloat(matchRate.toFixed(2)), diffPixels: ms.diffPixels,
      totalPixels: ms.totalPixels, maxPixelDiff: ms.maxPixelDiff,
      oraclePassed: ms.passed, status,
    });
  } else {
    process.stderr.write(`  Oracle failed: ${oracleResult.error}\n`);
    results.push({
      label, route: s.routeEntry.route, rootSource: s.rootSource,
      nonWhitePct: s.pct, nonWhitePixels: s.nonWhitePixels,
      matchRate: null, diffPixels: null, error: oracleResult.error,
      status: "ORACLE_ERR",
    });
    failed++;
  }
}

// Shutdown
await browser.close();
if (reactServer) {
  try { process.kill(-reactServer.pid, "SIGTERM"); } catch {}
}

// Write summary
const summary = {
  timestamp: new Date().toISOString(),
  matrixDir, outDir, threshold: 95,
  totalSurfaces: limited.length, passed, failed,
  results,
};
const summaryPath = join(outDir, "matrix-oracle-summary.json");
writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

process.stderr.write(`\n=== Oracle Complete ===\n`);
process.stderr.write(`surfaces: ${limited.length}  passed: ${passed}  failed: ${failed}  skipped: ${skipped}\n`);
process.stderr.write(`summary: ${summaryPath}\n\n`);

// Print results table
process.stdout.write(`\nstatus\tmatch%\tnon-white%\tlabel\trootSource\treroute\n`);
for (const r of results) {
  const matchStr = r.matchRate !== null ? r.matchRate.toFixed(2) + "%" : "N/A";
  const routeStr = r.route || "N/A";
  process.stdout.write(`${r.status}\t${matchStr}\t${r.nonWhitePct.toFixed(2)}%\t${r.label}\t${r.rootSource}\t${routeStr}\n`);
}

// ── Helpers ──

async function extractPixelStats(filePath, width, height) {
  const lines = createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity });
  const pixels = Buffer.alloc(width * height * 4);
  let totalPixels = 0;
  let nonWhitePixels = 0;
  let offset = 0;
  let rows = 0;
  let inDump = false;
  let found = false;

  for await (const line of lines) {
    if (line === "---CHENG_SCREENSHOT_DUMP---") {
      inDump = true;
      continue;
    }
    if (line === "---CHENG_DUMP_END---") break;
    if (!inDump || !line.startsWith("row: ")) continue;

    found = true;
    const parts = line.slice("row: ".length).split(",");
    const numVals = Math.min(parts.length, width * 4);

    for (let i = 0; i < numVals; i += 4) {
      const r = Number(parts[i]);
      const g = Number(parts[i + 1]);
      const b = Number(parts[i + 2]);
      const a = Number(parts[i + 3] ?? 255);
      totalPixels++;
      if (r !== 255 || g !== 255 || b !== 255) {
        nonWhitePixels++;
      }
      pixels[offset++] = r;
      pixels[offset++] = g;
      pixels[offset++] = b;
      pixels[offset++] = a;
    }
    // Pad remaining
    const expectedBytes = width * 4;
    while (offset % expectedBytes !== 0 && offset < pixels.length) {
      pixels[offset++] = 0;
    }
    rows += 1;
  }

  while (rows > 0 && offset < pixels.length) {
    pixels[offset++] = 0;
  }

  if (!found) {
    return { totalPixels: 0, nonWhitePixels: 0, pixelData: null, parseError: "no pixel dump found" };
  }

  return { totalPixels, nonWhitePixels, pixelData: pixels, parseError: null };
}

function writeChengRaw(pixels, width, height, outPath) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(width, 0);
  header.writeUInt32LE(height, 4);
  writeFileSync(outPath, Buffer.concat([header, pixels]));
}

async function captureReactScreenshot(browser, url, width, height, rawPath, pngPath) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 1500));
    const png = await page.screenshot({ type: "png", fullPage: false });
    writeFileSync(pngPath, png);

    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== width || info.height !== height) {
      throw new Error(`React screenshot size mismatch: expected ${width}x${height}, got ${info.width}x${info.height}`);
    }
    const header = Buffer.alloc(8);
    header.writeUInt32LE(width, 0);
    header.writeUInt32LE(height, 4);
    writeFileSync(rawPath, Buffer.concat([header, data]));
  } finally {
    await page.close();
  }
}

function runOracleComparison(cwd, chengRaw, chromeRaw, width, height, reportPath) {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      join(cwd, "tools", "cheng-web-oracle.ts"),
      "--cheng-screenshot", chengRaw,
      "--chrome-screenshot", chromeRaw,
      "--viewport", `${width}x${height}`,
      "--format", "json",
      "--threshold", "95",
      "--out", reportPath,
    ],
    { cwd, encoding: "utf8", timeout: 60000, maxBuffer: 32 * 1024 * 1024 },
  );

  // Read report regardless of exit code
  if (existsSync(reportPath)) {
    try {
      const report = JSON.parse(readFileSync(reportPath, "utf8"));
      if (report.screenshotDiff) {
        return { success: true, report };
      }
      return { success: false, error: "no screenshotDiff in report", report };
    } catch (err) {
      return { success: false, error: `parse error: ${err.message}` };
    }
  }

  return { success: false, error: "no report file generated", stderr: result.stderr };
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`HTTP timeout: ${url}`);
}

function resolveArg(name) {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return null;
}

function intArg(name) {
  const val = resolveArg(name);
  return val ? parseInt(val, 10) : null;
}

function findLatestMatrixDir() {
  const tmpDir = join(packageDir, "tmp");
  if (!existsSync(tmpDir)) return null;
  return readdirSync(tmpDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith("unimaker-gui-matrix-"))
    .sort((a, b) => b.name.localeCompare(a.name))
    .map(d => join(tmpDir, d.name))[0] || null;
}
