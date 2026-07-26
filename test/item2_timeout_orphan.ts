// 加固项 2: 超时孤儿 — 经 JsonRpcProcessClient.request 的 cheng-lsp 请求超时后
// 必须 kill 掉真实 cheng-lsp 子进程树(SIGKILL, 含 detached 进程组), 不留孤儿;
// 超时值可配(env CHENG_FUSION_TIMEOUT_MS)。
//
// 确定性超时前提(不靠墙钟竞速): 用真实 cheng-lsp 二进制(不是 mock)跑
// cheng_lsp_query documentSymbol, 目标文件是全项目符号解析不可有界返回的
// src/core/backend/lowering_plan.cheng(见 README "Important finding": 该查询
// RSS 以 ~2.4GB/s 无界增长直到超时被杀)。双层保证 1ms 定时器必然先触发:
// (1) 全新 spawn 的 cheng-lsp 连 LSP initialize 握手都不可能在 1ms 内完成;
// (2) 即便握手完成, 该 documentSymbol 查询也永不返回。两种分支都收敛到同一条
// request() 定时器 -> fail(SIGKILL) -> killChengProcessGroup 路径, 正是本项要验的语义。
// (旧版用 cheng_line_map_read 触发: 该工具已改为纯本地文件解析, 不再 spawn
// cheng-lsp, "spawn+initialize 必超 1ms" 的前提随之失效 —— 暖态下 <1ms 真实返回,
// 测试恒 FAIL。)
//
// 孤儿判定用差集: 触发前后 snapshot 一次 "artifacts/cheng-lsp" 命令行匹配的 pid 集合,
// 触发后新增且仍存活的 pid 才算孤儿 —— 这样不会被这台机器上本来就在跑的生产
// cheng-fusion MCP 服务自己的 cheng-lsp 进程(这个对话本身就在用!)污染判定。
import {spawnSync} from "node:child_process";
import {startMcp, assertTrue, sleep} from "./mcp_client.ts";

const CHENG_ROOT = process.env.CHENG_TOOLCHAIN_ROOT || process.env.CHENG_ROOT || "/Users/lbcheng/cheng-lang";

function pgrepChengLsp(): Set<string> {
  const result = spawnSync("pgrep", ["-f", "artifacts/cheng-lsp"], {encoding: "utf8"});
  return new Set((result.stdout || "").split("\n").map((s) => s.trim()).filter(Boolean));
}

async function testTimeoutKillsOrphan() {
  console.log("[A] CHENG_FUSION_TIMEOUT_MS=1 + 永不返回的 documentSymbol(lowering_plan) 强制超时, 断言无孤儿 cheng-lsp 存活");
  const before = pgrepChengLsp();
  const mcp = startMcp({CHENG_FUSION_TIMEOUT_MS: "1"}, CHENG_ROOT);
  try {
    await mcp.initialize({rootUri: `file://${CHENG_ROOT}`, workspaceFolders: [{uri: `file://${CHENG_ROOT}`, name: "cheng-lang"}]});
    let timedOut = false;
    let parsed: any = null;
    try {
      const response = await mcp.callTool("cheng_lsp_query", {kind: "documentSymbol", file: "src/core/backend/lowering_plan.cheng"}, undefined, 15000);
      parsed = response.parsed;
      timedOut = response.isError === true && typeof parsed === "string" && /timed out/i.test(parsed);
    } catch (error) {
      timedOut = true;
      parsed = error instanceof Error ? error.message : String(error);
    }
    assertTrue(timedOut, `极小超时下 cheng_lsp_query 报超时错误, 实得: ${JSON.stringify(parsed).slice(0, 300)}`);
  } finally {
    mcp.kill();
  }
  // 给 SIGKILL 送达 + reap 一点缓冲时间
  await sleep(1000);
  const after = pgrepChengLsp();
  const newSurvivors = [...after].filter((pid) => !before.has(pid));
  assertTrue(newSurvivors.length === 0, `超时后无新增存活 cheng-lsp 孤儿进程, before=${[...before].join(",")} after=${[...after].join(",")} new=${newSurvivors.join(",")}`);
}

async function testNormalTimeoutStillWorks() {
  console.log("[B] 回归: 不设超时覆盖时, cheng_line_map_read 在保守默认超时内正常成功");
  const mcp = startMcp({}, CHENG_ROOT);
  try {
    await mcp.initialize({rootUri: `file://${CHENG_ROOT}`, workspaceFolders: [{uri: `file://${CHENG_ROOT}`, name: "cheng-lang"}]});
    const started = Date.now();
    const {isError, parsed} = await mcp.callTool("cheng_line_map_read", {file: "src/tests/ordinary_zero_exit_fixture.cheng"}, undefined, 15000);
    const elapsedMs = Date.now() - started;
    assertTrue(isError !== true, `正常调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 300)}`);
    assertTrue(parsed?.schema === "cheng_line_map" && parsed?.functionCount >= 1, `line-map 结果 schema 正确且含函数, 实得: ${JSON.stringify(parsed).slice(0, 200)}`);
    console.log(`  ok: 正常路径耗时 ${elapsedMs}ms (无超时误伤)`);
  } finally {
    mcp.kill();
  }
}

async function main() {
  await testTimeoutKillsOrphan();
  await testNormalTimeoutStillWorks();
  console.log("item2 timeout orphan: PASS");
}

main().catch((error) => {
  console.error("item2 timeout orphan: FAIL", error);
  process.exit(1);
});
