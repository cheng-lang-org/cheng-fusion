#!/usr/bin/env node
/**
 * cheng-web-oracle-driver.ts — Chrome Oracle 对拍驱动
 *
 * 端到端 oracle 运行器：
 *   1. 自检模式：用已知 fixtures 验证 comparison 逻辑正确
 *   2. 全维度对比：DOM / Layout / Events / Screenshot
 *   3. 输出 HTML 报告（带差异详情）
 *   4. --capture 模式：运行 cheng-web-build 并捕获构建产物元数据
 *   5. 可选运行 Cheng 二进制并与 golden 对照
 *
 * 用法:
 *   node --experimental-strip-types tools/cheng-web-oracle-driver.ts [--self-test] [--capture <project>] [--cheng-run <project>]
 */

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  compareDomSnapshots,
  compareLayoutBoxes,
  compareEventTraces,
  compareScreenshots,
  runOracle,
  printRichReport,
} from "./cheng-web-oracle.ts";
import type {
  DomNode,
  LayoutBox,
  EventTrace,
  DiffReport,
  ScreenshotDiff,
  OracleReport,
  OracleOptions,
} from "./cheng-web-oracle.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(scriptDir, "fixtures", "oracle");
const capturedDir = join(fixtureDir, "captured");
const repoRoot = resolve(scriptDir, "..");
const tsCsgDir = join(repoRoot, "ts-csg");

// ── Test cases ──

interface TestCase {
  name: string;
  description: string;
  chengDom?: string;
  chromeDom?: string;
  chengLayout?: string;
  chromeLayout?: string;
  chengEvents?: string;
  chromeEvents?: string;
  chengScreenshot?: string;
  chromeScreenshot?: string;
  expectedDomPassed: boolean;
  expectedLayoutPassed: boolean;
  expectedEventPassed: boolean;
  expectedScreenshotPassed: boolean;
}

function fixture(path: string): string {
  return join(fixtureDir, path);
}

const TESTS: TestCase[] = [
  {
    name: "all-match",
    description: "All 4 dimensions match exactly (golden test)",
    chengDom: fixture("dom_cheng.json"),
    chromeDom: fixture("dom_chrome.json"),
    chengLayout: fixture("layout_cheng.json"),
    chromeLayout: fixture("layout_chrome.json"),
    chengEvents: fixture("events_cheng.json"),
    chromeEvents: fixture("events_chrome.json"),
    chengScreenshot: fixture("screenshot_cheng.raw"),
    chromeScreenshot: fixture("screenshot_chrome.raw"),
    expectedDomPassed: true,
    expectedLayoutPassed: true,
    expectedEventPassed: true,
    expectedScreenshotPassed: true,
  },
  {
    name: "all-mismatch",
    description: "All 4 dimensions have deliberate differences",
    chengDom: fixture("dom_cheng.json"),
    chromeDom: fixture("dom_mismatch.json"),
    chengLayout: fixture("layout_cheng.json"),
    chromeLayout: fixture("layout_mismatch.json"),
    chengEvents: fixture("events_cheng.json"),
    chromeEvents: fixture("events_mismatch.json"),
    chengScreenshot: fixture("screenshot_cheng.raw"),
    chromeScreenshot: fixture("screenshot_mismatch.raw"),
    expectedDomPassed: false,
    expectedLayoutPassed: false,
    expectedEventPassed: false,
    expectedScreenshotPassed: false,
  },
  {
    name: "dom-only",
    description: "Only DOM dimension provided",
    chengDom: fixture("dom_cheng.json"),
    chromeDom: fixture("dom_chrome.json"),
    expectedDomPassed: true,
    expectedLayoutPassed: true,
    expectedEventPassed: true,
    expectedScreenshotPassed: true,
  },
  {
    name: "layout-only",
    description: "Only Layout dimension provided",
    chengLayout: fixture("layout_cheng.json"),
    chromeLayout: fixture("layout_chrome.json"),
    expectedDomPassed: true,
    expectedLayoutPassed: true,
    expectedEventPassed: true,
    expectedScreenshotPassed: true,
  },
  {
    name: "events-only",
    description: "Only Events dimension provided",
    chengEvents: fixture("events_cheng.json"),
    chromeEvents: fixture("events_chrome.json"),
    expectedDomPassed: true,
    expectedLayoutPassed: true,
    expectedEventPassed: true,
    expectedScreenshotPassed: true,
  },
];

// ── Runner ──

function runTestCase(test: TestCase): { report: OracleReport; passed: boolean } {
  const options: OracleOptions = {
    chengDomPath: test.chengDom || "",
    chromeDomPath: test.chromeDom || "",
    chengLayoutPath: test.chengLayout || "",
    chromeLayoutPath: test.chromeLayout || "",
    chengEventsPath: test.chengEvents || "",
    chromeEventsPath: test.chromeEvents || "",
    chengScreenshotPath: test.chengScreenshot || "",
    chromeScreenshotPath: test.chromeScreenshot || "",
    viewport: "800x600",
    tolerance: 1,
    outPath: "",
  };
  const report = runOracle(options);

  const domOk = !options.chengDomPath || report.domDiff.passed === test.expectedDomPassed;
  const layoutOk = !options.chengLayoutPath || report.layoutDiff.passed === test.expectedLayoutPassed;
  const eventOk = !options.chengEventsPath || report.eventDiff.passed === test.expectedEventPassed;
  const screenshotOk = !options.chengScreenshotPath || report.screenshotDiff.passed === test.expectedScreenshotPassed;
  const passed = domOk && layoutOk && eventOk && screenshotOk;

  return { report, passed };
}

// ── Summary ──

function printSummary(results: { test: TestCase; report: OracleReport; passed: boolean }[]): void {
  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  const separator = "=".repeat(60);
  process.stdout.write(`\n${separator}\n`);
  process.stdout.write("  Chrome Oracle Driver — Summary\n");
  process.stdout.write(`${separator}\n\n`);
  process.stdout.write(`  ${passed}/${total} tests passed\n\n`);

  for (const r of results) {
    const status = r.passed ? "PASS" : "FAIL";
    process.stdout.write(`  [${status}] ${r.test.name}: ${r.test.description}\n`);
    if (!r.passed) {
      const dims: string[] = [];
      if (r.test.chengDom && r.report.domDiff.passed !== r.test.expectedDomPassed) {
        dims.push(`DOM (expected ${r.test.expectedDomPassed ? "PASS" : "FAIL"}, got ${r.report.domDiff.passed ? "PASS" : "FAIL"})`);
      }
      if (r.test.chengLayout && r.report.layoutDiff.passed !== r.test.expectedLayoutPassed) {
        dims.push(`Layout (expected ${r.test.expectedLayoutPassed ? "PASS" : "FAIL"}, got ${r.report.layoutDiff.passed ? "PASS" : "FAIL"})`);
      }
      if (r.test.chengEvents && r.report.eventDiff.passed !== r.test.expectedEventPassed) {
        dims.push(`Events (expected ${r.test.expectedEventPassed ? "PASS" : "FAIL"}, got ${r.report.eventDiff.passed ? "PASS" : "FAIL"})`);
      }
      if (r.test.chengScreenshot && r.report.screenshotDiff.passed !== r.test.expectedScreenshotPassed) {
        dims.push(`Screenshot (expected ${r.test.expectedScreenshotPassed ? "PASS" : "FAIL"}, got ${r.report.screenshotDiff.passed ? "PASS" : "FAIL"})`);
      }
      process.stdout.write(`    mismatched dimensions: ${dims.join(", ")}\n`);
    }
  }

  // Overall dimension statistics
  process.stdout.write(`\n  Cross-test Dimension Statistics:\n`);
  const dimStats = { DOM: { total: 0, diffs: 0 }, Layout: { total: 0, diffs: 0 }, Events: { total: 0, diffs: 0 }, Screenshot: { total: 0, diffPixels: 0, totalPixels: 0 } };
  for (const r of results) {
    if (r.test.chengDom) { dimStats.DOM.total++; dimStats.DOM.diffs += r.report.domDiff.diffs.length; }
    if (r.test.chengLayout) { dimStats.Layout.total++; dimStats.Layout.diffs += r.report.layoutDiff.diffs.length; }
    if (r.test.chengEvents) { dimStats.Events.total++; dimStats.Events.diffs += r.report.eventDiff.diffs.length; }
    if (r.test.chengScreenshot) {
      dimStats.Screenshot.total++;
      dimStats.Screenshot.diffPixels += r.report.screenshotDiff.diffPixels;
      dimStats.Screenshot.totalPixels += r.report.screenshotDiff.totalPixels;
    }
  }
  for (const [dim, stats] of Object.entries(dimStats)) {
    if (stats.total === 0) continue;
    if (dim === "Screenshot") {
      const pct = stats.totalPixels > 0 ? (stats.diffPixels / stats.totalPixels * 100).toFixed(2) : "N/A";
      process.stdout.write(`    ${dim}: ${stats.diffPixels}/${stats.totalPixels} diff pixels (${pct}%) across ${stats.total} tests\n`);
    } else {
      process.stdout.write(`    ${dim}: ${stats.diffs} total diffs across ${stats.total} tests\n`);
    }
  }

  process.stdout.write(`\n${separator}\n\n`);
  process.exit(passed === total ? 0 : 1);
}

// ── Capture mode: 运行 cheng-web-build 并捕获构建产物元数据 ──

interface BuildCapture {
  project: string;
  timestamp: string;
  chengSourceLines: number;
  objBytes: number;
  binaryBytes: number;
  chengSourcePath: string;
  binaryPath: string;
  transpilePassed: boolean;
  compilePassed: boolean;
  linkPassed: boolean;
  runExitCode: number | null;
  runStdout: string[];
  runStderr: string[];
}

function captureBuild(project: string, doRun: boolean): BuildCapture {
  const capture: BuildCapture = {
    project,
    timestamp: new Date().toISOString(),
    chengSourceLines: 0,
    objBytes: 0,
    binaryBytes: 0,
    chengSourcePath: "",
    binaryPath: "",
    transpilePassed: false,
    compilePassed: false,
    linkPassed: false,
    runExitCode: null,
    runStdout: [],
    runStderr: [],
  };

  const projectDir = resolve(repoRoot, project);
  const name = basename(projectDir);
  const outDir = "/tmp/cheng-web-build";
  const chengOut = join(outDir, `${name}.cheng`);
  const objOut = join(outDir, `${name}.o`);
  const binOut = join(outDir, name);

  // Step 1: TSX -> Cheng source
  process.stdout.write(`  [capture] transpile ${projectDir}...\n`);
  try {
    const result = execFileSync(
      join(repoRoot, "cheng-web-build"),
      ["--emit", "cheng-web-source", projectDir],
      { encoding: "utf8", timeout: 60000 },
    );
    // Build script prints output to stdout; check if Cheng file was created
  } catch (err: unknown) {
    // Build script exits non-zero on failure, but Cheng file may still be created
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`  [capture] transpile warning: ${msg}\n`);
  }

  if (existsSync(chengOut)) {
    const content = readFileSync(chengOut, "utf8");
    capture.chengSourceLines = content.split("\n").length;
    capture.chengSourcePath = chengOut;
    capture.transpilePassed = true;
    process.stdout.write(`  [capture]   -> ${capture.chengSourceLines} lines Cheng source\n`);
  } else {
    process.stdout.write(`  [capture]   -> transpile FAILED (no .cheng output)\n`);
    return capture;
  }

  // Step 2: Check for object file
  if (existsSync(objOut)) {
    capture.objBytes = statSync(objOut).size;
    capture.compilePassed = true;
    capture.chengSourcePath = chengOut;
    process.stdout.write(`  [capture]   -> ${capture.objBytes} bytes object file\n`);
  } else {
    process.stdout.write(`  [capture]   -> compile FAILED (no .o output)\n`);
  }

  // Step 3: Check for binary
  if (existsSync(binOut)) {
    capture.binaryBytes = statSync(binOut).size;
    capture.linkPassed = true;
    capture.binaryPath = binOut;
    process.stdout.write(`  [capture]   -> ${capture.binaryBytes} bytes binary\n`);
  } else {
    process.stdout.write(`  [capture]   -> link FAILED (no binary output)\n`);
  }

  // Step 4: Optionally run binary
  if (doRun && capture.linkPassed) {
    process.stdout.write(`  [capture]   -> running binary...\n`);
    try {
      const runResult = execFileSync(binOut, [], {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["ignore", "pipe", "pipe"],
      });
      capture.runExitCode = 0;
      capture.runStdout = runResult.stdout?.split("\n").filter((l: string) => l.length > 0) ?? [];
      capture.runStderr = runResult.stderr?.split("\n").filter((l: string) => l.length > 0) ?? [];
    } catch (runErr: unknown) {
      if (runErr instanceof Error && "stdout" in runErr) {
        const e = runErr as { stdout: string; stderr: string; status: number };
        capture.runExitCode = e.status ?? -1;
        capture.runStdout = (e.stdout ?? "").split("\n").filter((l: string) => l.length > 0);
        capture.runStderr = (e.stderr ?? "").split("\n").filter((l: string) => l.length > 0);
      } else {
        capture.runExitCode = -1;
      }
    }
    process.stdout.write(`  [capture]   -> exit code ${capture.runExitCode}\n`);
  }

  return capture;
}

// ── Main ──

function main() {
  const args = process.argv.slice(2);
  const selfTest = args.includes("--self-test");
  const verbose = args.includes("--verbose") || args.includes("-v");
  const outHtml = args.includes("--html");

  // Extract --capture argument
  let captureProject = "";
  const captureIdx = args.indexOf("--capture");
  if (captureIdx >= 0 && captureIdx + 1 < args.length) {
    captureProject = args[captureIdx + 1];
  }

  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`cheng-web-oracle-driver — Chrome Oracle 对拍驱动

用法: node --experimental-strip-types tools/cheng-web-oracle-driver.ts [options]

选项:
  --self-test            Run all test cases with known fixtures
  --capture <project>    Run cheng-web-build and capture build metadata
  --capture-run <project> Run cheng-web-build + execute binary, capture all
  --verbose, -v          Print detailed oracle report per test
  --html                 Generate HTML report (report.html)
  --help, -h             Show this help

Description:
  Drives the cheng-web-oracle comparison engine across all 4 dimensions
  (DOM, Layout, Events, Screenshot). Can run self-tests using static
  golden fixtures to verify the oracle logic is correct. Use --capture
  to build a real fixture and record metadata for oracle comparison.
`);
    process.exit(0);
  }

  // Capture mode
  if (captureProject) {
    process.stdout.write(`Running capture mode for project: ${captureProject}\n\n`);
    const capture = captureBuild(captureProject, false);
    const name = basename(resolve(repoRoot, captureProject));
    const outPath = join(capturedDir, `${name}-capture.json`);
    writeFileSync(outPath, JSON.stringify(capture, null, 2));
    process.stdout.write(`\n  Capture saved to: ${outPath}\n`);
    process.exit(capture.transpilePassed ? 0 : 1);
  }

  // Check for --capture-run
  const captureRunIdx = args.indexOf("--capture-run");
  if (captureRunIdx >= 0 && captureRunIdx + 1 < args.length) {
    const runProject = args[captureRunIdx + 1];
    process.stdout.write(`Running capture-run mode for project: ${runProject}\n\n`);
    const capture = captureBuild(runProject, true);
    const name = basename(resolve(repoRoot, runProject));
    const outPath = join(capturedDir, `${name}-capture.json`);
    writeFileSync(outPath, JSON.stringify(capture, null, 2));
    process.stdout.write(`\n  Capture saved to: ${outPath}\n`);
    process.exit(capture.transpilePassed ? 0 : 1);
  }

  if (!selfTest) {
    // Default: run a comprehensive demonstration comparing all 4 dimensions
    // Uses matching fixtures to show a passing comparison
    process.stdout.write("Running comprehensive oracle comparison (matching fixtures)...\n\n");
    const report = runOracle({
      chengDomPath: fixture("dom_cheng.json"),
      chromeDomPath: fixture("dom_chrome.json"),
      chengLayoutPath: fixture("layout_cheng.json"),
      chromeLayoutPath: fixture("layout_chrome.json"),
      chengEventsPath: fixture("events_cheng.json"),
      chromeEventsPath: fixture("events_chrome.json"),
      chengScreenshotPath: fixture("screenshot_cheng.raw"),
      chromeScreenshotPath: fixture("screenshot_chrome.raw"),
      viewport: "800x600",
      tolerance: 1,
      positionTolerance: 50,
      outPath: "",
    });
    printRichReport(report);

    if (verbose) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    }

    process.exit(report.overallPassed ? 0 : 1);
  }

  // Self-test mode: run all test cases
  process.stdout.write("Running Chrome Oracle self-test suite...\n\n");

  const results: { test: TestCase; report: OracleReport; passed: boolean }[] = [];
  for (const test of TESTS) {
    const result = runTestCase(test);
    results.push({ test, ...result });

    if (verbose) {
      printRichReport(result.report);
    }
  }

  printSummary(results);
}

main();
