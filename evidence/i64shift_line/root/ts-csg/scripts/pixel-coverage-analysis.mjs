#!/usr/bin/env node
/**
 * pixel-coverage-analysis.mjs — 对所有 surface 进行像素覆盖分析
 *
 * 输出:
 *   - 每个 surface 的非白色像素覆盖率
 *   - React 路由映射的 surface 的 oracle 匹配结果
 *   - 无路由映射的 surface 的非白色覆盖信息
 *   - 综合报告输出到 /tmp/pixel-oracle-report.json
 */

import {
  createReadStream, existsSync, mkdirSync, writeFileSync,
  readdirSync, readFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");

// ── 参数 ──
const MATRIX_DIR = resolveArg("--matrix-dir") ||
  "/Users/lbcheng/cheng-lang/ts-csg/tmp/unimaker-gui-matrix-1780235474406";
const WIDTH = 1024;
const HEIGHT = 768;
const TOTAL_PIXELS = WIDTH * HEIGHT;

// ── React 路由映射（来自 unimaker-pixel-oracle-matrix.mjs）──
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

// 用于 label 的短名映射
const SHORT_LABEL_MAP = new Map([
  ["app/App.tsx", "App"],
  ["app/components/AppMarketplace.tsx", "AppMarketplace"],
  ["app/components/EcomProductDetailPage.tsx", "EcomProductDetail"],
  ["app/components/ProductDetailPage.tsx", "ProductDetailPage"],
  ["app/components/PublishProductWizard.tsx", "PublishProductWizard"],
  ["app/components/ui/form.tsx", "Form"],
  ["app/components/ui/sonner.tsx", "Sonner"],
  ["app/games/minecraft/components/Cube.tsx", "MinecraftCube"],
  ["app/games/minecraft/components/Ground.tsx", "MinecraftGround"],
  ["app/components/ui/accordion.tsx", "AccordionTrigger"],
  ["app/components/AddressManager.tsx", "AddressManager"],
  ["app/components/ui/alert.tsx", "Alert"],
  ["app/components/ui/alert-dialog.tsx", "AlertDialog"],
  ["app/components/ui/aspect-ratio.tsx", "AspectRatio"],
  ["app/components/astrology/AstrologyGuideCards.tsx", "AstrologyGuide"],
  ["app/astrology-main.tsx", "AstrologyApp"],
  ["app/components/ui/avatar.tsx", "Avatar"],
  ["app/components/ui/badge.tsx", "Badge"],
  ["app/bazi-main.tsx", "BaziMain"],
  ["app/components/ui/breadcrumb.tsx", "Breadcrumb"],
  ["app/components/ui/button.tsx", "Button"],
  ["app/components/ByopReviewConsole.tsx", "ByopReviewConsole"],
  ["app/components/ui/calendar.tsx", "Calendar"],
  ["app/components/ui/card.tsx", "Card"],
  ["app/components/ui/carousel.tsx", "Carousel"],
  ["app/components/ChannelManager.tsx", "ChannelManager"],
  ["app/components/ui/chart.tsx", "Chart"],
  ["app/components/ui/checkbox.tsx", "Checkbox"],
  ["app/components/ui/collapsible.tsx", "Collapsible"],
  ["app/components/ui/command.tsx", "Command"],
  ["app/components/ContentCard.tsx", "ContentCard"],
  ["app/components/ContentPublishProgressOverlay.tsx", "PublishProgress"],
  ["app/components/ui/context-menu.tsx", "ContextMenu"],
  ["app/components/ui/dialog.tsx", "Dialog"],
  ["app/components/ui/drawer.tsx", "Drawer"],
  ["app/components/ui/dropdown-menu.tsx", "DropdownMenu"],
  ["app/main.tsx", "FatalBootScreen"],
  ["app/components/FortuneResultModal.tsx", "FortuneResult"],
  ["app/game-ui/GameShell.tsx", "GameShell"],
  ["app/components/ui/hover-card.tsx", "HoverCard"],
  ["app/components/figma/ImageWithFallback.tsx", "ImageWithFallback"],
  ["app/components/ui/input.tsx", "Input"],
  ["app/components/ui/input-otp.tsx", "InputOTP"],
  ["app/components/ui/label.tsx", "Label"],
  ["app/components/LanguageSelector.tsx", "LanguageSelector"],
  ["app/components/LicensePlateInput.tsx", "LicensePlateInput"],
  ["app/i18n/LocaleContext.tsx", "LocaleProvider"],
  ["app/components/ui/menubar.tsx", "Menubar"],
  ["app/components/ui/navigation-menu.tsx", "NavigationMenu"],
  ["app/components/NodesPage.tsx", "NodesPage"],
]);

// ── 已存在的 oracle 结果（来自前一轮 25 surface 的 oracle 运行）──
const PREVIOUS_ORACLE_RESULTS_MAP = {};
try {
  const prevOracleSummary = JSON.parse(readFileSync(
    "/Users/lbcheng/cheng-lang/ts-csg/tmp/unimaker-matrix-oracle-1780232969027/matrix-oracle-summary.json", "utf8"));
  for (const r of (prevOracleSummary.results || [])) {
    if (r.matchRate !== null && r.matchRate !== undefined) {
      PREVIOUS_ORACLE_RESULTS_MAP[r.rootSource] = {
        matchRate: r.matchRate,
        diffPixels: r.diffPixels,
        totalPixels: r.totalPixels,
        maxPixelDiff: r.maxPixelDiff,
        oraclePassed: r.oraclePassed,
        status: r.status,
      };
    }
  }
} catch (e) {
  console.error("Note: no previous oracle results available");
}

if (!existsSync(MATRIX_DIR)) {
  process.stderr.write(`error: matrix dir not found: ${MATRIX_DIR}\n`);
  process.exit(1);
}

const reportFile = join(MATRIX_DIR, "gui-matrix.report.json");
const manifestFile = join(MATRIX_DIR, "gui-surfaces.manifest.json");

if (!existsSync(reportFile)) {
  process.stderr.write(`error: report file not found: ${reportFile}\n`);
  process.exit(1);
}

const reportData = JSON.parse(readFileSync(reportFile, "utf8"));
const manifestData = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : null;
const manifestSurfaces = manifestData?.surfaces ?? [];

// Build map from rootSource to manifest entry
const manifestByRoot = new Map();
for (const m of manifestSurfaces) {
  manifestByRoot.set(m.rootSource, m);
}

process.stderr.write(`\n=== Pixel Coverage Analysis ===\n`);
process.stderr.write(`matrix: ${MATRIX_DIR}\n`);
process.stderr.write(`total surfaces in report: ${reportData.results.length}\n`);

// ── 分析每个 surface ──
const surfaceResults = [];
let withPixelData = 0;
let withNonWhite = 0;

for (const r of reportData.results) {
  if (r.status !== "ok" && r.status !== "run") continue;

  // Find the directory from the source path
  const sourcePath = r.source;
  const dirName = sourcePath.split("/").slice(-2, -1)[0];
  const surfaceDir = join(MATRIX_DIR, dirName);
  const runfile = join(surfaceDir, "surface.run.stdout.txt");
  const pngFile = join(MATRIX_DIR, "png", `${dirName}.png`);

  if (!existsSync(runfile)) {
    process.stderr.write(`  SKIP ${dirName}: no run stdout\n`);
    continue;
  }

  // Extract pixel stats
  const pixelStats = await extractPixelStats(runfile, WIDTH, HEIGHT);
  withPixelData++;

  const rootSource = r.rootSource || "";
  const shortLabel = SHORT_LABEL_MAP.get(rootSource) || rootSource.split("/").pop().replace(".tsx", "");

  // Check React route mapping
  const routeEntry = SURFACE_ROUTE_MAP.get(rootSource) || null;

  // Get previous oracle results if available
  const prevOracle = PREVIOUS_ORACLE_RESULTS_MAP[rootSource] || null;

  // Calculate non-white percentage (excluding near-white background colors too)
  let nonNearWhite = 0;
  if (pixelStats.pixelData) {
    const pd = pixelStats.pixelData;
    for (let i = 0; i < pd.length; i += 4) {
      const rV = pd[i];
      const gV = pd[i + 1];
      const bV = pd[i + 2];
      // Count pixels that aren't pure white or near-white (#F9FAFB = 249,250,251)
      if (rV !== 255 || gV !== 255 || bV !== 255) {
        if (rV !== 249 || gV !== 250 || bV !== 251) {
          nonNearWhite++;
        }
      }
    }
  }

  surfaceResults.push({
    dirName,
    index: parseInt(dirName.split("_")[0]),
    shortLabel,
    rootSource,
    rootTextCandidate: r.rootTextCandidate || "",
    ownerName: r.ownerName || r.id || "unknown",
    subtreeSize: r.subtreeSize || 0,
    hasPixelData: pixelStats.pixelData !== null,
    parseError: pixelStats.parseError,
    totalPixelsRead: pixelStats.totalPixels,
    nonWhitePixels: pixelStats.nonWhitePixels,
    nonWhitePercent: pixelStats.totalPixels > 0
      ? parseFloat(((pixelStats.nonWhitePixels / pixelStats.totalPixels) * 100).toFixed(4))
      : 0,
    nonNearWhitePixels: pixelStats.totalPixels > 0 ? nonNearWhite : 0,
    nonNearWhitePercent: pixelStats.totalPixels > 0
      ? parseFloat(((nonNearWhite / pixelStats.totalPixels) * 100).toFixed(4))
      : 0,
    hasReactRoute: routeEntry !== null,
    routeLabel: routeEntry?.label || null,
    route: routeEntry?.route || null,
    hasPng: existsSync(pngFile),
    prevOracleResult: prevOracle,
  });

  if (pixelStats.nonWhitePixels > 0) withNonWhite++;
}

// Sort by index
surfaceResults.sort((a, b) => a.index - b.index);

// ── 分类统计 ──
const mappedSurfaces = surfaceResults.filter(s => s.hasReactRoute);
const unmappedSurfaces = surfaceResults.filter(s => !s.hasReactRoute);
const withOracleResults = surfaceResults.filter(s => s.prevOracleResult !== null);
const oraclePassed = withOracleResults.filter(s => s.prevOracleResult?.oraclePassed === true);
const oracleFailed = withOracleResults.filter(s => s.prevOracleResult?.oraclePassed === false);

// 计算平均 oracle 分数
let oracleSum = 0;
let oracleCount = 0;
for (const s of withOracleResults) {
  if (s.prevOracleResult.matchRate !== null) {
    oracleSum += s.prevOracleResult.matchRate;
    oracleCount++;
  }
}
const avgOracleScore = oracleCount > 0 ? parseFloat((oracleSum / oracleCount).toFixed(2)) : null;

// Best and worst oracle
const oracleRateResults = withOracleResults
  .filter(s => s.prevOracleResult.matchRate !== null)
  .sort((a, b) => b.prevOracleResult.matchRate - a.prevOracleResult.matchRate);
const bestOracle = oracleRateResults.length > 0 ? oracleRateResults[0] : null;
const worstOracle = oracleRateResults.length > 0 ? oracleRateResults[oracleRateResults.length - 1] : null;

// Best and worst by non-white coverage (among unmapped)
const unmappedByCoverage = [...unmappedSurfaces].sort((a, b) => b.nonWhitePercent - a.nonWhitePercent);
const bestCoverageUnmapped = unmappedByCoverage.length > 0 ? unmappedByCoverage[0] : null;
const worstCoverageUnmapped = unmappedByCoverage.length > 0
  ? unmappedByCoverage[unmappedByCoverage.length - 1] : null;

// ── 非白色覆盖率分布 ──
const coverageBuckets = {
  "100%": 0, "90-99%": 0, "50-89%": 0, "10-49%": 0, "1-9%": 0, "0%": 0, "error": 0,
};
for (const s of surfaceResults) {
  if (s.parseError) { coverageBuckets["error"]++; continue; }
  const pct = s.nonWhitePercent;
  if (pct === 0) coverageBuckets["0%"]++;
  else if (pct >= 100) coverageBuckets["100%"]++;
  else if (pct >= 90) coverageBuckets["90-99%"]++;
  else if (pct >= 50) coverageBuckets["50-89%"]++;
  else if (pct >= 10) coverageBuckets["10-49%"]++;
  else coverageBuckets["1-9%"]++;
}

// 非 white+249,250,251 覆盖率分布
const nearWhiteBuckets = {
  "100%": 0, "90-99%": 0, "50-89%": 0, "10-49%": 0, "1-9%": 0, "0%": 0, "error": 0,
};
for (const s of surfaceResults) {
  if (s.parseError) { nearWhiteBuckets["error"]++; continue; }
  const pct = s.nonNearWhitePercent;
  if (pct === 0) nearWhiteBuckets["0%"]++;
  else if (pct >= 100) nearWhiteBuckets["100%"]++;
  else if (pct >= 90) nearWhiteBuckets["90-99%"]++;
  else if (pct >= 50) nearWhiteBuckets["50-89%"]++;
  else if (pct >= 10) nearWhiteBuckets["10-49%"]++;
  else nearWhiteBuckets["1-9%"]++;
}

// ── 构建报告 ──
const report = {
  reportGeneratedAt: new Date().toISOString(),
  metadata: {
    matrixDir: MATRIX_DIR,
    totalSurfacesCompiled: reportData.totalSurfaces,
    selectedSurfaces: reportData.selectedSurfaces,
    matrixOk: reportData.ok,
    matrixFailed: reportData.failed,
    matrixThin: reportData.thin,
  },
  summary: {
    totalSurfaces: surfaceResults.length,
    withPixelData,
    withNonWhitePixels: withNonWhite,
    nonWhitePercentStr: withPixelData > 0
      ? parseFloat(((withNonWhite / withPixelData) * 100).toFixed(1)) + "%"
      : "0%",
    withReactRouteMapping: mappedSurfaces.length,
    withoutReactRouteMapping: unmappedSurfaces.length,
    withPreviousOracleResults: withOracleResults.length,
    oraclePassed,
    oracleFailed,
    oraclePassRate: withOracleResults.length > 0
      ? parseFloat(((oraclePassed.length / withOracleResults.length) * 100).toFixed(1))
      : null,
    averageOracleScore: avgOracleScore,
    bestOracleSurface: bestOracle ? {
      label: bestOracle.shortLabel,
      rootSource: bestOracle.rootSource,
      matchRate: bestOracle.prevOracleResult.matchRate,
    } : null,
    worstOracleSurface: worstOracle ? {
      label: worstOracle.shortLabel,
      rootSource: worstOracle.rootSource,
      matchRate: worstOracle.prevOracleResult.matchRate,
    } : null,
    highestNonWhiteCoverageUnmapped: bestCoverageUnmapped ? {
      label: bestCoverageUnmapped.shortLabel,
      rootSource: bestCoverageUnmapped.rootSource,
      nonWhitePercent: bestCoverageUnmapped.nonWhitePercent,
      nonNearWhitePercent: bestCoverageUnmapped.nonNearWhitePercent,
    } : null,
    lowestNonWhiteCoverageUnmapped: worstCoverageUnmapped ? {
      label: worstCoverageUnmapped.shortLabel,
      rootSource: worstCoverageUnmapped.rootSource,
      nonWhitePercent: worstCoverageUnmapped.nonWhitePercent,
      nonNearWhitePercent: worstCoverageUnmapped.nonNearWhitePercent,
    } : null,
  },
  coverageBuckets,
  nearWhiteExclusionBuckets: nearWhiteBuckets,
  surfaces: surfaceResults,
};

// ── 输出报告 ──
const outPath = "/tmp/pixel-oracle-report.json";
writeFileSync(outPath, JSON.stringify(report, null, 2));
process.stderr.write(`\n=== Report written to ${outPath} ===\n`);

// ── 打印摘要 ──
console.log(`\n${"=".repeat(60)}`);
console.log(`PIXEL ORACLE COVERAGE REPORT`);
console.log(`${"=".repeat(60)}`);
console.log(`Total surfaces:           ${surfaceResults.length}`);
console.log(`With pixel data:          ${withPixelData}`);
console.log(`Non-white pixels:         ${withNonWhite}`);
console.log(`React route mapped:       ${mappedSurfaces.length}`);
console.log(`No React route mapping:   ${unmappedSurfaces.length}`);
console.log(`With oracle results:      ${withOracleResults.length}`);
console.log(`Oracle passed:            ${oraclePassed.length}`);
console.log(`Oracle failed:            ${oracleFailed.length}`);
console.log(`Oracle pass rate:         ${report.summary.oraclePassRate !== null ? report.summary.oraclePassRate + "%" : "N/A"}`);
console.log(`Average oracle score:     ${avgOracleScore !== null ? avgOracleScore + "%" : "N/A"}`);
console.log(`Best oracle:              ${bestOracle ? `${bestOracle.shortLabel} (${bestOracle.prevOracleResult.matchRate}%)` : "N/A"}`);
console.log(`Worst oracle:             ${worstOracle ? `${worstOracle.shortLabel} (${worstOracle.prevOracleResult.matchRate}%)` : "N/A"}`);
console.log(`\nCoverage distribution (non-white):`);
for (const [bucket, count] of Object.entries(coverageBuckets)) {
  if (count > 0) console.log(`  ${bucket}: ${count}`);
}
console.log(`\nCoverage distribution (excl. near-white #F9FAFB):`);
for (const [bucket, count] of Object.entries(nearWhiteBuckets)) {
  if (count > 0) console.log(`  ${bucket}: ${count}`);
}

console.log(`\n--- React-Mapped Surfaces with Oracle Results ---`);
console.log(`${"LABEL".padEnd(25)} ${"ROUTE".padEnd(25)} ${"MATCH%".padEnd(8)} ${"NON-WHITE%".padEnd(12)} ${"STATUS"}`);
console.log(`${"-".repeat(25)} ${"-".repeat(25)} ${"-".repeat(8)} ${"-".repeat(12)} ${"-".repeat(8)}`);
for (const s of mappedSurfaces) {
  const matchStr = s.prevOracleResult
    ? (s.prevOracleResult.matchRate !== null ? s.prevOracleResult.matchRate.toFixed(2) + "%" : "N/A")
    : "N/A";
  const status = s.prevOracleResult ? s.prevOracleResult.status : "NO_ORACLE";
  console.log(`${s.shortLabel.padEnd(25)} ${(s.route || "N/A").padEnd(25)} ${matchStr.padEnd(8)} ${s.nonWhitePercent.toFixed(2) + "%".padEnd(12)} ${status}`);
}

console.log(`\n--- Unmapped Surfaces (top 10 by coverage) ---`);
console.log(`${"LABEL".padEnd(30)} ${"NON-WHITE%".padEnd(12)} ${"EXCL-NW%".padEnd(12)} ${"STATUS"}`);
console.log(`${"-".repeat(30)} ${"-".repeat(12)} ${"-".repeat(12)} ${"-".repeat(10)}`);
for (const s of unmappedSurfaces.slice(0, 10)) {
  const status = s.parseError ? "ERROR" : "OK";
  console.log(`${s.shortLabel.padEnd(30)} ${s.nonWhitePercent.toFixed(2) + "%".padEnd(12)} ${s.nonNearWhitePercent.toFixed(2) + "%".padEnd(12)} ${status}`);
}

if (unmappedSurfaces.length > 10) {
  console.log(`  ... and ${unmappedSurfaces.length - 10} more`);
}

console.log(`\n${"=".repeat(60)}`);

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

function resolveArg(name) {
  const args = process.argv.slice(2);
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return null;
}
