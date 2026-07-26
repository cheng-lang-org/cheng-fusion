#!/usr/bin/env bun
// item39 cheng_driver_frontier_probe 生产路径契约(hermetic: 真 /usr/bin/cc 编一个 10 行的假冷种,
// 不跑真 130k 行编译器 —— 真树 ~53s 的那一跑是探针本身的用法, 不进稳定套件):
//   A. workDir 必须是调用方自己的持久目录: 相对路径/临时盘/源树内 一律拒绝。
//   B. root/entry/target/timeoutSec/未知字段 的非法形全部硬失败。
//   C. 种子身份 = bootstrap/cheng_cold.c 递归本地 include 闭包 sha256:
//      同源复用, 任一闭包文件变化必重编, reuseSeed=false 强制重编。
//   D. system-link-exec 参数形状逐字固定(--root:/--in:/--emit:exe/--target:/--out:/--report-out:)。
//   E. frontierSignature = stderr 里最后 8 条 cheng_cold: 行, 逐字, 非 marker 行不混入。
//   F. 上一轮的 probe.exe 必须先删: 编译失败那一轮绝不因为残留产物报 driverBuilds=true。
//   G. 整轮前后冷种闭包漂移 = 带 before/after/changed 的硬失败。
//   H. entry/import 精确闭包覆盖稳定、入口字节、传递成员、边增删；漂移不返回 frontier。
//   I. MCP/CLI 消费同一闭包逻辑。
//   J. cc 失败 = 带真 stderr 的硬失败, 不退回旧种子。
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync} from "node:fs";
import {homedir, tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {handleMcpRequest} from "../src/cheng_fusion_mcp_server_m9009.ts";

const CLI = join(dirname(import.meta.path), "../cli.ts");
const ENTRY_SOURCE = `import cheng/fixture/module_a

fn main(): int32 =
    return 0
`;
const MODULE_A_SOURCE = `import cheng/fixture/module_b

fn ModuleA(): int32 =
    return 1
`;
const MODULE_A_WITHOUT_IMPORT = `fn ModuleA(): int32 =
    return 1
`;
const MODULE_B_SOURCE = `fn ModuleB(): int32 =
    return 2
`;
const MODULE_SPARE_SOURCE = `fn ModuleSpare(): int32 =
    return 3
`;

const FAKE_COLD_SOURCE = `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "cold_parser.c"
/* item39 fake cold seed: records argv into cwd/argv.txt and behaves per cwd/mode.txt */
int main(int argc, char **argv) {
  FILE *log = fopen("argv.txt", "w");
  for (int i = 0; i < argc; i++) fprintf(log, "%s\\n", argv[i]);
  fclose(log);
  char mode[64];
  strcpy(mode, "frontier");
  FILE *modeFile = fopen("mode.txt", "r");
  if (modeFile) {
    if (fgets(mode, (int)sizeof mode, modeFile) == NULL) strcpy(mode, "frontier");
    fclose(modeFile);
  }
  size_t length = strlen(mode);
  while (length > 0 && (mode[length - 1] == '\\n' || mode[length - 1] == ' ')) mode[--length] = 0;
  if (strcmp(mode, "drift") == 0) {
    char driftPath[4096];
    FILE *driftPathFile = fopen("drift-path.txt", "r");
    if (driftPathFile == NULL || fgets(driftPath, (int)sizeof driftPath, driftPathFile) == NULL) return 91;
    fclose(driftPathFile);
    size_t driftPathLength = strlen(driftPath);
    while (driftPathLength > 0 && (driftPath[driftPathLength - 1] == '\\n' || driftPath[driftPathLength - 1] == ' ')) driftPath[--driftPathLength] = 0;
    FILE *driftFile = fopen(driftPath, "a");
    if (driftFile == NULL) return 92;
    fprintf(driftFile, "/* changed during driver run */\\n");
    fclose(driftFile);
  }
  if (strcmp(mode, "replace") == 0) {
    char driftPath[4096], replacementPath[4096], buffer[4096];
    FILE *driftPathFile = fopen("drift-path.txt", "r");
    FILE *replacementPathFile = fopen("replacement-path.txt", "r");
    if (driftPathFile == NULL || replacementPathFile == NULL ||
        fgets(driftPath, (int)sizeof driftPath, driftPathFile) == NULL ||
        fgets(replacementPath, (int)sizeof replacementPath, replacementPathFile) == NULL) return 93;
    fclose(driftPathFile);
    fclose(replacementPathFile);
    size_t driftPathLength = strlen(driftPath);
    size_t replacementPathLength = strlen(replacementPath);
    while (driftPathLength > 0 && (driftPath[driftPathLength - 1] == '\\n' || driftPath[driftPathLength - 1] == ' ')) driftPath[--driftPathLength] = 0;
    while (replacementPathLength > 0 && (replacementPath[replacementPathLength - 1] == '\\n' || replacementPath[replacementPathLength - 1] == ' ')) replacementPath[--replacementPathLength] = 0;
    FILE *replacementFile = fopen(replacementPath, "rb");
    FILE *driftFile = fopen(driftPath, "wb");
    if (replacementFile == NULL || driftFile == NULL) return 94;
    size_t count;
    while ((count = fread(buffer, 1, sizeof buffer, replacementFile)) > 0) {
      if (fwrite(buffer, 1, count, driftFile) != count) return 95;
    }
    if (ferror(replacementFile)) return 96;
    fclose(replacementFile);
    fclose(driftFile);
  }
  const char *out = NULL, *report = NULL;
  for (int i = 1; i < argc; i++) {
    if (strncmp(argv[i], "--out:", 6) == 0) out = argv[i] + 6;
    if (strncmp(argv[i], "--report-out:", 13) == 0) report = argv[i] + 13;
  }
  if (report != NULL) {
    FILE *reportFile = fopen(report, "w");
    fprintf(reportFile, "full_backend_codegen=0\\n");
    fclose(reportFile);
  }
  if (strcmp(mode, "green") == 0) {
    if (out != NULL) {
      FILE *exe = fopen(out, "w");
      fprintf(exe, "fake exe bytes\\n");
      fclose(exe);
    }
    return 0;
  }
  for (int i = 0; i < 10; i++) fprintf(stderr, "cheng_cold: frontier detail %d\\n", i);
  fprintf(stderr, "plain line without the marker\\n");
  return 2;
}
`;

function assertTrue(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  console.log(`  ok: ${message}`);
}

async function callProbe(args: Record<string, unknown>) {
  const result: any = await handleMcpRequest({jsonrpc: "2.0", id: 1, method: "tools/call", params: {name: "cheng_driver_frontier_probe", arguments: args}});
  const text = result?.content?.[0]?.text ?? "";
  return {isError: result?.isError === true, text, parsed: result?.isError === true ? null : JSON.parse(text)};
}

async function main() {
  // workDir 必须是持久目录, 所以 fixture 整体建在 home 下的一次性目录, 不在临时盘。
  const base = realpathSync(mkdtempSync(join(homedir(), ".cheng-fusion-item39-")));
  const root = join(base, "tree");
  const workDir = join(base, "work");
  const entry = join(root, "src/core/tooling/backend_driver_dispatch_min.cheng");
  const moduleA = join(root, "src/fixture/module_a.cheng");
  const moduleB = join(root, "src/fixture/module_b.cheng");
  const moduleSpare = join(root, "src/fixture/module_spare.cheng");
  const coldSource = join(root, "bootstrap/cheng_cold.c");
  const coldParser = join(root, "bootstrap/cold_parser.c");
  try {
    mkdirSync(join(root, "bootstrap"), {recursive: true});
    mkdirSync(join(root, "src/core/tooling"), {recursive: true});
    mkdirSync(join(root, "src/fixture"), {recursive: true});
    writeFileSync(join(root, "cheng-package.toml"), 'name = "frontier-fixture"\n');
    writeFileSync(coldSource, FAKE_COLD_SOURCE);
    writeFileSync(coldParser, "/* item39 included parser generation 1 */\n");
    writeFileSync(entry, ENTRY_SOURCE);
    writeFileSync(moduleA, MODULE_A_SOURCE);
    writeFileSync(moduleB, MODULE_B_SOURCE);
    writeFileSync(moduleSpare, MODULE_SPARE_SOURCE);

    console.log("[A] workDir 必须是调用方自己的持久目录");
    const relativeWorkDir = await callProbe({root, workDir: "work"});
    assertTrue(relativeWorkDir.isError && /absolute/.test(relativeWorkDir.text), "相对 workDir 被拒");
    const tmpWorkDir = await callProbe({root, workDir: join(tmpdir(), "fusion-item39-volatile")});
    assertTrue(tmpWorkDir.isError && /volatile temp directory/.test(tmpWorkDir.text), "$TMPDIR 下的 workDir 被拒");
    const slashTmpWorkDir = await callProbe({root, workDir: "/tmp/fusion-item39-volatile"});
    assertTrue(slashTmpWorkDir.isError && /volatile temp directory/.test(slashTmpWorkDir.text), "/tmp 下的 workDir 被拒");
    const insideRoot = await callProbe({root, workDir: join(root, "work")});
    assertTrue(insideRoot.isError && /outside the Cheng source tree/.test(insideRoot.text), "源树内的 workDir 被拒");
    assertTrue(!existsSync(join(root, "work")) && !existsSync(join(tmpdir(), "fusion-item39-volatile")), "被拒的 workDir 一个目录都没被创建");

    console.log("[B] root/entry/target/schema 非法形硬失败");
    const missingRoot = await callProbe({root: join(base, "no-such-tree"), workDir});
    assertTrue(missingRoot.isError && /root/i.test(missingRoot.text), "不存在的 root 被拒");
    const notAProject = await callProbe({root: base, workDir});
    assertTrue(notAProject.isError && /cheng-package\.toml|project/i.test(notAProject.text), "没有 cheng-package.toml 的目录不是 Cheng root");
    const missingEntry = await callProbe({root, workDir, entry: "src/core/tooling/absent.cheng"});
    assertTrue(missingEntry.isError && /driver entry source not found/.test(missingEntry.text), "不存在的 entry 被拒");
    const badTarget = await callProbe({root, workDir, target: "arm64 --evil:1"});
    assertTrue(badTarget.isError && /invalid target triple/.test(badTarget.text), "非法 target 被拒(不给参数注入)");
    const badTimeout = await callProbe({root, workDir, timeoutSec: 0});
    assertTrue(badTimeout.isError && /Invalid input/.test(badTimeout.text), "timeoutSec=0 被 schema 拒绝");
    const unknownField = await callProbe({root, workDir, seed: "reuse"});
    assertTrue(unknownField.isError && /Invalid input/.test(unknownField.text), "未知字段被 strictObject 拒绝");

    console.log("[C] 前沿一跑: 冷种编译 + system-link-exec + 逐字签名");
    const first = await callProbe({root, workDir});
    assertTrue(!first.isError && first.parsed.schema === "cheng_driver_frontier_probe", "探针返回 canonical schema");
    assertTrue(first.parsed.seedRebuilt === true && first.parsed.seedBuildRc === 0 && first.parsed.seedBuildElapsedSec > 0, "首跑真编冷种, rc=0");
    assertTrue(first.parsed.seedPath === join(workDir, `seed.${first.parsed.seedSha256Prefix}`) && /^[0-9a-f]{16}$/.test(first.parsed.seedSha256Prefix), "种子文件名携带 C 源码 include 闭包哈希前 16 位");
    assertTrue(first.parsed.seedSourceClosure.entries.length === 2 && first.parsed.seedSourceClosure.entries.some((entry: any) => entry.path === "bootstrap/cheng_cold.c") && first.parsed.seedSourceClosure.entries.some((entry: any) => entry.path === "bootstrap/cold_parser.c"), "种子身份回执覆盖递归本地 include 闭包");
    assertTrue(first.parsed.entrySourceClosureTrusted === true && first.parsed.entrySourceClosureStable === true && first.parsed.entrySourceClosure.sha256 === first.parsed.entrySourceClosureAfterDriver.sha256, "entry/import 闭包前后稳定才标 trusted");
    assertTrue(first.parsed.entrySourceClosure.entries.length === 3 && first.parsed.entrySourceClosure.importEdges.length === 2 && !first.parsed.entrySourceClosure.entries.some((entry: any) => entry.path.endsWith("module_spare.cheng")), "entry/import 闭包只含精确可达成员与边");
    assertTrue(first.parsed.driverRc === 2 && first.parsed.driverBuilds === false && first.parsed.exeExists === false, "driver rc=2 → driverBuilds=false");
    assertTrue(first.parsed.reportExists === true && readFileSync(first.parsed.reportPath, "utf8").includes("full_backend_codegen=0"), "--report-out 真落盘");
    const expectedSignature = Array.from({length: 8}, (_unused, index) => `cheng_cold: frontier detail ${index + 2}`);
    assertTrue(JSON.stringify(first.parsed.frontierSignature) === JSON.stringify(expectedSignature), "frontierSignature = 最后 8 条 cheng_cold: 行, 逐字");
    assertTrue(!first.parsed.frontierSignature.some((line: string) => line.includes("plain line")), "非 marker 行不混入签名");

    console.log("[D] system-link-exec 参数形状逐字固定");
    const argv = readFileSync(join(workDir, "argv.txt"), "utf8").trimEnd().split("\n");
    assertTrue(JSON.stringify(argv.slice(1)) === JSON.stringify([
      "system-link-exec",
      `--root:${root}`,
      `--in:${entry}`,
      "--emit:exe",
      "--target:arm64-apple-darwin",
      `--out:${join(workDir, "probe.exe")}`,
      `--report-out:${join(workDir, "probe.report.txt")}`,
    ]), "驱动参数与手跑口径逐字一致");

    console.log("[E] 种子身份由内容哈希决定");
    const reused = await callProbe({root, workDir});
    assertTrue(reused.parsed.seedRebuilt === false && reused.parsed.seedBuildRc === null && reused.parsed.seedSha256Prefix === first.parsed.seedSha256Prefix, "同源 → 复用种子, 不重编");
    const forced = await callProbe({root, workDir, reuseSeed: false});
    assertTrue(forced.parsed.seedRebuilt === true && forced.parsed.seedBuildRc === 0, "reuseSeed=false 强制重编");
    writeFileSync(coldParser, "/* item39 included parser generation 2 */\n");
    const includeRegenerated = await callProbe({root, workDir});
    assertTrue(includeRegenerated.parsed.seedSha256Prefix !== first.parsed.seedSha256Prefix && includeRegenerated.parsed.seedRebuilt === true, "included cold_parser.c 一变: 闭包哈希变 → 必重编");
    writeFileSync(coldSource, `/* generation 2 */\n${FAKE_COLD_SOURCE}`);
    const regenerated = await callProbe({root, workDir});
    assertTrue(regenerated.parsed.seedSha256Prefix !== includeRegenerated.parsed.seedSha256Prefix && regenerated.parsed.seedRebuilt === true, "cheng_cold.c 一变: 闭包哈希变 → 必重编(旧种子不可能替当前源作答)");

    console.log("[F] 陈旧产物不得冒充成功");
    writeFileSync(join(workDir, "mode.txt"), "green\n");
    const green = await callProbe({root, workDir});
    assertTrue(green.parsed.driverRc === 0 && green.parsed.driverBuilds === true && green.parsed.exeSizeBytes > 0, "driver rc=0 且 exe 落盘 → driverBuilds=true");
    assertTrue(green.parsed.frontierSignature.length === 0, "建得出来时没有前沿签名");
    writeFileSync(join(workDir, "mode.txt"), "frontier\n");
    const afterGreen = await callProbe({root, workDir});
    assertTrue(afterGreen.parsed.driverBuilds === false && afterGreen.parsed.exeExists === false && afterGreen.parsed.exeSizeBytes === null, "失败一轮先删上一轮 probe.exe, 不读成 driverBuilds=true");

    console.log("[G] 整轮源码闭包漂移硬失败");
    writeFileSync(join(workDir, "mode.txt"), "drift\n");
    writeFileSync(join(workDir, "drift-path.txt"), `${coldParser}\n`);
    const drifted = await callProbe({root, workDir});
    assertTrue(drifted.isError && /source closure drifted during driver frontier run/.test(drifted.text), "driver 运行中闭包漂移直接拒绝");
    assertTrue(/before=[0-9a-f]{64} after=[0-9a-f]{64}/.test(drifted.text) && /changed=bootstrap\/cold_parser\.c/.test(drifted.text), "漂移回执绑定前后哈希与精确文件");

    console.log("[H] entry/import 精确闭包漂移不返回可消费 frontier");
    writeFileSync(join(workDir, "drift-path.txt"), `${entry}\n`);
    const entryDrifted = await callProbe({root, workDir});
    assertTrue(entryDrifted.isError && /driver frontier untrusted/.test(entryDrifted.text) && /entrySourceClosureTrusted=false/.test(entryDrifted.text), "入口字节漂移标记 untrusted 并硬失败");
    assertTrue(/changed=src\/core\/tooling\/backend_driver_dispatch_min\.cheng/.test(entryDrifted.text) && !/frontierSignature/.test(entryDrifted.text), "入口字节漂移回执精确且不返回 frontierSignature");
    assertTrue(!existsSync(join(workDir, "probe.exe")) && !existsSync(join(workDir, "probe.report.txt")), "untrusted 轮次删除 exe/report");
    writeFileSync(entry, ENTRY_SOURCE);

    writeFileSync(join(workDir, "drift-path.txt"), `${moduleB}\n`);
    const transitiveDrifted = await callProbe({root, workDir});
    assertTrue(transitiveDrifted.isError && /changed=src\/fixture\/module_b\.cheng/.test(transitiveDrifted.text), "传递 import 成员字节漂移硬失败");
    writeFileSync(moduleB, MODULE_B_SOURCE);

    writeFileSync(join(workDir, "drift-path.txt"), `${entry}\n`);
    writeFileSync(join(workDir, "mode.txt"), "replace\n");
    const addEdgeReplacement = join(workDir, "entry-with-added-edge.cheng");
    writeFileSync(addEdgeReplacement, `${ENTRY_SOURCE.trimEnd()}\nimport cheng/fixture/module_spare\n`);
    writeFileSync(join(workDir, "replacement-path.txt"), `${addEdgeReplacement}\n`);
    const addedEdge = await callProbe({root, workDir});
    assertTrue(addedEdge.isError && /added=src\/fixture\/module_spare\.cheng/.test(addedEdge.text) && /addedEdges=src\/core\/tooling\/backend_driver_dispatch_min\.cheng->src\/fixture\/module_spare\.cheng/.test(addedEdge.text), "新增 import 边与新增闭包成员精确硬失败");
    writeFileSync(entry, ENTRY_SOURCE);

    const moduleAWithoutImport = join(workDir, "module-a-without-import.cheng");
    writeFileSync(moduleAWithoutImport, MODULE_A_WITHOUT_IMPORT);
    writeFileSync(join(workDir, "drift-path.txt"), `${moduleA}\n`);
    writeFileSync(join(workDir, "replacement-path.txt"), `${moduleAWithoutImport}\n`);
    const removedEdge = await callProbe({root, workDir});
    assertTrue(removedEdge.isError && /removed=src\/fixture\/module_b\.cheng/.test(removedEdge.text) && /removedEdges=src\/fixture\/module_a\.cheng->src\/fixture\/module_b\.cheng/.test(removedEdge.text), "删除 import 边与移出闭包成员精确硬失败");
    writeFileSync(moduleA, MODULE_A_SOURCE);

    writeFileSync(join(workDir, "mode.txt"), "frontier\n");
    const stableAgain = await callProbe({root, workDir});
    assertTrue(!stableAgain.isError && stableAgain.parsed.entrySourceClosure.sha256 === first.parsed.entrySourceClosure.sha256 && stableAgain.parsed.entrySourceClosureTrusted === true, "恢复原字节与边后得到同一精确闭包哈希");

    console.log("[I] MCP/CLI 共用同一工具逻辑");
    const cli = spawnSync(process.execPath, [
      CLI,
      "run",
      "cheng_driver_frontier_probe",
      "--input",
      JSON.stringify({root, workDir}),
    ], {cwd: dirname(CLI), encoding: "utf8"});
    assertTrue(cli.status === 0 && cli.stderr === "", "CLI 正常执行同一 probe");
    const cliEnvelope = JSON.parse(cli.stdout);
    const cliProbe = JSON.parse(cliEnvelope.content[0].text);
    assertTrue(cliProbe.entrySourceClosure.sha256 === stableAgain.parsed.entrySourceClosure.sha256 && cliProbe.entrySourceClosureTrusted === true, "CLI 与 MCP 返回同一 entry/import 精确闭包");

    console.log("[J] cc 失败 = 带真 stderr 的硬失败");
    writeFileSync(join(workDir, "mode.txt"), "frontier\n");
    writeFileSync(coldSource, "int main(void) { this is not C }\n");
    const brokenSeed = await callProbe({root, workDir});
    assertTrue(brokenSeed.isError && /\/usr\/bin\/cc/.test(brokenSeed.text) && /error:/.test(brokenSeed.text), "cc 失败带真编译器 stderr 抛出");
    assertTrue(!/frontierSignature/.test(brokenSeed.text), "cc 失败不回退到旧种子, 不产任何 driver 结论");
  } finally {
    rmSync(base, {recursive: true, force: true});
  }
  console.log("item39 driver frontier probe: PASS");
}

main().catch((error) => {console.error("item39 driver frontier probe: FAIL", error); process.exit(1)});
