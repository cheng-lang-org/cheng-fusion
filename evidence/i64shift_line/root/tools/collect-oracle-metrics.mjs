#!/usr/bin/env node
/**
 * collect-oracle-metrics.mjs — Oracle 指标收集器
 *
 * 对每个 oracle fixture 运行对比，收集并汇总所有指标到一个 JSON 文件。
 *
 * 用法:
 *   node tools/collect-oracle-metrics.mjs [--out <path>]
 *
 * 默认输出: tools/fixtures/oracle/metrics-report.json
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(scriptDir, "fixtures", "oracle");
const oracleScript = join(scriptDir, "cheng-web-oracle.ts");

// ── Test case definitions ──

function fixture(name) {
  return join(fixtureDir, name);
}

const TEST_CASES = [
  {
    name: "dom-match",
    description: "DOM identical",
    chengDom: fixture("dom_cheng.json"),
    chromeDom: fixture("dom_chrome.json"),
    expectPass: true,
  },
  {
    name: "dom-mismatch",
    description: "DOM different",
    chengDom: fixture("dom_cheng.json"),
    chromeDom: fixture("dom_mismatch.json"),
    expectPass: false,
  },
  {
    name: "layout-match",
    description: "Layout identical",
    chengLayout: fixture("layout_cheng.json"),
    chromeLayout: fixture("layout_chrome.json"),
    expectPass: true,
  },
  {
    name: "layout-mismatch",
    description: "Layout different",
    chengLayout: fixture("layout_cheng.json"),
    chromeLayout: fixture("layout_mismatch.json"),
    expectPass: false,
  },
  {
    name: "events-match",
    description: "Events identical",
    chengEvents: fixture("events_cheng.json"),
    chromeEvents: fixture("events_chrome.json"),
    expectPass: true,
  },
  {
    name: "events-mismatch",
    description: "Events different",
    chengEvents: fixture("events_cheng.json"),
    chromeEvents: fixture("events_mismatch.json"),
    expectPass: false,
  },
  {
    name: "all-match",
    description: "All 4 dimensions identical",
    chengDom: fixture("dom_cheng.json"),
    chromeDom: fixture("dom_chrome.json"),
    chengLayout: fixture("layout_cheng.json"),
    chromeLayout: fixture("layout_chrome.json"),
    chengEvents: fixture("events_cheng.json"),
    chromeEvents: fixture("events_chrome.json"),
    chengScreenshot: fixture("screenshot_cheng.raw"),
    chromeScreenshot: fixture("screenshot_chrome.raw"),
    expectPass: true,
  },
  {
    name: "all-mismatch",
    description: "All 4 dimensions different",
    chengDom: fixture("dom_cheng.json"),
    chromeDom: fixture("dom_mismatch.json"),
    chengLayout: fixture("layout_cheng.json"),
    chromeLayout: fixture("layout_mismatch.json"),
    chengEvents: fixture("events_cheng.json"),
    chromeEvents: fixture("events_mismatch.json"),
    chengScreenshot: fixture("screenshot_cheng.raw"),
    chromeScreenshot: fixture("screenshot_mismatch.raw"),
    expectPass: false,
  },
];

// ── JSON metrics collector ──

function collectMetrics(outPath) {
  const results = [];

  const fixtureFiles = new Set();
  let totalPassed = 0;
  let totalFailed = 0;

  for (const tc of TEST_CASES) {
    const start = Date.now();

    // Build CLI args for the oracle tool
    const args = [];
    const push = (flag, val) => { if (val) args.push(flag, val); };
    push("--cheng-dom", tc.chengDom);
    push("--chrome-dom", tc.chromeDom);
    push("--cheng-layout", tc.chengLayout);
    push("--chrome-layout", tc.chromeLayout);
    push("--cheng-events", tc.chengEvents);
    push("--chrome-events", tc.chromeEvents);
    push("--cheng-screenshot", tc.chengScreenshot);
    push("--chrome-screenshot", tc.chromeScreenshot);

    // Track fixture files
    for (const key of ["chengDom", "chromeDom", "chengLayout", "chromeLayout", "chengEvents", "chromeEvents", "chengScreenshot", "chromeScreenshot"]) {
      const val = tc[key];
      if (val) fixtureFiles.add(val);
    }

    // Run oracle tool and capture JSON report
    let report = null;
    const tmpOut = `/tmp/oracle-metrics-${tc.name}.json`;
    try {
      const fullArgs = [...args, "--format", "json", "--out", tmpOut];
      execFileSync(process.execPath, [
        "--experimental-strip-types", oracleScript, ...fullArgs,
      ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      // Oracle exits non-zero on mismatch — read report file anyway
    }
    if (existsSync(tmpOut)) {
      try {
        report = JSON.parse(readFileSync(tmpOut, "utf8"));
      } catch {
        report = null;
      }
    }

    const domPassed = report?.domDiff?.passed ?? null;
    const domTotal = report?.domDiff?.totalNodes ?? 0;
    const domMatched = report?.domDiff?.matchedNodes ?? 0;
    const domMatchRate = domTotal > 0 ? domMatched / domTotal : null;

    const layoutPassed = report?.layoutDiff?.passed ?? null;
    const layoutTotal = report?.layoutDiff?.totalNodes ?? 0;
    const layoutMatched = report?.layoutDiff?.matchedNodes ?? 0;
    const layoutMatchRate = layoutTotal > 0 ? layoutMatched / layoutTotal : null;

    const eventPassed = report?.eventDiff?.passed ?? null;
    const eventTotal = report?.eventDiff?.totalNodes ?? 0;
    const eventMatched = report?.eventDiff?.matchedNodes ?? 0;
    const eventMatchRate = eventTotal > 0 ? eventMatched / eventTotal : null;

    const screenshotPassed = report?.screenshotDiff?.passed ?? null;
    const screenshotDiffPct = report?.screenshotDiff?.pixelDiffPercent ?? null;

    const overallPassed = report?.overallPassed ?? false;
    const testPassed = overallPassed === tc.expectPass;

    const durationMs = Date.now() - start;
    if (testPassed) totalPassed++;
    else totalFailed++;

    results.push({
      name: tc.name,
      description: tc.description,
      timestamp: new Date().toISOString(),
      domPassed,
      domMatchRate: domMatchRate !== null ? parseFloat((domMatchRate * 100).toFixed(2)) : null,
      layoutPassed,
      layoutMatchRate: layoutMatchRate !== null ? parseFloat((layoutMatchRate * 100).toFixed(2)) : null,
      eventPassed,
      eventMatchRate: eventMatchRate !== null ? parseFloat((eventMatchRate * 100).toFixed(2)) : null,
      screenshotPassed,
      screenshotDiffPct: screenshotDiffPct !== null ? parseFloat(screenshotDiffPct.toFixed(2)) : null,
      overallPassed,
      expectedPass: tc.expectPass,
      testPassed,
      durationMs,
    });
  }

  // Compute aggregate statistics
  const totalTests = results.length;
  const passRate = totalTests > 0 ? parseFloat(((totalPassed / totalTests) * 100).toFixed(2)) : 0;

  const dimAgg = {};
  for (const dim of ["domPassed", "layoutPassed", "eventPassed", "screenshotPassed"]) {
    dimAgg[dim] = { total: 0, passed: 0, fixtures: [] };
  }

  for (const r of results) {
    for (const dim of ["domPassed", "layoutPassed", "eventPassed", "screenshotPassed"]) {
      const val = r[dim];
      if (val !== null) {
        dimAgg[dim].total++;
        if (val) dimAgg[dim].passed++;
      }
    }
  }

  const aggregate = {};
  for (const [dim, stats] of Object.entries(dimAgg)) {
    aggregate[dim] = {
      total: stats.total,
      passed: stats.passed,
      passRate: stats.total > 0 ? parseFloat(((stats.passed / stats.total) * 100).toFixed(2)) : 0,
    };
  }

  const metrics = {
    timestamp: new Date().toISOString(),
    tool: "cheng-web-oracle",
    summary: {
      totalTests,
      totalPassed,
      totalFailed,
      passRate,
      fixtureCount: fixtureFiles.size,
      fixtureFiles: [...fixtureFiles].sort(),
    },
    dimensionAggregates: aggregate,
    results,
  };

  writeFileSync(outPath, JSON.stringify(metrics, null, 2));
  process.stdout.write(`\n  Oracle Metrics Report\n`);
  process.stdout.write(`  ${"=".repeat(50)}\n\n`);
  process.stdout.write(`  Total tests:  ${totalTests}\n`);
  process.stdout.write(`  Passed:       ${totalPassed}\n`);
  process.stdout.write(`  Failed:       ${totalFailed}\n`);
  process.stdout.write(`  Pass rate:    ${passRate}%\n`);
  process.stdout.write(`  Fixtures:     ${fixtureFiles.size} files\n\n`);
  process.stdout.write(`  Dimension Pass Rates:\n`);
  for (const [dim, agg] of Object.entries(aggregate)) {
    if (agg.total > 0) {
      process.stdout.write(`    ${dim.padEnd(20)} ${agg.passed}/${agg.total} (${agg.passRate}%)\n`);
    }
  }
  process.stdout.write(`\n  Report saved to: ${outPath}\n\n`);
}

// ── Main ──

const idx = process.argv.indexOf("--out");
const outPath = idx >= 0
  ? join(fixtureDir, process.argv[idx + 1] || "metrics-report.json")
  : join(fixtureDir, "metrics-report.json");

collectMetrics(outPath);
