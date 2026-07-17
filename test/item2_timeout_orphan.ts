// 加固项 2: 超时孤儿 — line_map_read(以及其它经同一 JsonRpcProcessClient.request 的工具)
// 超时后必须 kill 掉真实 cheng-lsp 子进程树(SIGKILL, 含 detached), 不留孤儿;
// 超时值可配(env CHENG_FUSION_TIMEOUT_MS)。
//
// 用真实 cheng-lsp 二进制(不是 mock): 把 CHENG_FUSION_TIMEOUT_MS 设成极小值(1ms),
// 任何真实的 spawn+initialize 握手都会超过这个阈值, 从而确定性地触发超时路径,
// 而不用等一个真的巨文件卡死(那样不确定、还容易撞 RSS/时间红线)。
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
  console.log("[A] CHENG_FUSION_TIMEOUT_MS=1 强制超时, 断言无孤儿 cheng-lsp 存活");
  const before = pgrepChengLsp();
  const mcp = startMcp({CHENG_FUSION_TIMEOUT_MS: "1"}, CHENG_ROOT);
  try {
    await mcp.initialize({rootUri: `file://${CHENG_ROOT}`, workspaceFolders: [{uri: `file://${CHENG_ROOT}`, name: "cheng-lang"}]});
    let timedOut = false;
    let parsed: any = null;
    try {
      const response = await mcp.callTool("cheng_line_map_read", {file: "src/tests/ordinary_zero_exit_fixture.cheng"}, undefined, 15000);
      parsed = response.parsed;
      timedOut = response.isError === true && typeof parsed === "string" && /timed out/i.test(parsed);
    } catch (error) {
      timedOut = true;
      parsed = error instanceof Error ? error.message : String(error);
    }
    assertTrue(timedOut, `极小超时下 cheng_line_map_read 报超时错误, 实得: ${JSON.stringify(parsed).slice(0, 300)}`);
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
    assertTrue(parsed?.schema === "cheng_line_map_v1" && parsed?.functionCount >= 1, `line-map 结果 schema 正确且含函数, 实得: ${JSON.stringify(parsed).slice(0, 200)}`);
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
