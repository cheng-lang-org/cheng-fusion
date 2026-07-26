#!/usr/bin/env bun
// item40 陈旧源守卫(fusion_source_drift_since_process_start):
// 长跑的 MCP server 把 src/*.ts 钉在 import 那一刻的模块图里 —— 2026-07-25 实测: 一次已经改对的
// 修复被 live server 用编辑前的模块判成"还是坏的", 差点误判成没修好。守卫的契约:
//   A. 进程启动指纹只覆盖 <guardRoot>/*.ts 常规文件: 子目录/非 .ts/符号链接 变动一律不误报。
//   B. 修改/新增/删除任一被指纹的文件 → 结构化漂移报告(逐文件 change 类型 + 复原指引)。
//   C. 共享派发点(handleMcpRequest, index.ts 与 cli.ts 共用)上每次 tools/call 都复检, 漂移即失败,
//      连"工具名不存在"都让位于漂移(新工具可能正是这次编辑加的)。
//   D. 真新进程 cli.ts: 启动后才发生的编辑 → 该次调用带 fusion_source_drift_since_process_start 失败, 退出码 1。
//   E. 未被编辑的进程照常成功 —— 守卫不能把正常调用打成噪声。
// 注意本文件对 src 一律用动态 import: 必须先把 CHENG_FUSION_GUARD_ROOT 指到 scratch 拷贝, 再让守卫模块
// 在那一刻取基线(静态 import 会被提升到设置 env 之前)。
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const PROJECT = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE_DIRECTORY = join(PROJECT, "src");
const CLI = join(PROJECT, "cli.ts");
const DRIFT_ERROR = "fusion_source_drift_since_process_start";

function assertTrue(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  console.log(`  ok: ${message}`);
}

function copySourceSnapshot(destination: string) {
  mkdirSync(destination, {recursive: true});
  const names = readdirSync(SOURCE_DIRECTORY, {withFileTypes: true})
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name);
  if (names.length === 0) throw new Error(`no src/*.ts to snapshot: ${SOURCE_DIRECTORY}`);
  for (const name of names) copyFileSync(join(SOURCE_DIRECTORY, name), join(destination, name));
  return names;
}

function makeChengFixtureRoot(base: string) {
  const root = join(base, "cheng-tree");
  mkdirSync(join(root, "src/core"), {recursive: true});
  mkdirSync(join(root, "src/tests"), {recursive: true});
  mkdirSync(join(root, "bootstrap"), {recursive: true});
  mkdirSync(join(root, "tools"), {recursive: true});
  writeFileSync(join(root, "cheng-package.toml"), 'name = "drift-guard-fixture"\n');
  writeFileSync(join(root, "src/core/unit.cheng"), "fn main(): int32 =\n    return 0\n");
  return root;
}

function runProcess(command: string, args: string[], options: {env?: Record<string, string>} = {}) {
  return new Promise<{exitCode: number | null; stdout: string; stderr: string}>((resolvePromise, reject) => {
    const child = spawn(command, args, {cwd: PROJECT, env: {...process.env, ...(options.env || {})} as any, stdio: ["ignore", "pipe", "pipe"]});
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error(`timed out: ${command} ${args.join(" ")}\n${stdout}\n${stderr}`));
    }, 60_000);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", (exitCode) => { clearTimeout(timer); resolvePromise({exitCode, stdout, stderr}); });
  });
}

async function waitForFile(path: string, timeoutMs: number, label: string) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (existsSync(path)) return;
    if (Date.now() > deadline) throw new Error(`${label} never appeared within ${timeoutMs}ms: ${path}`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
}

async function main() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "fusion-item40-")));
  const guardRootA = join(base, "src-copy-a");
  const guardRootB = join(base, "src-copy-b");
  const guardRootC = join(base, "src-copy-c");
  try {
    const snapshot = copySourceSnapshot(guardRootA);
    copySourceSnapshot(guardRootB);
    copySourceSnapshot(guardRootC);
    const chengRoot = makeChengFixtureRoot(base);
    const quiesceInput = JSON.stringify({root: chengRoot, quietMinutes: 1});

    console.log("[A] 指纹只覆盖 <guardRoot>/*.ts 常规文件");
    process.env.CHENG_FUSION_GUARD_ROOT = guardRootA;
    const guard: any = await import("../src/cheng_fusion_source_guard.ts");
    const state = guard.chengFusionSourceGuardState();
    assertTrue(state.guardRoot === guardRootA && state.fingerprintedFileCount === snapshot.length, `进程启动指纹覆盖 ${snapshot.length} 个 src/*.ts`);
    assertTrue(guard.chengFusionSourceDriftReport() === null, "未编辑 → 无漂移");
    mkdirSync(join(guardRootA, "nested"), {recursive: true});
    writeFileSync(join(guardRootA, "nested/inner.ts"), "// nested\n");
    writeFileSync(join(guardRootA, "notes.md"), "# notes\n");
    writeFileSync(join(guardRootA, "cheng_toolkit_m9000.ts.bak"), "// backup\n");
    symlinkSync(join(guardRootA, "runtime.ts"), join(guardRootA, "runtime_link.ts"));
    assertTrue(guard.chengFusionSourceDriftReport() === null, "子目录/非 .ts/备份文件/符号链接 全不误报");

    console.log("[B] 修改/新增/删除 → 结构化漂移报告");
    const modified = join(guardRootA, "cheng_toolkit_m9000.ts");
    appendFileSync(modified, "\n// item40 edit\n");
    const modifiedReport = guard.chengFusionSourceDriftReport("cheng_zc_census");
    assertTrue(modifiedReport?.error === DRIFT_ERROR && modifiedReport.schema === "cheng_fusion_source_drift", "漂移报告用固定 error code/schema");
    assertTrue(modifiedReport.driftedFileCount === 1 && modifiedReport.driftedFiles[0].path === modified && modifiedReport.driftedFiles[0].change === "modified", "逐文件点名被改的文件");
    assertTrue(modifiedReport.tool === "cheng_zc_census" && /restart/i.test(modifiedReport.remedy) && /cli\.ts/.test(modifiedReport.remedy), "报告带工具名与复原指引(重启 server 或走 cli.ts 新进程)");
    const added = join(guardRootA, "cheng_item40_added_m9099.ts");
    writeFileSync(added, "// added after process start\n");
    const removed = join(guardRootA, "json_rpc_frame_decoder.ts");
    rmSync(removed);
    const fullReport = guard.chengFusionSourceDriftReport();
    const changes = Object.fromEntries(fullReport.driftedFiles.map((entry: any) => [entry.path, entry.change]));
    assertTrue(fullReport.driftedFileCount === 3 && changes[modified] === "modified" && changes[added] === "added" && changes[removed] === "removed", "modified/added/removed 三类都被认出");

    console.log("[C] 共享派发点每次 tools/call 复检");
    const {handleMcpRequest}: any = await import("../src/cheng_fusion_mcp_server_m9009.ts");
    const call = async (name: string, args: Record<string, unknown>) => {
      const result: any = await handleMcpRequest({jsonrpc: "2.0", id: 1, method: "tools/call", params: {name, arguments: args}});
      return {isError: result?.isError === true, text: result?.content?.[0]?.text ?? ""};
    };
    const dispatched = await call("cheng_tree_quiesce_probe", {root: chengRoot, quietMinutes: 1});
    assertTrue(dispatched.isError && JSON.parse(dispatched.text).error === DRIFT_ERROR, "漂移后的 tools/call 硬失败, 不返回基于旧模块的结论");
    const unknownTool = await call("cheng_tool_that_only_exists_after_the_edit", {});
    assertTrue(unknownTool.isError && JSON.parse(unknownTool.text).error === DRIFT_ERROR, "漂移优先于 tool-not-found(新工具可能正是这次编辑加的)");
    const listed: any = await handleMcpRequest({jsonrpc: "2.0", id: 2, method: "tools/list", params: {}});
    assertTrue(Array.isArray(listed.tools) && listed.tools.length > 0, "tools/list 不被守卫拦(守卫只挡执行)");

    console.log("[D] 真新进程 cli.ts: 启动后发生的编辑 → 该次调用失败");
    const harness = join(base, "drift_harness.ts");
    writeFileSync(harness, [
      'import {existsSync, writeFileSync} from "node:fs";',
      `import {runCli} from ${JSON.stringify(CLI)};`,
      "const [readyMarker, goMarker, input] = process.argv.slice(2);",
      // 到这一行为止 cli.ts 的整张模块图(含守卫)已经 import 完毕, 基线已定 —— 之后父进程才去改
      // guardRoot, 所以"编辑发生在进程启动之后"是确定性的, 不靠 sleep 赌。
      'writeFileSync(readyMarker, "ready\\n");',
      "const deadline = Date.now() + 30000;",
      "while (!existsSync(goMarker)) {",
      '  if (Date.now() > deadline) { console.error("harness: go marker timeout"); process.exit(97); }',
      "  Bun.sleepSync(10);",
      "}",
      'process.exitCode = await runCli(["run", "cheng_tree_quiesce_probe", "--input", input]);',
    ].join("\n"));
    const readyMarker = join(base, "ready.marker");
    const goMarker = join(base, "go.marker");
    const driftRun = runProcess("bun", [harness, readyMarker, goMarker, quiesceInput], {env: {CHENG_FUSION_GUARD_ROOT: guardRootB}});
    await waitForFile(readyMarker, 30_000, "harness ready marker");
    appendFileSync(join(guardRootB, "cheng_fusion_tool_registry.ts"), "\n// item40 live edit\n");
    writeFileSync(goMarker, "go\n");
    const drifted = await driftRun;
    const driftedPayload = JSON.parse(JSON.parse(drifted.stdout).content[0].text);
    assertTrue(drifted.exitCode === 1, "漂移调用退出码 1");
    assertTrue(driftedPayload.error === DRIFT_ERROR && driftedPayload.driftedFiles.some((entry: any) => entry.path === join(guardRootB, "cheng_fusion_tool_registry.ts")), "新进程里点名启动后被改的文件");

    console.log("[E] 未被编辑的进程照常成功");
    const cleanRun = await runProcess("bun", ["run", CLI, "run", "cheng_tree_quiesce_probe", "--input", quiesceInput], {env: {CHENG_FUSION_GUARD_ROOT: guardRootC}});
    assertTrue(cleanRun.exitCode === 0, `未编辑的 guardRoot → 调用成功 (stderr=${cleanRun.stderr.slice(-400)})`);
    assertTrue(JSON.parse(JSON.parse(cleanRun.stdout).content[0].text).schema === "cheng_tree_quiesce_probe", "返回的是真工具结果, 不是守卫报文");
    const productionRun = await runProcess("bun", ["run", CLI, "run", "cheng_tree_quiesce_probe", "--input", quiesceInput]);
    assertTrue(productionRun.exitCode === 0 && JSON.parse(JSON.parse(productionRun.stdout).content[0].text).schema === "cheng_tree_quiesce_probe", "默认指纹根(真 src/)下的普通调用不受影响");
    assertTrue(readFileSync(join(guardRootC, "cheng_fusion_tool_registry.ts"), "utf8") === readFileSync(join(SOURCE_DIRECTORY, "cheng_fusion_tool_registry.ts"), "utf8"), "守卫全程只 stat, 不改被指纹的文件");
  } finally {
    delete process.env.CHENG_FUSION_GUARD_ROOT;
    rmSync(base, {recursive: true, force: true});
  }
  console.log("item40 fusion source drift guard: PASS");
}

main().catch((error) => {console.error("item40 fusion source drift guard: FAIL", error); process.exit(1)});
