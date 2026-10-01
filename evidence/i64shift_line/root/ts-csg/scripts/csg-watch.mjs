#!/usr/bin/env node
/**
 * csg-watch.mjs — LIVE_MIRROR_CAMPAIGN P4 语义轨 watch 通路。
 *
 * 事件驱动(fs.watch, debounce)监听项目源码 → 重跑确定性提取链(emitCsgWebFromTs) →
 * CSGC 字节摘要对比: 未变则 no-op, 变了则原子写出新 CSGC 并发事件行
 * (changeId/sha256/factsCount/latencyMs)。字节一致性门禁: 同一源码任意次重跑
 * CSGC 字节必须精确相等(确定性), 回滚编辑必须回到原摘要。
 *
 * 用法:
 *   node scripts/csg-watch.mjs --project <tsconfig> --entry-root src/main.tsx \
 *        --out <csgc> --report <events.jsonl> [--debounce 300] [--max-runs N] [--standalone-run]
 * --max-runs N: 触发 N 次变更运行后退出(门禁用); 缺省常驻。
 * --standalone-run: 只跑一次提取并退出(门禁的确定性对照)。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, watch, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");

function fail(message) {
  process.stderr.write("csg-watch: " + message + "\n");
  process.exit(1);
}

const options = (() => {
  const p = { project: "", entryRoot: "src/main.tsx", out: "", report: "", debounce: 300, maxRuns: 0, standaloneRun: false };
  const args = process.argv.slice(2);
  const next = (i) => { if (i + 1 >= args.length) fail("missing value for " + args[i]); return args[i + 1]; };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--project") { p.project = resolve(next(i)); i += 1; }
    else if (a === "--entry-root") { p.entryRoot = next(i); i += 1; }
    else if (a === "--out") { p.out = resolve(next(i)); i += 1; }
    else if (a === "--report") { p.report = resolve(next(i)); i += 1; }
    else if (a === "--debounce") { p.debounce = Number(next(i)); i += 1; }
    else if (a === "--max-runs") { p.maxRuns = Number(next(i)); i += 1; }
    else if (a === "--standalone-run") p.standaloneRun = true;
    else fail("unknown argument: " + a);
  }
  if (!p.project || !existsSync(p.project)) fail("--project tsconfig required");
  if (!p.out) p.out = join(dirname(p.project), "watch.csgweb");
  return p;
})();

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function loadPipeline() {
  const { emitCsgWebFromTs } = await import(pathToFileURL(join(packageDir, "dist", "csg-web.js")).href);
  const { csgcWriteFacts } = await import(pathToFileURL(join(packageDir, "dist", "csgc-writer.js")).href);
  return { emitCsgWebFromTs, csgcWriteFacts };
}

const state = {
  lastSha: null,
  changeRuns: 0,
  events: [],
};

function atomicWrite(path, buf) {
  const tmp = path + ".tmp";
  writeFileSync(tmp, buf);
  renameSync(tmp, path);
}

function appendEvent(event) {
  state.events.push(event);
  if (options.report) {
    writeFileSync(options.report, state.events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  }
}

async function runExtraction(trigger) {
  const t0 = Date.now();
  const { emitCsgWebFromTs, csgcWriteFacts } = await loadPipeline();
  const result = emitCsgWebFromTs({
    project: options.project,
    runtime: ["browser"],
    entryRoots: [options.entryRoot],
    emitText: false,
  });
  if (result.diagnostics.length) fail("extraction diagnostics: " + result.diagnostics.join(" | ").slice(0, 400));
  // complete 标志记录进事件; 硬门是 diagnostics 为空 + 确定性字节一致(本项目最小 fixture
  // 的 core 完成性由 project-gate 体系按项目形状判定)。
  const complete = result.report.complete === true;
  const encoded = csgcWriteFacts(result.facts);
  const bytes = Buffer.from(encoded.factsBuffer);
  const sha = sha256(bytes);
  const latencyMs = Date.now() - t0;
  const changed = state.lastSha !== null && sha !== state.lastSha;
  const event = {
    schema: "html_csg.watch_event.v1",
    trigger,
    changeId: changed ? state.changeRuns + 1 : 0,
    sha256: sha,
    factsCount: result.facts.length,
    latencyMs,
    changed,
    complete,
    at: Date.now(),
  };
  if (changed || state.lastSha === null) {
    atomicWrite(options.out, bytes);
  }
  if (changed) state.changeRuns += 1;
  state.lastSha = sha;
  appendEvent(event);
  process.stdout.write(`csg-watch run trigger=${trigger} changed=${changed} sha=${sha.slice(0, 12)} facts=${result.facts.length} latency=${latencyMs}ms\n`);
  return event;
}

function sourceDirs() {
  const projectDir = dirname(options.project);
  const tsconfig = JSON.parse(readFileSync(options.project, "utf8"));
  const includes = tsconfig.include || ["src/**/*"];
  const dirs = new Set();
  for (const pattern of includes) {
    const base = pattern.split("*")[0].replace(/\/$/, "");
    dirs.add(join(projectDir, base || "."));
  }
  return [...dirs];
}

async function main() {
  const first = await runExtraction("initial");
  if (options.standaloneRun) {
    process.stdout.write(`csg-watch standalone ok sha=${first.sha256.slice(0, 12)}\n`);
    return;
  }
  const dirs = sourceDirs();
  let debounceTimer = null;
  let queued = false;
  const watchers = dirs.map((dir) =>
    watch(dir, { recursive: true }, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      queued = true;
      debounceTimer = setTimeout(async () => {
        if (!queued) return;
        queued = false;
        try {
          await runExtraction("fs-change");
          if (options.maxRuns && state.changeRuns >= options.maxRuns) {
            process.stdout.write(`csg-watch max-runs ${options.maxRuns} reached, exiting\n`);
            process.exit(0);
          }
        } catch (error) {
          process.stderr.write(`csg-watch run failed: ${error && error.message}\n`);
          process.exitCode = 1;
        }
      }, options.debounce);
    }),
  );
  process.stdout.write(`csg-watch watching ${dirs.length} dir(s) pid=${process.pid}\n`);
  process.on("SIGTERM", () => { for (const w of watchers) w.close(); process.exit(0); });
  process.on("SIGINT", () => { for (const w of watchers) w.close(); process.exit(0); });
}

await main();
