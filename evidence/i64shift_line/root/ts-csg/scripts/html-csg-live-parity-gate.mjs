#!/usr/bin/env node
/**
 * html-csg-live-parity-gate.mjs — LIVE_MIRROR_CAMPAIGN P3 观测通路正式门禁。
 *
 * 矩阵: basic/nested × 多 seed 扰动 + 脱敏档(--mask-input) + 负控(--force-unsupported, 期望 FAIL)。
 * 每格断言: exit 0; modelVsInpageFull / inpageFullVsDomSnapshot / inputReplay 三项对账全 PASS;
 * 负控格 negativeControl.ok=true; p95(coalesce)+p95(transport) < 预算(默认 100ms)。
 * 脱敏格额外断言 inputs.jsonl 全部值为脱敏标记。
 *
 * 用法: node scripts/html-csg-live-parity-gate.mjs [--out-dir <dir>] [--budget-ms 100]
 * 输出: <out-dir>/live-parity-gate.report.json, exit 0|1
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");

function fail(message) {
  process.stderr.write("html-csg-live-parity-gate: " + message + "\n");
  process.exit(1);
}

const options = (() => {
  const p = { outDir: join(packageDir, "tmp", "live-parity-gate", "last-run"), budgetMs: 100 };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--out-dir") { p.outDir = resolve(args[i + 1]); i += 1; }
    else if (args[i] === "--budget-ms") { p.budgetMs = Number(args[i + 1]); i += 1; }
    else fail("unknown argument: " + args[i]);
  }
  return p;
})();

const observeScript = join(scriptDir, "html-csg-live-observe.mjs");
const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const MASK = "\u00ABmasked\u00BB";

const cells = [
  { name: "basic-s7-40", fixture: "live-observe-basic", seed: 7, steps: 40 },
  { name: "basic-s8-80", fixture: "live-observe-basic", seed: 8, steps: 80 },
  { name: "basic-s9-30-mask", fixture: "live-observe-basic", seed: 9, steps: 30, maskInput: true },
  { name: "nested-s11-60", fixture: "live-observe-nested", seed: 11, steps: 60 },
  { name: "nested-s12-100", fixture: "live-observe-nested", seed: 12, steps: 100 },
  { name: "basic-s5-20-negctl", fixture: "live-observe-basic", seed: 5, steps: 20, forceUnsupported: true },
];

mkdirSync(options.outDir, { recursive: true });
const cellReports = [];
let allOk = true;

for (const cell of cells) {
  const cellDir = join(options.outDir, cell.name);
  rmSync(cellDir, { recursive: true, force: true });
  mkdirSync(cellDir, { recursive: true });
  const args = [
    observeScript,
    "--url", join(packageDir, "fixtures", cell.fixture, "index.html"),
    "--out-dir", cellDir,
    "--steps", String(cell.steps),
    "--seed", String(cell.seed),
  ];
  if (cell.maskInput) args.push("--mask-input");
  if (cell.forceUnsupported) args.push("--force-unsupported");
  const run = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 180000 });
  const reportPath = join(cellDir, "report.json");
  const problems = [];
  let report = null;
  if (run.status !== 0) problems.push("exit=" + run.status);
  if (!existsSync(reportPath)) problems.push("report.json missing");
  else {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
    if (!cell.forceUnsupported && report.verdict !== "PASS") problems.push("verdict=" + report.verdict);
    for (const key of ["modelVsInpageFull", "inpageFullVsDomSnapshot", "inputReplay"]) {
      if (!String(report.verify[key]).startsWith("PASS")) problems.push(key + "=" + report.verify[key]);
    }
    const lat = report.latency;
    const p95Sum = (lat.coalesceMs.p95 || 0) + (lat.transportMs.p95 || 0);
    if (p95Sum >= options.budgetMs) problems.push("latency p95 sum " + p95Sum + "ms >= budget " + options.budgetMs + "ms");
    if (cell.maskInput) {
      const maskedOk = readFileSync(join(cellDir, "inputs.jsonl"), "utf8")
        .trim().split("\n").map((l) => JSON.parse(l)).every((o) => o.value === MASK);
      if (!maskedOk) problems.push("mask-input: unmasked value in inputs.jsonl");
    }
    if (cell.forceUnsupported && !(report.negativeControl && report.negativeControl.ok)) {
      problems.push("negativeControl not ok: " + JSON.stringify(report.negativeControl));
    }
  }
  const ok = problems.length === 0;
  if (!ok) allOk = false;
  cellReports.push({
    name: cell.name, fixture: cell.fixture, seed: cell.seed, steps: cell.steps,
    maskInput: Boolean(cell.maskInput), forceUnsupported: Boolean(cell.forceUnsupported),
    exitCode: run.status, verdict: report ? report.verdict : null,
    latencyP95: report ? { coalesceMs: report.latency.coalesceMs.p95, transportMs: report.latency.transportMs.p95 } : null,
    ok, problems,
  });
  process.stdout.write("cell " + cell.name + ": " + (ok ? "PASS" : "FAIL(" + problems.join("; ") + ")") + "\n");
}

const gateReport = {
  schema: "html_csg.live_parity_gate.report.v1",
  verdict: allOk ? "PASS" : "FAIL",
  mode: "observation-path",
  budgetMs: options.budgetMs,
  observeScriptSha256: sha256(observeScript),
  gateScriptSha256: sha256(join(scriptDir, "html-csg-live-parity-gate.mjs")),
  fixturesSha256: Object.fromEntries(cells.map((c) => [
    c.fixture, sha256(join(packageDir, "fixtures", c.fixture, "index.html")),
  ])),
  cells: cellReports,
  nodeVersion: process.version,
};
writeFileSync(join(options.outDir, "live-parity-gate.report.json"), JSON.stringify(gateReport, null, 2) + "\n");
process.stdout.write("live-parity-gate verdict=" + gateReport.verdict + " cells=" + cells.length + " budget=" + options.budgetMs + "ms\n");
process.stdout.write("report: " + join(options.outDir, "live-parity-gate.report.json") + "\n");
process.exitCode = allOk ? 0 : 1;
