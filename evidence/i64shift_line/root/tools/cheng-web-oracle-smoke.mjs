import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const oraclePath = join(scriptDir, "cheng-web-oracle.ts");
const driverPath = join(scriptDir, "cheng-web-oracle-driver.ts");
const fixtureDir = join(scriptDir, "fixtures", "oracle");

function runOracle(args) {
  try {
    const stdout = execFileSync(process.execPath, [
      "--experimental-strip-types", oraclePath, ...args,
    ], { encoding: "utf8" });
    return { stdout, status: 0 };
  } catch (err) {
    return { stdout: err.stdout || "", status: err.status || 1 };
  }
}

function runDriver(args) {
  try {
    const stdout = execFileSync(process.execPath, [
      "--experimental-strip-types", driverPath, ...args,
    ], { encoding: "utf8" });
    return { stdout, status: 0 };
  } catch (err) {
    return { stdout: err.stdout || "", status: err.status || 1 };
  }
}

// Test 1: Identical DOM → domPassed should be true
{
  const { stdout } = runOracle([
    "--cheng-dom", join(fixtureDir, "dom_cheng.json"),
    "--chrome-dom", join(fixtureDir, "dom_chrome.json"),
  ]);
  const hasPassReport = stdout.includes("[PASS]") && stdout.includes("DOM");
  assert.ok(hasPassReport, "enhanced report should show DOM PASS");
  // Old smoke format also present in diff stats
  assert.ok(stdout.includes("100.0%"), "report should show 100% match");
}

// Test 2: Mismatched DOM → domPassed should be false
{
  const { stdout } = runOracle([
    "--cheng-dom", join(fixtureDir, "dom_cheng.json"),
    "--chrome-dom", join(fixtureDir, "dom_mismatch.json"),
  ]);
  const hasFailReport = stdout.includes("[FAIL]") && stdout.includes("DOM");
  assert.ok(hasFailReport, "enhanced report should show DOM FAIL");
  assert.ok(stdout.includes("0.0%"), "mismatch should show 0% match");
  assert.ok(stdout.includes("Top 3 Differences"), "should show top diffs");
}

// Test 3: All 4 dimensions matching
{
  const { stdout, status } = runOracle([
    "--cheng-dom", join(fixtureDir, "dom_cheng.json"),
    "--chrome-dom", join(fixtureDir, "dom_chrome.json"),
    "--cheng-layout", join(fixtureDir, "layout_cheng.json"),
    "--chrome-layout", join(fixtureDir, "layout_chrome.json"),
    "--cheng-events", join(fixtureDir, "events_cheng.json"),
    "--chrome-events", join(fixtureDir, "events_chrome.json"),
    "--cheng-screenshot", join(fixtureDir, "screenshot_cheng.raw"),
    "--chrome-screenshot", join(fixtureDir, "screenshot_chrome.raw"),
  ]);
  assert.equal(status, 0, "all matching dimensions should exit 0");
  assert.ok(stdout.includes("4/4 dimensions with data passed"), "all 4 dims should pass");
}

// Test 4: All 4 dimensions mismatched
{
  const { stdout, status } = runOracle([
    "--cheng-dom", join(fixtureDir, "dom_cheng.json"),
    "--chrome-dom", join(fixtureDir, "dom_mismatch.json"),
    "--cheng-layout", join(fixtureDir, "layout_cheng.json"),
    "--chrome-layout", join(fixtureDir, "layout_mismatch.json"),
    "--cheng-events", join(fixtureDir, "events_cheng.json"),
    "--chrome-events", join(fixtureDir, "events_mismatch.json"),
    "--cheng-screenshot", join(fixtureDir, "screenshot_cheng.raw"),
    "--chrome-screenshot", join(fixtureDir, "screenshot_mismatch.raw"),
  ]);
  assert.notEqual(status, 0, "all mismatching dimensions should exit 1");
  assert.ok(stdout.includes("0/4 dimensions with data passed"), "all 4 dims should fail");
  assert.ok(stdout.includes("Top 5 Differences"), "should show top 5 diffs");
  assert.ok(stdout.includes("6.25%"), "screenshot should show 6.25% diff");
}

// Test 5: Driver self-test
{
  const { stdout, status } = runDriver(["--self-test"]);
  assert.equal(status, 0, "driver self-test should exit 0");
  assert.ok(stdout.includes("5/5 tests passed"), "all 5 driver tests should pass");
  assert.ok(stdout.includes("all-match"), "all-match test present");
  assert.ok(stdout.includes("all-mismatch"), "all-mismatch test present");
}

// Test 6: --help
{
  const { stdout } = runOracle(["--help"]);
  assert.ok(stdout.includes("cheng-web-oracle"), "help should print usage");
}

process.stdout.write("cheng-web-oracle smoke ok\n");
