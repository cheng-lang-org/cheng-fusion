#!/usr/bin/env node
/**
 * csg-watch-gate.mjs — LIVE_MIRROR_CAMPAIGN P4 语义轨 watch 门禁。
 *
 * 1. 确定性: 同一源码两次独立提取, CSGC 字节精确相等(增量/重跑一致性门禁)。
 * 2. 事件驱动 watch: 源码编辑 → 变更事件(sha 变化) + 延迟打点; 回滚编辑 →
 *    sha 精确回到原摘要(往返确定性)。
 * 3. 事件流 html_csg.watch_event.v1 (changeId/sha256/factsCount/latencyMs/complete)。
 *
 * 用法: node scripts/csg-watch-gate.mjs [--out-dir <dir>]
 * 输出: <out-dir>/csg-watch-gate.report.json, exit 0|1
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");

function fail(message) {
  process.stderr.write("csg-watch-gate: " + message + "\n");
  process.exit(1);
}

const options = (() => {
  const p = { outDir: join(packageDir, "tmp", "csg-watch-gate", "last-run") };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--out-dir") { p.outDir = resolve(args[i + 1]); i += 1; }
    else fail("unknown argument: " + args[i]);
  }
  return p;
})();

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  rmSync(options.outDir, { recursive: true, force: true });
  mkdirSync(options.outDir, { recursive: true });
  const report = { schema: "html_csg.watch_gate.report.v1", verdict: "FAIL" };

  // 1. 独立临时项目副本
  const projectDir = join(options.outDir, "project");
  cpSync(join(packageDir, "fixtures", "scene-hotswap-basic"), projectDir, { recursive: true });
  const mainTsx = join(projectDir, "src", "main.tsx");
  const originalSource = readFileSync(mainTsx, "utf8");

  // 2. 确定性: 两次独立提取字节一致
  const outA = join(options.outDir, "run-a.csgweb");
  const outB = join(options.outDir, "run-b.csgweb");
  for (const out of [outA, outB]) {
    execFileSync(process.execPath, [
      join(scriptDir, "csg-watch.mjs"),
      "--project", join(projectDir, "tsconfig.json"),
      "--entry-root", "src/main.tsx",
      "--out", out,
      "--standalone-run",
    ], { cwd: packageDir, encoding: "utf8", timeout: 120000 });
  }
  const bytesA = readFileSync(outA);
  const bytesB = readFileSync(outB);
  const deterministic = bytesA.equals(bytesB);
  if (!deterministic) fail("CSGC bytes differ across identical extractions");
  const initialSha = sha256(bytesA);
  report.determinism = { sha256: initialSha, byteCount: bytesA.length, ok: deterministic };
  process.stdout.write(`determinism ok sha=${initialSha.slice(0, 12)} bytes=${bytesA.length}\n`);

  // 3. 事件驱动 watch: 编辑 → 变更; 回滚 → 回到原摘要
  const eventsPath = join(options.outDir, "events.jsonl");
  const child = spawn(process.execPath, [
    join(scriptDir, "csg-watch.mjs"),
    "--project", join(projectDir, "tsconfig.json"),
    "--entry-root", "src/main.tsx",
    "--out", join(options.outDir, "watch.csgweb"),
    "--report", eventsPath,
    "--debounce", "200",
    "--max-runs", "2",
  ], { cwd: packageDir, stdio: ["ignore", "pipe", "pipe"] });
  let childStderr = "";
  child.stderr.on("data", (c) => { childStderr += c.toString("utf8"); });
  const childExit = new Promise((r) => child.on("exit", r));

  const waitEvents = async (count, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (existsSync(eventsPath)) {
        const lines = readFileSync(eventsPath, "utf8").trim().split("\n").filter(Boolean);
        if (lines.length >= count) return lines.map((l) => JSON.parse(l));
      }
      if (Date.now() > deadline) fail(`timeout waiting ${count} events; got ${eventsPath && existsSync(eventsPath) ? readFileSync(eventsPath, "utf8").split("\n").length : 0}; stderr=${childStderr.slice(-300)}`);
      await sleep(50);
    }
  };
  const waitReady = async () => {
    const deadline = Date.now() + 30000;
    for (;;) {
      if (childExitDone) return;
      if (Date.now() > deadline) fail("timeout waiting watch ready");
      await sleep(50);
    }
  };
  let childExitDone = false;
  child.on("exit", () => { childExitDone = true; });
  void waitReady;
  // watcher 就绪: 等待 stdout "watching"
  {
    const deadline = Date.now() + 30000;
    let ready = false;
    child.stdout.on("data", (c) => { if (String(c).includes("watching")) ready = true; });
    while (!ready) {
      if (childExitDone || Date.now() > deadline) fail("watch process not ready");
      await sleep(50);
    }
  }

  // 编辑: 增加 4 个结构块
  const editedSource = originalSource.replace(
    '    <div style={{ width: 390, height: 180, backgroundColor: "#cc3333" }} />',
    '    <div style={{ width: 390, height: 180, backgroundColor: "#cc3333" }} />\n    <div style={{ width: 390, height: 60, backgroundColor: "#1166cc" }} />\n    <div style={{ width: 390, height: 60, backgroundColor: "#cc6611" }} />',
  );
  if (editedSource === originalSource) fail("edit anchor not found in fixture source");
  const tEdit0 = Date.now();
  writeFileSync(mainTsx, editedSource);
  let events = await waitEvents(2, 60000);
  const changeEvent = events[events.length - 1];
  if (!changeEvent.changed) fail("first edit did not change CSGC sha");
  const editLatency = changeEvent.latencyMs;

  // 回滚
  writeFileSync(mainTsx, originalSource);
  events = await waitEvents(3, 60000);
  const revertEvent = events[events.length - 1];
  if (revertEvent.changed === false) fail("revert was not detected as a change run");
  if (revertEvent.sha256 !== initialSha) fail(`revert sha ${revertEvent.sha256.slice(0, 12)} != initial ${initialSha.slice(0, 12)}`);

  const code = await Promise.race([childExit, sleep(30000).then(() => "timeout")]);
  if (code !== 0) fail(`watch process exit ${code}; stderr=${childStderr.slice(-400)}`);

  Object.assign(report, {
    determinism: { sha256: initialSha, byteCount: bytesA.length, ok: deterministic },
    edit: { changed: changeEvent.changed, sha256: changeEvent.sha256, latencyMs: editLatency },
    revert: { sha256: revertEvent.sha256, matchesInitial: revertEvent.sha256 === initialSha },
    events: events.length,
  });
  report.verdict =
    deterministic && changeEvent.changed && revertEvent.sha256 === initialSha ? "PASS" : "FAIL";
  writeFileSync(join(options.outDir, "csg-watch-gate.report.json"), JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(`csg-watch-gate verdict=${report.verdict} editLatency=${editLatency}ms revertMatchesInitial=${report.revert.matchesInitial}\n`);
  process.stdout.write("report: " + join(options.outDir, "csg-watch-gate.report.json") + "\n");
  process.exitCode = report.verdict === "PASS" ? 0 : 1;
}

await main();
