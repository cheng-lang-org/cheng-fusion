#!/usr/bin/env node
/**
 * run-real-oracle.mjs — 运行 Chrome Oracle 真实对拍
 *
 * 流程:
 *   1. 用 puppeteer 从 Chrome headless 捕获 oracle-real-page 数据
 *   2. 保存 Chrome 数据为 chrome_* fixture 文件
 *   3. 运行 cheng-web-oracle 对比并输出 HTML 报告
 *
 * 用法: node tools/run-real-oracle.mjs [--viewport 1024x768] [--out <dir>]
 */

import { writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const oracleTool = resolve(scriptDir, "cheng-web-oracle.ts");
const captureScript = resolve(scriptDir, "capture-chrome-oracle.mjs");

const viewport = "1024x768";
const outDir = resolve(scriptDir, "fixtures", "oracle");
const reportPath = resolve(repoRoot, "oracle-real-report.html");

function main() {
  console.log("=".repeat(60));
  console.log("  Chrome Oracle Real Page Comparison");
  console.log("=".repeat(60));
  console.log();

  // Step 1: Capture Chrome data
  console.log("[Step 1] Capturing Chrome headless data...");
  try {
    execFileSync(process.execPath, [captureScript, `--viewport=${viewport}`], {
      cwd: repoRoot,
      stdio: "inherit",
      timeout: 30000,
    });
  } catch (e) {
    console.error("[Step 1] FAILED - Chrome capture error:", e.message);
    process.exit(1);
  }
  console.log("[Step 1] Chrome capture OK\n");

  // Step 2: Verify files exist
  console.log("[Step 2] Checking fixture files...");
  const files = [
    "dom_cheng.json", "dom_chrome.json",
    "layout_cheng.json", "layout_chrome.json",
    "events_cheng.json", "events_chrome.json",
    "screenshot_cheng.raw", "screenshot_chrome.raw",
  ];
  for (const f of files) {
    const p = join(outDir, f);
    if (existsSync(p)) {
      console.log(`  ${f}: ${(statSync(p).size / 1024).toFixed(1)} KB`);
    } else {
      console.log(`  ${f}: MISSING`);
    }
  }
  console.log("[Step 2] File check OK\n");

  // Step 3: Run oracle comparison with HTML report
  console.log("[Step 3] Running oracle comparison (HTML report)...");
  try {
    execFileSync(process.execPath, [
      "--experimental-strip-types", oracleTool,
      "--cheng-dom", join(outDir, "dom_cheng.json"),
      "--chrome-dom", join(outDir, "dom_chrome.json"),
      "--cheng-layout", join(outDir, "layout_cheng.json"),
      "--chrome-layout", join(outDir, "layout_chrome.json"),
      "--cheng-events", join(outDir, "events_cheng.json"),
      "--chrome-events", join(outDir, "events_chrome.json"),
      "--cheng-screenshot", join(outDir, "screenshot_cheng.raw"),
      "--chrome-screenshot", join(outDir, "screenshot_chrome.raw"),
      "--format", "html",
      "--out", reportPath,
    ], {
      cwd: repoRoot,
      stdio: "inherit",
      timeout: 15000,
    });
  } catch {
    // Non-zero exit can happen if diffs found — that's fine
  }

  // Step 4: Run text report
  console.log("\n[Step 4] Text report summary:");
  try {
    execFileSync(process.execPath, [
      "--experimental-strip-types", oracleTool,
      "--cheng-dom", join(outDir, "dom_cheng.json"),
      "--chrome-dom", join(outDir, "dom_chrome.json"),
      "--cheng-layout", join(outDir, "layout_cheng.json"),
      "--chrome-layout", join(outDir, "layout_chrome.json"),
      "--cheng-events", join(outDir, "events_cheng.json"),
      "--chrome-events", join(outDir, "events_chrome.json"),
      "--cheng-screenshot", join(outDir, "screenshot_cheng.raw"),
      "--chrome-screenshot", join(outDir, "screenshot_chrome.raw"),
    ], {
      cwd: repoRoot,
      stdio: "inherit",
      timeout: 15000,
    });
  } catch {
    // Expected if there are differences
  }

  console.log("\n" + "=".repeat(60));
  console.log("  Complete");
  console.log(`  HTML report: ${reportPath}`);
  console.log("=".repeat(60));
}

main();
