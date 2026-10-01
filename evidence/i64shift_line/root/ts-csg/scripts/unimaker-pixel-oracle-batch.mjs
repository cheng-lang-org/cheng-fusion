#!/usr/bin/env node
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "./process-runner.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = join(scriptDir, "..");

// Key pages to test, with truth route and source file filter
const TEST_PAGES = [
  { route: "lang_select",        source: "app/components/LanguageSelector.tsx",     label: "LanguageSelector" },
  { route: "publish_selector",   source: "app/components/PublishTypeSelector.tsx",  label: "PublishTypeSelector" },
  { route: "home_default",       source: "app/components/HomePage.tsx",             label: "HomePage" },
  { route: "update_center_main", source: "app/components/UpdateCenterPage.tsx",     label: "UpdateCenter" },
  { route: "marketplace_main",   source: "app/components/AppMarketplace.tsx",       label: "AppMarketplace" },
];

const outDir = join(packageDir, "tmp", `unimaker-batch-oracle-${Date.now()}`);
mkdirSync(outDir, { recursive: true });

const results = [];
let passed = 0;
let failed = 0;
let subprocessFailures = 0;
let reportFailedCounts = 0;
const startTime = Date.now();

for (const page of TEST_PAGES) {
  const pageStart = Date.now();
  const pageOutDir = join(outDir, page.label);
  mkdirSync(pageOutDir, { recursive: true });

  process.stderr.write(`\n[${page.label}] route=${page.route} source=${page.source}\n`);

  let subprocessError = null;
  try {
    const truthPath = `/?r2c_truth=1&r2c_route=${page.route}`;
    await runCommand(process.execPath, [
      "scripts/unimaker-pixel-oracle.mjs",
      "--legacy-dom-raw-pixels",
      "--out-dir", pageOutDir,
      "--root-source", page.source,
      "--no-root-text",
      "--path", truthPath,
    ], {
      cwd: packageDir,
      encoding: "utf8",
      timeout: 300000,
      maxBuffer: 512 * 1024 * 1024,
    });
  } catch (err) {
    subprocessError = err;
    subprocessFailures++;
  }

  const elapsed = ((Date.now() - pageStart) / 1000).toFixed(1);
  const reportPath = join(pageOutDir, "pixel-oracle.report.json");
  let report = null;
  let reportError = null;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (err) {
    reportError = err;
  }

  if (report) {
    let reportFailedCount = 0;
    try {
      reportFailedCount = readReportFailedCount(report);
    } catch (err) {
      reportError = err;
    }
    reportFailedCounts += reportFailedCount;
    const matchRate = report.avgMatchRate?.toFixed(2) ?? "?";
    const diffPct = report.screenshotDiff?.pixelDiffPercent?.toFixed(2) ?? "?";
    const routePassed = report.overallPassed === true;
    const status = !subprocessError && !reportError && routePassed && reportFailedCount === 0 ? "PASS" : "FAIL";
    if (status === "PASS") passed++; else failed++;
    process.stderr.write(`  ${status}  match=${matchRate}%  diff=${diffPct}%  ${elapsed}s\n`);
    if (subprocessError) {
      process.stderr.write(`  subprocess failed: ${subprocessError.message}\n`);
    }
    if (reportError) {
      process.stderr.write(`  report invalid: ${reportError.message}\n`);
    }
    if (reportFailedCount > 0) {
      process.stderr.write(`  report failed=${reportFailedCount}\n`);
    }
    results.push({
      page: page.label,
      route: page.route,
      source: page.source,
      status,
      subprocessFailed: Boolean(subprocessError),
      reportFailedCount,
      avgMatchRate: report.avgMatchRate,
      pixelDiffPercent: report.screenshotDiff?.pixelDiffPercent,
      diffPixels: report.screenshotDiff?.diffPixels,
      totalPixels: report.screenshotDiff?.totalPixels,
      oneClickElapsedMs: report.chengOneClick?.elapsedMs ?? null,
      glyphCacheHit: report.chengOneClick?.glyphSdfPrecompute?.cache?.cacheHit ?? null,
      glyphCacheKey: report.chengOneClick?.glyphSdfPrecompute?.cache?.cacheKey ?? "",
      elapsedS: parseFloat(elapsed),
    });
  } else {
    failed++;
    process.stderr.write(`  ERROR  no report  ${elapsed}s\n`);
    if (subprocessError) {
      process.stderr.write(`  subprocess failed: ${subprocessError.message}\n`);
    }
    if (reportError) {
      process.stderr.write(`  report read failed: ${reportError.message}\n`);
    }
    results.push({
      page: page.label,
      route: page.route,
      source: page.source,
      status: "ERROR",
      subprocessFailed: Boolean(subprocessError),
      reportFailedCount: 0,
      elapsedS: parseFloat(elapsed),
    });
  }
}

const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);

// Summary report
const summary = {
  timestamp: new Date().toISOString(),
  totalPages: TEST_PAGES.length,
  passed,
  failed,
  subprocessFailures,
  reportFailedCounts,
  totalElapsedS: parseFloat(totalElapsed),
  results,
};

const summaryPath = join(outDir, "batch-summary.json");
writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

process.stderr.write(`\n=== Batch Complete ===\n`);
process.stderr.write(`pages: ${TEST_PAGES.length}  passed: ${passed}  failed: ${failed}  elapsed: ${totalElapsed}s\n`);
process.stderr.write(`summary: ${summaryPath}\n`);

for (const r of results) {
  const match = r.avgMatchRate?.toFixed(2) ?? "N/A";
  const diff = r.pixelDiffPercent?.toFixed(2) ?? "N/A";
  process.stdout.write(`${r.status}\t${match}%\t${diff}%\t${r.elapsedS}s\t${r.page}\n`);
}

if (summary.failed > 0 || summary.subprocessFailures > 0 || summary.reportFailedCounts > 0) {
  process.exitCode = 1;
}

function readReportFailedCount(report) {
  if (!Object.prototype.hasOwnProperty.call(report, "failed")) return 0;
  if (!Number.isFinite(report.failed)) {
    throw new Error("report.failed must be a finite number");
  }
  return report.failed;
}
