#!/usr/bin/env bun
// @ts-nocheck
// item42: 效率对比基准 — 三条真实路径: CLI 单发 / MCP 长驻 / 等价手工 shell 命令序列,
// 加矩阵工具串行(before)/并发(after)墙钟对比。全部数字真实实测: 无 Mock、无伪造基线,
// 绑定 driver/toolchain/输入哈希, 报告落 evidence/efficiency/。
//
// 用法:
//   bun test/item42_efficiency_baseline_compare.ts                 # 轻任务集 + 矩阵子集, 3 轮取 min
//   bun test/item42_efficiency_baseline_compare.ts --with-census   # 追加 zc census 对比(1 轮, 重)
//   bun test/item42_efficiency_baseline_compare.ts --rounds 5 --mode after --parallelism 4
//
// 测量纪律(lessons.md 403/409/418/425): 任务串行独跑, 运行前 pgrep 确认无并发 census;
// 每个数字绑定当前 driver sha256 与工具 HEAD; 失败如实记录, 不产假数字。
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startMcp } from "./mcp_client.ts";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(PACKAGE_ROOT, "cli.ts");
const EVIDENCE_DIR = join(PACKAGE_ROOT, "evidence", "efficiency");
const CHENG_ROOT = process.env.CHENG_ROOT || "/Users/lbcheng/cheng-lang";
const DRIVER = process.env.CHENG_DRIVER || join(CHENG_ROOT, "artifacts/backend_driver/cheng");
const CENSUS_SOURCE = join(CHENG_ROOT, "src/tests/ordinary_zero_exit_fixture.cheng");
const IN_ROOT_FIXTURE = CENSUS_SOURCE; // 包内 fixture: 当前 driver 拒绝包根外源, 手工基线用包内源
const GOLDEN_S = join(PACKAGE_ROOT, "fixtures/addr_symbolicate/golden.s");

const args = new Set(process.argv.slice(2));
const argValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
};
const ROUNDS = Math.max(1, Number(argValue("--rounds", "3")) || 3);
const MODE = argValue("--mode", "before");
const PARALLELISM = argValue("--parallelism", "");
const WITH_CENSUS = args.has("--with-census");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
function sha256File(path) {
  return sha256(readFileSync(path));
}

function run(command, args_, options = {}) {
  const start = performance.now();
  const result = spawnSync(command, args_, {
    encoding: "utf8",
    maxBuffer: 1 << 28,
    timeout: options.timeoutMs || 600_000,
    killSignal: "SIGKILL",
    env: { ...process.env, ...(options.env || {}) },
    cwd: options.cwd || PACKAGE_ROOT,
    shell: false,
  });
  const wallMs = Math.round((performance.now() - start) * 1000) / 1000;
  return {
    ok: result.error === undefined && result.status === 0,
    status: result.status,
    signal: result.signal,
    wallMs,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? String(result.error) : undefined,
  };
}

function runBash(script, args_, options = {}) {
  return run("bash", ["-c", script, "bench", ...(args_ || [])], options);
}

function runTool(tool, input, options = {}) {
  const json = JSON.stringify(input);
  const args_ = ["run", tool, "--input", json];
  if (options.root) args_.push("--root", options.root);
  return run("bun", [CLI, ...args_], { ...options, cwd: PACKAGE_ROOT });
}

function minOf(runs) {
  return Math.min(...runs.map((r) => r.wallMs));
}
function verdictOf(runs) {
  return runs.map((r) => (r.ok ? "ok" : `fail(${r.status ?? r.signal ?? "spawn"})`)).join(",");
}

// 工具「进程成功」不等于「任务完成」: 编译型工具在当前 driver 上可能全部 CFAIL/both_fail
// (fixture 快照到 /tmp 后编译, driver 拒绝包根外源)。解析报告判定真实可用性, 不可用时
// speedup 必须置 n/a, 禁止拿快速失败路径对比手工成功路径。
function extractAvailability(tool, stdout) {
  if (tool !== "cheng_exec_diff" && tool !== "cheng_shape_matrix") return null;
  try {
    const outer = JSON.parse(stdout);
    const report = JSON.parse(outer.content[0].text);
    if (tool === "cheng_exec_diff") {
      if (report.results?.length > 0 && report.results.every((r) => r.verdict === "both_fail")) {
        return "unusable: driver rejects out-of-root source snapshots (both_fail)";
      }
      if (report.summary?.cfail === report.results?.length) return "unusable: all cells CFAIL";
      return "usable";
    }
    if (report.summary && report.summary.selected > 0 && report.summary.cfail === report.summary.selected) {
      return "unusable: driver rejects out-of-root source snapshots (all CFAIL)";
    }
    return "usable";
  } catch {
    return null;
  }
}

// ── MCP 长驻: 一次启动, 多次 tools/call 往返计时(真实 agent 使用路径) ────────────

function startResidentMcp() {
  const env = PARALLELISM ? { CHENG_FUSION_MATRIX_PARALLELISM: PARALLELISM } : {};
  return startMcp(env);
}

// ── fixtures ────────────────────────────────────────────────────────────────

function buildFixtures() {
  const dir = mkdtempSync(join(tmpdir(), "cheng-eff-bench-"));
  // 1) crash stderr: 真实风格的多行 panic 诊断文本
  const crashText = [
    "cheng: fatal: ZC_NOT_READY bail record=22 function=AppendI32Assign",
    "  at src/core/primary_object_plan.cheng:1842",
    "panic at src/core/typed_expr.cheng:12: nil descriptor on sret path",
    "compile error: unreachable import body not found: seq_set_grow",
    "  at bootstrap/cold_parser.c:301",
  ].join("\n") + "\n";
  const crashFile = join(dir, "crash.txt");
  writeFileSync(crashFile, crashText);

  // 2) symbol_diff: 两个 thin arm64 MH_OBJECT
  const sourceA = [
    "int foo(void){return 1;}",
    "int bar(void){return 2;}",
    "int only_a(void){return 3;}",
    "extern int missing_a(void);",
    "int call_a(void){return missing_a();}",
  ].join("\n") + "\n";
  const sourceB = [
    "int foo(void){return 1;}",
    "int bar(void){return 2;}",
    "int only_b(void){return 4;}",
    "extern int missing_b(void);",
    "int call_b(void){return missing_b();}",
  ].join("\n") + "\n";
  writeFileSync(join(dir, "a.c"), sourceA);
  writeFileSync(join(dir, "b.c"), sourceB);
  const objectA = join(dir, "a.o");
  const objectB = join(dir, "b.o");
  const ccA = run("clang", ["-arch", "arm64", "-c", join(dir, "a.c"), "-o", objectA], { timeoutMs: 60_000 });
  const ccB = run("clang", ["-arch", "arm64", "-c", join(dir, "b.c"), "-o", objectB], { timeoutMs: 60_000 });
  if (!ccA.ok || !ccB.ok) throw new Error(`clang fixture compile failed: ${ccA.stderr} ${ccB.stderr}`);

  // 3) addr_symbolicate: golden.s -> executable + sibling .o, 地址取自 nm
  const primaryO = join(dir, "primary.o");
  const exe = join(dir, "exe");
  const ccO = run("clang", ["-arch", "arm64", "-c", GOLDEN_S, "-o", primaryO], { timeoutMs: 60_000 });
  const ccL = run("clang", ["-arch", "arm64", primaryO, "-o", exe], { timeoutMs: 60_000 });
  if (!ccO.ok || !ccL.ok) throw new Error(`golden fixture compile failed: ${ccO.stderr} ${ccL.stderr}`);
  const nmOut = run("nm", ["-n", exe], { timeoutMs: 20_000 });
  const addressMatch = nmOut.stdout.match(/^([0-9a-fA-F]{16})\s+T\s+_fixture_symbol$/m);
  if (!addressMatch) throw new Error(`fixture executable lacks _fixture_symbol: ${nmOut.stdout}`);
  const address = addressMatch[1].replace(/^0+/, "0x") || "0x0";

  // 4) shape_matrix 子集: 12 个确定性挑选的小契约, fixture 绝对路径化。
  // 过滤 import 契约: 当前 driver 的 import 闭包快照路径非 canonical(主仓断点, 2026-08-14),
  // import fixture 全部编译失败, 只测无 import 的可用路径。
  const matrix = JSON.parse(readFileSync(join(PACKAGE_ROOT, "fixtures/ignition/matrix.json"), "utf8"));
  const skipKinds = new Set(["compiler-csg-integration", "typed-expr-big", "big-str-fields", "arena-intern-integration"]);
  const picks = matrix.entries
    .filter((entry) => !entry.expectCompileBail && !entry.golden && !entry.expectStdout
      && !(entry.tags || []).some((tag) => skipKinds.has(tag))
      && !/\bimport\b/.test(readFileSync(join(PACKAGE_ROOT, "fixtures/ignition", entry.fixture), "utf8")))
    .slice(0, 12)
    .map((entry) => ({ ...entry, fixture: join(PACKAGE_ROOT, "fixtures/ignition", entry.fixture) }));
  const subsetPath = join(dir, "matrix-subset.json");
  writeFileSync(subsetPath, JSON.stringify({ defaultRoot: CHENG_ROOT, entries: picks }, null, 2));
  const subsetSha = sha256File(subsetPath);

  return { dir, crashFile, crashText, objectA, objectB, primaryO, exe, address, subsetPath, subsetSha, picks };
}

// ── 任务定义 ────────────────────────────────────────────────────────────────

function defineTasks(fix) {
  const tasks = [];

  tasks.push({
    id: "crash_triage",
    tool: "cheng_crash_triage",
    title: "stderr 崩溃诊断提取(进程内, 0 子进程)",
    rounds: ROUNDS,
    input: { stderr: fix.crashText },
    batchInputs: [
      { stderr: "panic at a.cheng:12\n" },
      { stderr: "panic at b.cheng:99\n" },
      { stderr: "panic at c.cheng:7\n" },
    ],
    manual: () => runBash(
      'grep -nE "panic at [^:]+:[0-9]+" "$1"; grep -c "error" "$1"',
      [fix.crashFile],
      { timeoutMs: 30_000 },
    ),
    manualNote: "grep 提取同一组事实(panic 位置 + error 计数); 工具额外给出结构化分类",
  });

  tasks.push({
    id: "symbol_diff",
    tool: "cheng_symbol_diff",
    title: "两个 arm64 .o 的 defined/undefined 符号集差异",
    rounds: ROUNDS,
    input: { action: "compare", objectA: fix.objectA, objectB: fix.objectB, root: CHENG_ROOT },
    manual: () => runBash(
      // diff 约定: rc0=相同 rc1=有差异 rc>=2=真失败。两个 fixture 符号集必然不同,
      // 比较"完成"(rc<=1) 即基线成立; 把 rc1 判 fail 会把合法差异当任务失败。
      'diff <(nm -gj "$1" | sort -u) <(nm -gj "$2" | sort -u); test $? -le 1',
      [fix.objectA, fix.objectB],
      { timeoutMs: 30_000 },
    ),
    manualNote: "diff + nm 完成同一符号集差异; 工具额外做重定位 call-owner 归因",
  });

  tasks.push({
    id: "addr_symbolicate",
    tool: "cheng_addr_symbolicate",
    title: "崩溃地址 → 函数+偏移(golden fixture)",
    rounds: ROUNDS,
    input: { binaryPath: fix.exe, objectPath: fix.primaryO, address: fix.address },
    manual: () => runBash(
      'a=$(nm -n "$1" | awk \'$3=="_fixture_symbol"{print "0x"$1}\'); otool -tv -arch arm64 "$1" | grep -i "$a" | head -1',
      [fix.exe],
      { timeoutMs: 30_000 },
    ),
    manualNote: "nm 定位符号 + otool 反汇编定位地址行(窗口升级由工具自动完成)",
  });

  tasks.push({
    id: "exec_diff",
    tool: "cheng_exec_diff",
    title: "双 driver 差分(包内 fixture, 同 driver degenerate)",
    rounds: ROUNDS,
    input: { driverA: DRIVER, driverB: DRIVER, fixture: IN_ROOT_FIXTURE, root: CHENG_ROOT },
    manual: () => runBash(
      'd="$1"; f="$2"; root="$3"; tmp="$4"; "$d" system-link-exec "--root:$root" "--in:$f" --emit:exe --link-providers --target:arm64-apple-darwin "--out:$tmp/a" >/dev/null 2>&1 && "$d" system-link-exec "--root:$root" "--in:$f" --emit:exe --link-providers --target:arm64-apple-darwin "--out:$tmp/b" >/dev/null 2>&1 && "$tmp/a" >"$tmp/oa" 2>&1; rc1=$?; "$tmp/b" >"$tmp/ob" 2>&1; rc2=$?; cmp -s "$tmp/oa" "$tmp/ob" && echo identical || echo differ; [ $rc1 -eq 0 ] && [ $rc2 -eq 0 ]',
      [DRIVER, IN_ROOT_FIXTURE, CHENG_ROOT, fix.dir],
      { timeoutMs: 600_000 },
    ),
    manualNote: "同一编译参数与顺序流程; 工具额外加超时/溢出/物化守卫与哈希。注意: 工具把 fixture 快照到 /tmp 后编译, 当前 driver 拒绝包根外源(leaves package root), 工具侧可能判 both_fail",
  });

  tasks.push({
    id: "shape_matrix_12",
    tool: "cheng_shape_matrix",
    title: `形状矩阵 12 契约子集(parallelism=${PARALLELISM || "1(串行)"})`,
    rounds: ROUNDS,
    input: { driver: DRIVER, matrixPath: fix.subsetPath, root: CHENG_ROOT },
    manual: null,
    manualNote: null,
    matrix: true,
    timeoutMs: 600_000,
    env: PARALLELISM ? { CHENG_FUSION_MATRIX_PARALLELISM: PARALLELISM } : {},
  });

  if (WITH_CENSUS) {
    tasks.push({
      id: "zc_census",
      tool: "cheng_zc_census",
      title: `ZC census(canary source=${CENSUS_SOURCE})`,
      rounds: 1,
      input: { root: CHENG_ROOT, source: CENSUS_SOURCE },
      manual: () => runBash('bash tools/zc_enumerate.sh "$1"', [CENSUS_SOURCE], { cwd: CHENG_ROOT, timeoutMs: 900_000 }),
      manualNote: "直跑正典枚举脚本; 工具额外解析 bail histogram/byBodyKind 结构化输出",
      timeoutMs: 900_000,
    });
  }

  return tasks;
}

// ── MCP 长驻 tools/call 计时 ────────────────────────────────────────────────

async function residentCall(client, tool, input, timeoutMs = 600_000) {
  const start = performance.now();
  let response;
  try {
    response = await client.request("tools/call", { name: tool, arguments: input }, timeoutMs);
  } catch (error) {
    return { ok: false, wallMs: Math.round((performance.now() - start) * 1000) / 1000, stderr: String(error && error.stack || error) };
  }
  const wallMs = Math.round((performance.now() - start) * 1000) / 1000;
  return { ok: !response.error, wallMs, stderr: response.error ? JSON.stringify(response.error).slice(0, 400) : "" };
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

function gitHead() {
  const result = run("git", ["-C", PACKAGE_ROOT, "rev-parse", "HEAD"], { timeoutMs: 10_000 });
  return result.ok ? result.stdout.trim() : undefined;
}

function runBatch(inputs, options = {}) {
  const ndjson = inputs.map((input) => JSON.stringify({tool: "cheng_crash_triage", input})).join("\n") + "\n";
  const start = performance.now();
  const result = spawnSync("bun", [CLI, "batch"], {
    encoding: "utf8",
    input: ndjson,
    maxBuffer: 1 << 28,
    timeout: options.timeoutMs || 600_000,
    killSignal: "SIGKILL",
    env: { ...process.env, ...(options.env || {}) },
    cwd: PACKAGE_ROOT,
    shell: false,
  });
  const wallMs = Math.round((performance.now() - start) * 1000) / 1000;
  return {
    ok: result.error === undefined && result.status === 0,
    status: result.status,
    wallMs,
    perCallMs: Math.round((wallMs / inputs.length) * 1000) / 1000,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

async function main() {
  if (!existsSync(DRIVER)) throw new Error(`driver missing: ${DRIVER}`);
  if (!existsSync(join(CHENG_ROOT, "cheng-package.toml"))) throw new Error(`not a Cheng project root: ${CHENG_ROOT}`);
  const censusBusy = spawnSync("pgrep", ["-fl", "zc_enumerate"], { encoding: "utf8" });
  if (censusBusy.status === 0) throw new Error(`another census is running; 独跑纪律拒绝启动:\n${censusBusy.stdout}`);

  const fix = buildFixtures();
  const tasks = defineTasks(fix);
  const env = {
    fusionGitHead: gitHead(),
    driver: DRIVER,
    driverSha256: sha256File(DRIVER),
    chengRoot: CHENG_ROOT,
    bunVersion: spawnSync("bun", ["--version"], { encoding: "utf8" }).stdout.trim(),
    clangVersion: spawnSync("clang", ["--version"], { encoding: "utf8" }).stdout.split("\n")[0] || "unknown",
    cpus: Number(spawnSync("sysctl", ["-n", "hw.physicalcpu"], { encoding: "utf8" }).stdout.trim() || 0),
    mode: MODE,
    parallelism: PARALLELISM || "1",
    rounds: ROUNDS,
    withCensus: WITH_CENSUS,
    matrixSubsetSha256: fix.subsetSha,
    crashFixtureSha256: sha256(fix.crashText),
    inRootFixture: IN_ROOT_FIXTURE,
  };
  const report = { schema: "cheng_fusion_efficiency_baseline", generatedAt: new Date().toISOString(), environment: env, tasks: {} };
  const client = startResidentMcp();

  let anyFailure = false;
  try {
    for (const task of tasks) {
      const entry = { title: task.title, cli: null, resident: null, batch: null, manual: null, speedupCliVsManual: null, speedupResidentVsManual: null, speedupBatchVsManual: null, note: task.manualNote };
      try {
        const cliRuns = [];
        for (let round = 0; round < task.rounds; round++) cliRuns.push(runTool(task.tool, task.input, { timeoutMs: task.timeoutMs, env: task.env }));
        entry.cli = { wallMs: cliRuns.map((r) => r.wallMs), minMs: minOf(cliRuns), verdict: verdictOf(cliRuns) };
        if (!cliRuns.every((r) => r.ok)) { entry.error = `cli failed: ${entry.cli.verdict} ${cliRuns.map((r) => r.stderr).join(" | ").slice(-800)}`; anyFailure = true; }
        const availability = extractAvailability(task.tool, cliRuns[cliRuns.length - 1]?.stdout || "");
        entry.availability = availability;
        const usable = availability === null || availability === "usable";

        const residentRuns = [];
        for (let round = 0; round < task.rounds; round++) residentRuns.push(await residentCall(client, task.tool, task.input, task.timeoutMs));
        entry.resident = { wallMs: residentRuns.map((r) => r.wallMs), minMs: minOf(residentRuns), verdict: verdictOf(residentRuns) };
        if (!residentRuns.every((r) => r.ok)) { entry.error = (entry.error || "") + ` resident failed: ${entry.resident.verdict} ${residentRuns.map((r) => r.stderr).join(" | ").slice(-800)}`; anyFailure = true; }

        if (task.batchInputs) {
          const batchRuns = [];
          for (let round = 0; round < task.rounds; round++) batchRuns.push(runBatch(task.batchInputs, { timeoutMs: task.timeoutMs, env: task.env }));
          entry.batch = { wallMs: batchRuns.map((r) => r.wallMs), perCallMs: batchRuns.map((r) => r.perCallMs), minPerCallMs: Math.min(...batchRuns.map((r) => r.perCallMs)), verdict: verdictOf(batchRuns) };
          if (!batchRuns.every((r) => r.ok)) { entry.error = (entry.error || "") + ` batch failed: ${entry.batch.verdict} ${batchRuns.map((r) => r.stderr).join(" | ").slice(-800)}`; anyFailure = true; }
        }

        if (task.manual) {
          const manualRuns = [];
          for (let round = 0; round < task.rounds; round++) manualRuns.push(task.manual());
          entry.manual = { wallMs: manualRuns.map((r) => r.wallMs), minMs: minOf(manualRuns), verdict: verdictOf(manualRuns) };
          if (!manualRuns.every((r) => r.ok)) { entry.error = (entry.error || "") + ` manual failed: ${entry.manual.verdict} ${manualRuns.map((r) => r.stderr).join(" | ").slice(-800)}`; anyFailure = true; }
          if (usable) {
            if (entry.cli) entry.speedupCliVsManual = Math.round((entry.manual.minMs / entry.cli.minMs) * 100) / 100;
            if (entry.resident) entry.speedupResidentVsManual = Math.round((entry.manual.minMs / entry.resident.minMs) * 100) / 100;
            if (entry.batch) entry.speedupBatchVsManual = Math.round((entry.manual.minMs / entry.batch.minPerCallMs) * 100) / 100;
          }
        }
      } catch (error) {
        entry.error = String(error && error.stack || error);
        anyFailure = true;
      }
      report.tasks[task.id] = entry;
      console.log(`  ${task.id}: cli=${entry.cli ? `${entry.cli.minMs}ms` : "n/a"} resident=${entry.resident ? `${entry.resident.minMs}ms` : "n/a"} batch=${entry.batch ? `${entry.batch.minPerCallMs}ms/call` : "n/a"} manual=${entry.manual ? `${entry.manual.minMs}ms` : "n/a"} speedupResidentVsManual=${entry.speedupResidentVsManual ?? "n/a"}${entry.availability && entry.availability !== "usable" ? ` availability=${entry.availability}` : ""}${entry.error ? "  ERROR: " + entry.error.slice(0, 200) : ""}`);
    }
  } finally {
    client.kill();
  }

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "").replace("T", "-").slice(0, 15);
  const fileName = `${stamp}-${MODE}.json`;
  const filePath = join(EVIDENCE_DIR, fileName);
  writeFileSync(filePath, JSON.stringify(report, null, 2) + "\n");
  const indexPath = join(EVIDENCE_DIR, "index.json");
  const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : { entries: [] };
  index.entries.push({ file: fileName, mode: MODE, generatedAt: report.generatedAt, fusionGitHead: env.fusionGitHead, driverSha256: env.driverSha256, parallelism: env.parallelism, tasks: Object.keys(report.tasks) });
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");

  rmSync(fix.dir, { recursive: true, force: true });
  console.log(`report: ${filePath}`);
  console.log(anyFailure ? "efficiency baseline: FAILED (see report)" : "efficiency baseline: PASS");
  process.exit(anyFailure ? 1 : 0);
}

main();
