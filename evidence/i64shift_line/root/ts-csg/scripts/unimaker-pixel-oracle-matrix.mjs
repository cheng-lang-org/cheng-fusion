#!/usr/bin/env node
/**
 * unimaker-pixel-oracle-matrix.mjs — 对 matrix 输出中非白色的 surface 执行像素对拍
 *
 * 流程:
 *   1. 从已有 matrix 目录中读取 Cheng raw pixel dump (surface.run.stdout.txt)
 *   2. 转换为 screenshot_cheng.raw (8字节头 + RGBA 像素数据)
 *   3. 在已有 React 页面上用 Puppeteer 截屏
 *   4. 用 cheng-web-oracle.ts 进行像素级对比
 *   5. 输出匹配百分比报告
 *
 * 用法:
 *   node scripts/unimaker-pixel-oracle-matrix.mjs [--matrix-dir <dir>] [--port <port>] [--out-dir <dir>] [--threshold <pct>] [--limit <N>]
 *
 * 选项:
 *   --matrix-dir   Matrix 目录 (默认: ts-csg/tmp/unimaker-gui-matrix-1780211511869)
 *   --port         React dev server 端口 (默认: 45217)
 *   --out-dir      输出目录 (默认: ts-csg/tmp/unimaker-matrix-oracle-{timestamp})
 *   --threshold    像素 passes 阈值百分比 (默认: 95)
 *   --limit        只处理前 N 个 surface (默认: 全部)
 *   --react-path   仅对比有 React 映射的 surface (默认: 全部)
 */

import {
  createReadStream, existsSync, mkdirSync, writeFileSync,
  readdirSync, readFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { runCommand, startManagedProcess } from "./process-runner.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const projectRoot = "/Users/lbcheng/UniMaker/React.js";

// ── 已知的 React 路由映射 ──
// surface 的 rootSource (或 ownerName) → { route, label }
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

// ── CLI args ──
const args = process.argv.slice(2);
const matrixDir = resolveArg("--matrix-dir") || findLatestMatrixDir();
const port = intArg("--port") || 45217;
const outDir = resolveArg("--out-dir") || join(packageDir, "tmp", `unimaker-matrix-oracle-${Date.now()}`);
const threshold = Number(resolveArg("--threshold") || "95");
const limit = intArg("--limit") || Infinity;
const reactOnly = args.includes("--react-only");

if (!matrixDir || !existsSync(matrixDir)) {
  process.stderr.write(`error: matrix dir not found: ${matrixDir}\n`);
  process.exit(1);
}

mkDir(outDir);
mkDir(join(outDir, "cheng"));
mkDir(join(outDir, "screenshots"));

// ── 读取 report.json 获取 surfaces ──
const reportJson = join(matrixDir, "gui-matrix.report.json");
const manifestJson = join(matrixDir, "gui-surfaces.manifest.json");
if (!existsSync(reportJson)) {
  process.stderr.write(`error: report not found: ${reportJson}\n`);
  process.exit(1);
}

const reportData = JSON.parse(readFileSync(reportJson, "utf8"));
const manifestData = existsSync(manifestJson) ? JSON.parse(readFileSync(manifestJson, "utf8")) : null;
const manifestSurfaces = manifestData?.surfaces ?? [];

// Build map from reportId to manifest entry
const manifestById = new Map();
for (const m of manifestSurfaces) {
  const key = `${m.ownerFunction}|${m.rootSource}`;
  manifestById.set(key, m);
}

// ── 收集非白色 surface ──
const surfaces = [];
for (const r of reportData.results) {
  if (r.status !== "ok" && r.status !== "run") continue;

  const runfile = join(matrixDir, r.source.split("/").slice(-2, -1)[0], "surface.run.stdout.txt");
  if (!existsSync(runfile)) continue;

  const { totalPixels, nonWhitePixels, pixelData, parseError } = await extractPixelStats(runfile, 1024, 768);
  if (nonWhitePixels === 0 && !parseError) continue;

  const ownerName = r.ownerName || r.id || "unknown";
  const rootSource = r.rootSource || "";
  const shortName = rootSource ? rootSource.split("/").pop().replace(".tsx", "") : ownerName;

  const manifestKey = `${r.ownerFunction}|${rootSource}`;
  const mEntry = manifestById.get(manifestKey);
  const rootTextCandidate = mEntry?.rootTextCandidate || "";

  const routeEntry = SURFACE_ROUTE_MAP.get(rootSource) ||
    SURFACE_ROUTE_MAP.get(`app/components/${shortName}.tsx`) ||
    SURFACE_ROUTE_MAP.get(`app/${shortName}.tsx`) ||
    null;

  surfaces.push({
    dirName: r.source.split("/").slice(-2, -1)[0],
    ownerName,
    shortName,
    rootSource,
    rootTextCandidate,
    totalPixels,
    nonWhitePixels,
    pct: totalPixels > 0 ? (nonWhitePixels * 100 / totalPixels) : 0,
    routeEntry,
    hasReactRoute: routeEntry !== null,
    runfile,
    pixelData,
    parseError,
  });
}

// Sort by non-white pixel count descending
surfaces.sort((a, b) => b.nonWhitePixels - a.nonWhitePixels);

process.stderr.write(`\n=== Matrix Pixel Oracle ===\n`);
process.stderr.write(`matrix: ${matrixDir}\n`);
process.stderr.write(`surfaces with non-white pixels: ${surfaces.length}\n`);
process.stderr.write(`surfaces with React route mapping: ${surfaces.filter(s => s.hasReactRoute).length}\n`);
process.stderr.write(`output: ${outDir}\n\n`);

// Filter to only surfaces with React routes if --react-only
const target = reactOnly ? surfaces.filter(s => s.hasReactRoute) : surfaces;
const limited = target.slice(0, limit);

if (limited.length === 0) {
  process.stderr.write("No surfaces to process.\n");
  process.exit(0);
}

process.stderr.write(`Processing ${limited.length} surfaces...\n\n`);

// ── Step 1: Launch React dev server ──
process.stderr.write(`[1/5] Starting React dev server on port ${port}...\n`);
const reactUrl = `http://127.0.0.1:${port}`;
let reactServer;
try {
  reactServer = startManagedProcess("npm", [
    "run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort",
  ], {
    cwd: projectRoot,
    env: { ...process.env, BROWSER: "none" },
  });
  await waitForHttp(`${reactUrl}/`, 60000);
  process.stderr.write(`[1/5] React dev server ready\n`);
} catch (err) {
  process.stderr.write(`error: React dev server failed to start: ${err.message}\n`);
  process.exit(1);
}

// ── Step 2: Initialize Puppeteer ──
process.stderr.write(`[2/5] Launching Puppeteer...\n`);
const puppeteer = (await import("puppeteer")).default;
const sharp = (await import("sharp")).default;
const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-setuid-sandbox"],
});
const viewportW = 1024;
const viewportH = 768;

// ── Step 3-5: Process each surface ──
const results = [];
let passed = 0;
let failed = 0;

for (let i = 0; i < limited.length; i++) {
  const s = limited[i];
  const surfaceOutDir = join(outDir, "screenshots", s.dirName || `surface_${i}`);
  mkDir(surfaceOutDir);
  const chengRawPath = join(surfaceOutDir, "screenshot_cheng.raw");
  const chromeRawPath = join(surfaceOutDir, "screenshot_chrome.raw");
  const chromePngPath = join(surfaceOutDir, "screenshot_chrome.png");
  const reportPath = join(surfaceOutDir, "pixel-oracle.report.json");

  const label = s.routeEntry?.label || s.shortName;
  process.stderr.write(`\n[${i + 1}/${limited.length}] ${label} (${s.nonWhitePixels}/${s.totalPixels} non-white pixels, ${s.pct.toFixed(2)}%)\n`);

  // Step 3: Write Cheng raw pixels
  writeChengRaw(s.pixelData || Buffer.alloc(0), viewportW, viewportH, chengRawPath);
  process.stderr.write(`  Cheng: ${chengRawPath}\n`);

  // Step 4: Capture React screenshot via Puppeteer
  if (s.hasReactRoute) {
    const pageUrl = `${reactUrl}/?r2c_truth=1&r2c_route=${s.routeEntry.route}`;
    try {
      await captureReactScreenshot(pageUrl, viewportW, viewportH, chromeRawPath, chromePngPath);
      process.stderr.write(`  React: ${pageUrl}\n`);
    } catch (err) {
      process.stderr.write(`  React capture FAILED: ${err.message}\n`);
      results.push({
        label,
        route: s.routeEntry.route,
        rootSource: s.rootSource,
        nonWhitePct: s.pct,
        nonWhitePixels: s.nonWhitePixels,
        matchRate: null,
        diffPixels: null,
        error: err.message,
        status: "REACT_FAIL",
      });
      failed++;
      continue;
    }
  } else {
    process.stderr.write(`  React: no route mapping — skipping React comparison\n`);
    results.push({
      label,
      route: null,
      rootSource: s.rootSource,
      nonWhitePct: s.pct,
      nonWhitePixels: s.nonWhitePixels,
      matchRate: null,
      diffPixels: null,
      note: "No React route mapping available",
      status: "SKIP",
    });
    continue;
  }

  // Step 5: Run pixel comparison via cheng-web-oracle
  try {
    const oracleOutput = await runCommand(process.execPath, [
      "--experimental-strip-types",
      join(repoRoot, "tools", "cheng-web-oracle.ts"),
      "--cheng-screenshot", chengRawPath,
      "--chrome-screenshot", chromeRawPath,
      "--viewport", `${viewportW}x${viewportH}`,
      "--format", "json",
      "--threshold", String(threshold),
      "--out", reportPath,
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 32 * 1024 * 1024,
    });

    // Read the generated report
    let report = null;
    try {
      report = JSON.parse(readFileSync(reportPath, "utf8"));
    } catch {
      // Try to parse from stdout
      const jsonMatch = oracleOutput.match(/\{[\s\S]*"screenshotDiff"[\s\S]*\}/);
      if (jsonMatch) {
        report = JSON.parse(jsonMatch[0]);
      }
    }

    if (report && report.screenshotDiff) {
      const ms = report.screenshotDiff;
      const matchRate = ms.totalPixels > 0
        ? ((ms.totalPixels - ms.diffPixels) / ms.totalPixels) * 100
        : 0;
      const status = matchRate >= threshold ? "PASS" : "FAIL";
      process.stderr.write(`  Oracle: ${matchRate.toFixed(2)}% match (${ms.diffPixels}/${ms.totalPixels} diff pixels)\n`);

      if (status === "PASS") passed++;
      else failed++;

      results.push({
        label,
        route: s.routeEntry.route,
        rootSource: s.rootSource,
        nonWhitePct: s.pct,
        nonWhitePixels: s.nonWhitePixels,
        matchRate: parseFloat(matchRate.toFixed(2)),
        diffPixels: ms.diffPixels,
        totalPixels: ms.totalPixels,
        maxPixelDiff: ms.maxPixelDiff,
        oraclePassed: ms.passed,
        status,
      });
    } else {
      process.stderr.write(`  Oracle: no screenshot diff in report\n`);
      results.push({
        label,
        route: s.routeEntry.route,
        rootSource: s.rootSource,
        nonWhitePct: s.pct,
        nonWhitePixels: s.nonWhitePixels,
        matchRate: null,
        error: "No screenshot diff in report",
        status: "ORACLE_FAIL",
      });
      failed++;
    }
  } catch (err) {
    process.stderr.write(`  Oracle FAILED: ${err.message}\n`);
    results.push({
      label,
      route: s.routeEntry.route,
      rootSource: s.rootSource,
      nonWhitePct: s.pct,
      nonWhitePixels: s.nonWhitePixels,
      matchRate: null,
      error: err.message,
      status: "ORACLE_ERR",
    });
    failed++;
  }
}

// ── Shutdown ──
await browser.close();
if (reactServer) await reactServer.stop();

// ── Summary ──
const summary = {
  timestamp: new Date().toISOString(),
  matrixDir,
  outDir,
  threshold,
  totalSurfaces: limited.length,
  passed,
  failed,
  results,
};

const summaryPath = join(outDir, "matrix-oracle-summary.json");
writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

process.stderr.write(`\n=== Oracle Matrix Complete ===\n`);
process.stderr.write(`surfaces: ${limited.length}  passed: ${passed}  failed: ${failed}\n`);
process.stderr.write(`summary: ${summaryPath}\n\n`);

process.stdout.write(`status\tmatch%\tdiff%\tlabel\n`);
for (const r of results) {
  const matchStr = r.matchRate !== null ? r.matchRate.toFixed(2) + "%" : "N/A";
  process.stdout.write(`${r.status}\t${matchStr}\t${r.nonWhitePct.toFixed(2)}%\t${r.label}\n`);
}

if (failed > 0) process.exitCode = 1;

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
    // Pad remaining bytes for this row if data is short
    const expectedBytes = width * 4;
    while (offset % expectedBytes !== 0 && offset < pixels.length) {
      pixels[offset++] = 0;
    }
    rows += 1;
  }

  // Pad remaining pixels if we got fewer rows than expected
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

async function captureReactScreenshot(url, width, height, rawPath, pngPath) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 1500)); // Extra settle time
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

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry
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

function mkDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function findLatestMatrixDir() {
  const knownDir = join(packageDir, "tmp", "unimaker-gui-matrix-1780211511869");
  if (existsSync(knownDir)) return knownDir;
  const tmpDir = join(packageDir, "tmp");
  if (!existsSync(tmpDir)) return null;
  return readdirSync(tmpDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith("unimaker-gui-matrix-"))
    .sort((a, b) => b.name.localeCompare(a.name))
    .map(d => join(tmpDir, d.name))[0] || null;
}
