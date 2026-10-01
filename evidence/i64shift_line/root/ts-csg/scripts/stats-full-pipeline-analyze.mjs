#!/usr/bin/env node
/**
 * stats-full-pipeline-analyze.mjs — Analyze all surface compilation + run outputs
 *
 * Takes a pipeline directory (containing batch-0/, batch-1/, batch-2/ subdirs),
 * reads each batch's gui-matrix.report.json and per-surface run outputs,
 * produces /tmp/full-pipeline-report.json, and prints a summary.
 *
 * Usage: node scripts/stats-full-pipeline-analyze.mjs <pipeline-dir>
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join, resolve } from "node:path";

const WIDTH = 1024;
const HEIGHT = 768;

// ── Entry point ──

async function main() {
  const pipelineDir = resolve(process.argv[2] || ".");
  if (!existsSync(pipelineDir)) {
    process.stderr.write(`error: pipeline dir not found: ${pipelineDir}\n`);
    process.exit(1);
  }

  // Locate batch directories
  const batchDirs = readdirSync(pipelineDir)
    .filter((d) => d.startsWith("batch-"))
    .map((d) => join(pipelineDir, d))
    .filter((d) => existsSync(join(d, "gui-matrix.report.json")));

  if (batchDirs.length === 0) {
    process.stderr.write(`error: no batch dirs with gui-matrix.report.json found in ${pipelineDir}\n`);
    process.exit(1);
  }

  process.stderr.write(`  found ${batchDirs.length} batch dirs with reports\n`);

  // Read all batch reports
  const allResults = [];
  let csgcFactsPath = "";

  for (const batchDir of batchDirs) {
    const report = JSON.parse(readFileSync(join(batchDir, "gui-matrix.report.json"), "utf8"));
    if (!csgcFactsPath && report.facts) csgcFactsPath = report.facts;

    for (let idx = 0; idx < (report.results || []).length; idx++) {
      const result = report.results[idx];
      // Map the source path back to its surface directory
      const sourcePath = result.source || "";
      const parentDirName = sourcePath.split("/").filter(Boolean).slice(-2, -1)[0] || "";
      const surfaceDir = parentDirName ? join(batchDir, parentDirName) : "";

      allResults.push({
        ...result,
        _batchDir: batchDir,
        _surfaceDir: surfaceDir,
        _hasSurfaceDir: surfaceDir ? existsSync(surfaceDir) : false,
      });
    }
  }

  allResults.sort((a, b) => (a._index ?? 0) - (b._index ?? 0));

  process.stderr.write(`  total surfaces in reports: ${allResults.length}\n`);

  // Process each surface: extract stats from run output
  const processed = [];
  let withRunOutput = 0;

  for (let idx = 0; idx < allResults.length; idx++) {
    const r = allResults[idx];
    const stats = await processSurface(r, WIDTH, HEIGHT, idx + 1);
    processed.push(stats.result);
    if (stats.hasRunOutput) withRunOutput++;
  }

  process.stderr.write(`  surfaces with run output: ${withRunOutput}\n`);

  // Compute aggregates
  const surfacesOk = processed.filter((s) => s.status === "ok");
  const surfacesThin = processed.filter((s) => s.coverageStatus === "thin");
  const surfacesFailed = processed.filter((s) => s.status !== "ok");
  const surfacesRunOk = processed.filter((s) => s.runStatus === "ok");
  const surfacesRunFailed = processed.filter((s) => s.runStatus === "failed");
  const surfacesRunNoOutput = processed.filter((s) => s.runStatus === "no_output");
  const surfacesWithPixelData = processed.filter((s) => s.pixelStats !== null);
  const surfacesWithNonWhite = surfacesWithPixelData.filter((s) => s.pixelStats.nonWhitePixels > 0);
  const surfacesWithNonNearWhite = surfacesWithPixelData.filter((s) => s.pixelStats.nonNearWhitePixels > 0);

  const pixelCounts = surfacesWithPixelData.map((s) => s.pixelStats.nonWhitePixels);
  const nonNearWhiteCounts = surfacesWithPixelData.map((s) => s.pixelStats.nonNearWhitePixels);
  const darkCounts = surfacesWithPixelData.map((s) => s.pixelStats.darkPixels);

  const avgNonWhite = pixelCounts.length > 0
    ? parseFloat((pixelCounts.reduce((a, b) => a + b, 0) / pixelCounts.length).toFixed(1))
    : 0;
  const avgNonNearWhite = nonNearWhiteCounts.length > 0
    ? parseFloat((nonNearWhiteCounts.reduce((a, b) => a + b, 0) / nonNearWhiteCounts.length).toFixed(1))
    : 0;
  const avgDark = darkCounts.length > 0
    ? parseFloat((darkCounts.reduce((a, b) => a + b, 0) / darkCounts.length).toFixed(1))
    : 0;

  const medNonWhite = median(pixelCounts);
  const medDark = median(darkCounts);

  const report = {
    schema: "stats-full-pipeline.v1",
    generatedAt: new Date().toISOString(),
    pipelineDir,
    csgcFacts: csgcFactsPath,
    viewport: `${WIDTH}x${HEIGHT}`,
    totalPixels: WIDTH * HEIGHT,
    summary: {
      totalSurfaces: processed.length,
      compilationOk: surfacesOk.length,
      compilationFailed: surfacesFailed.length,
      thinSurfaces: surfacesThin.length,
      runOk: surfacesRunOk.length,
      runFailed: surfacesRunFailed.length,
      runNoOutput: surfacesRunNoOutput.length,
      withPixelData: surfacesWithPixelData.length,
      withNonWhitePixels: surfacesWithNonWhite.length,
      withNonNearWhitePixels: surfacesWithNonNearWhite.length,
      avgNonWhitePixels: avgNonWhite,
      avgNonNearWhitePixels: avgNonNearWhite,
      avgDarkPixels: avgDark,
      medianNonWhitePixels: medNonWhite,
      medianDarkPixels: medDark,
    },
    results: processed,
  };

  // Write report
  const outPath = "/tmp/full-pipeline-report.json";
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  process.stderr.write(`  report written: ${outPath}\n`);
  process.stderr.write("\n");

  // Print summary
  printSummary(report);
}

// ── Surface processing ──

async function processSurface(r, width, height, index) {
  const result = {
    index,
    id: r.id || "",
    rootSource: r.rootSource || "",
    rootTextCandidate: r.rootTextCandidate || "",
    ownerName: r.ownerName || r.id || "",
    subtreeSize: r.subtreeSize || 0,
    status: r.status || "unknown",
    coverageStatus: r.coverage?.status || "",
    error: r.error || "",
    renderViewport: r.renderViewport || "",
    materialized: r.materialized || null,
    runStatus: "not_run",
    pixelStats: null,
    domStats: null,
    layoutBoxCount: 0,
    warnings: [],
    runtimeErrors: [],
  };

  if (r.status !== "ok") {
    return { result, hasRunOutput: false };
  }

  // Skip thin surfaces — no meaningful output
  if (r.coverage?.status === "thin") {
    result.runStatus = "thin_skipped";
    return { result, hasRunOutput: false };
  }

  // Try to read run output
  const stdoutFile = r._hasSurfaceDir ? join(r._surfaceDir, "surface.run.stdout.txt") : "";
  const stderrFile = r._hasSurfaceDir ? join(r._surfaceDir, "surface.run.stderr.txt") : "";

  if (!existsSync(stdoutFile)) {
    result.runStatus = "no_output";
    return { result, hasRunOutput: false };
  }

  const stdoutContent = readFileSync(stdoutFile, "utf8");
  if (!stdoutContent || stdoutContent.trim().length === 0) {
    result.runStatus = "no_output";
    return { result, hasRunOutput: false };
  }

  result.runStatus = "ok";

  // Read stderr for warnings/errors
  const stderrContent = existsSync(stderrFile) ? readFileSync(stderrFile, "utf8") : "";
  const stderrLines = stderrContent.split("\n").filter((l) => l.trim());
  result.runtimeErrors = stderrLines.filter((l) => /error|fail|abort|panic/i.test(l));
  result.warnings = stderrLines.filter((l) => /warn/i.test(l));

  // Also extract warnings from stdout (e.g., "warning: failed to parse...")
  for (const line of stdoutContent.split("\n")) {
    const lower = line.toLowerCase();
    if (lower.includes("warning") || lower.includes("error") || lower.includes("fail")) {
      result.warnings.push(line.trim());
    }
  }

  // Parse pixel data from screenshot dump
  result.pixelStats = await extractPixelStats(stdoutContent, width, height);

  // Parse DOM dump for text content count
  result.domStats = extractDomTextCount(stdoutContent);

  // Count layout boxes
  result.layoutBoxCount = countLayoutBoxes(stdoutContent);

  return { result, hasRunOutput: true };
}

// ── Pixel data extraction ──

async function extractPixelStats(content, width, height) {
  const lines = content.split("\n");
  const totalPixels = width * height;
  let pixelCount = 0;
  let nonWhite = 0;
  let nonNearWhite = 0;
  let darkPixels = 0;
  let inDump = false;
  let found = false;

  for (const line of lines) {
    if (line === "---CHENG_SCREENSHOT_DUMP---") {
      inDump = true;
      continue;
    }
    if (line === "---CHENG_DUMP_END---") break;
    if (!inDump || !line.startsWith("row: ")) continue;

    found = true;
    const parts = line.slice("row: ".length).split(",");
    const numVals = Math.min(parts.length, width * 4);

    for (let i = 0; i + 2 < numVals; i += 4) {
      const r = Number(parts[i]);
      const g = Number(parts[i + 1]);
      const b = Number(parts[i + 2]);
      pixelCount++;

      // Non-white: not pure (255,255,255)
      if (r !== 255 || g !== 255 || b !== 255) {
        nonWhite++;

        // Non-background: not white and not (249,250,251)
        if (r !== 249 || g !== 250 || b !== 251) {
          nonNearWhite++;
        }

        // Dark: average channel < 128
        if (r + g + b < 384) {
          darkPixels++;
        }
      }
    }
  }

  if (!found) {
    return null;
  }

  return {
    totalPixels: pixelCount,
    nonWhitePixels: nonWhite,
    nonWhitePercent: parseFloat(((nonWhite / Math.max(pixelCount, 1)) * 100).toFixed(4)),
    nonNearWhitePixels: nonNearWhite,
    nonNearWhitePercent: parseFloat(((nonNearWhite / Math.max(pixelCount, 1)) * 100).toFixed(4)),
    darkPixels,
    darkPercent: parseFloat(((darkPixels / Math.max(pixelCount, 1)) * 100).toFixed(4)),
  };
}

// ── DOM text content counting ──

function extractDomTextCount(content) {
  const startMarker = "---CHENG_DOM_DUMP---";
  const layoutMarker = "---CHENG_LAYOUT_DUMP---";
  const screenshotMarker = "---CHENG_SCREENSHOT_DUMP---";

  const startIdx = content.indexOf(startMarker);
  if (startIdx < 0) return null;

  const jsonStart = startIdx + startMarker.length;

  // Find the next section marker (LAYOUT or SCREENSHOT)
  let endIdx = content.indexOf(layoutMarker, jsonStart);
  if (endIdx < 0) endIdx = content.indexOf(screenshotMarker, jsonStart);
  if (endIdx < 0) return null;

  // Extract lines between markers; the first line(s) that form valid JSON
  // are the DOM tree. Non-JSON warnings/notes may appear between JSON end
  // and the next section marker.
  const section = content.slice(jsonStart, endIdx).trim();
  const lines = section.split("\n");
  let jsonLines = [];
  let braceDepth = 0;
  let inJson = false;

  for (const line of lines) {
    for (const ch of line) {
      if (ch === "{") { braceDepth++; inJson = true; }
      else if (ch === "}") braceDepth--;
    }
    if (inJson) jsonLines.push(line);
    if (inJson && braceDepth === 0) break;
  }

  if (jsonLines.length === 0) return null;

  // Join lines removing literal newlines in JSON strings (Cheng dumper
  // may embed newlines inside JSON string values, which is invalid JSON).
  const jsonStr = jsonLines.join("").replace(/\n/g, " ");

  try {
    const dom = JSON.parse(jsonStr);
    const textNodes = [];

    function walk(node) {
      if (!node || typeof node !== "object") return;
      // Get text from any node with non-empty textContent
      if (node.textContent && typeof node.textContent === "string" && node.textContent.trim()) {
        textNodes.push(node.textContent.trim());
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) walk(child);
      }
    }

    walk(dom);

    return {
      textNodeCount: textNodes.length,
      textContentCount: textNodes.length,
      totalChars: textNodes.reduce((sum, t) => sum + t.length, 0),
      textContents: textNodes.slice(0, 10),
    };
  } catch {
    return { textNodeCount: 0, textContentCount: 0, totalChars: 0, parseError: "failed to parse DOM JSON" };
  }
}

// ── Layout box counting ──

function countLayoutBoxes(content) {
  let count = 0;
  for (const line of content.split("\n")) {
    if (line.startsWith("box[")) count++;
  }
  return count;
}

// ── Median helper ──

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return parseFloat(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1));
  }
  return sorted[mid];
}

// ── Summary printer ──

function printSummary(report) {
  const s = report.summary;
  console.log("=".repeat(70));
  console.log("STATS FULL PIPELINE REPORT");
  console.log("=".repeat(70));
  console.log(`  Total surfaces:       ${s.totalSurfaces}`);
  console.log(`  Compilation OK:       ${s.compilationOk}`);
  console.log(`  Compilation failed:   ${s.compilationFailed}`);
  console.log(`  Thin surfaces:        ${s.thinSurfaces}`);
  console.log(`  Run OK:               ${s.runOk}`);
  console.log(`  Run failed:           ${s.runFailed}`);
  console.log(`  Run no output:        ${s.runNoOutput}`);
  console.log(`  With pixel data:      ${s.withPixelData}`);
  console.log(`  With non-white px:    ${s.withNonWhitePixels}`);
  console.log(`  With non-bg px:       ${s.withNonNearWhitePixels}`);
  console.log();
  console.log(`  Average non-white px:       ${s.avgNonWhitePixels}`);
  console.log(`  Average non-background px:  ${s.avgNonNearWhitePixels}`);
  console.log(`  Average dark px:            ${s.avgDarkPixels}`);
  console.log(`  Median non-white px:        ${s.medianNonWhitePixels}`);
  console.log(`  Median dark px:             ${s.medianDarkPixels}`);
  console.log();
  console.log("  Per-surface breakdown:");
  console.log(`  ${"INDEX".padEnd(6)} ${"STATUS".padEnd(10)} ${"RUN".padEnd(8)} ${"NON-WHITE%".padEnd(12)} ${"DARK%".padEnd(8)} ${"TEXT".padEnd(6)} ${"BOXES".padEnd(6)} ${"SOURCE"}`);
  console.log(`  ${"-----".padEnd(6)} ${"------".padEnd(10)} ${"---".padEnd(8)} ${"----------".padEnd(12)} ${"-----".padEnd(8)} ${"----".padEnd(6)} ${"-----".padEnd(6)} ${"------"}`);

  for (const r of report.results) {
    const idx = String(r.index).padEnd(6);
    const st = (r.status === "ok" ? "OK" : r.status.slice(0, 8)).padEnd(10);
    const rs = r.runStatus.padEnd(8);
    const nw = r.pixelStats
      ? `${r.pixelStats.nonWhitePercent.toFixed(2)}%`.padEnd(12)
      : "N/A".padEnd(12);
    const dk = r.pixelStats
      ? `${r.pixelStats.darkPercent.toFixed(2)}%`.padEnd(8)
      : "N/A".padEnd(8);
    const tc = r.domStats ? String(r.domStats.textContentCount).padEnd(6) : "0".padEnd(6);
    const lb = String(r.layoutBoxCount).padEnd(6);
    const src = (r.rootSource || r.id || "").slice(0, 50);
    console.log(`  ${idx} ${st} ${rs} ${nw} ${dk} ${tc} ${lb} ${src}`);
  }

  console.log();
  console.log(`  Report: /tmp/full-pipeline-report.json`);
  console.log("=".repeat(70));
}

// ── Run ──

main().catch((err) => {
  process.stderr.write(`error: ${err.stack || err}\n`);
  process.exit(1);
});
