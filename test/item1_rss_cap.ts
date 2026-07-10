// 加固项 1: RSS 帽 — 每个 Cheng driver 子进程都要带 CHENG_PROCESS_MAX_RSS_BYTES,
// 默认 1073741824 (1 GiB, 实测逐工具峰值 8-16x 裕度重定, 见 README), 可被 CHENG_FUSION_RSS_CAP 覆盖。
//
// 三层验证:
//  A. 直接 import 生产模块的 chengDriverSpawnEnv(), 断言构造出的 env 含正确默认值/覆盖值。
//  B. 用生产 runChengDriver() 真实 spawn 一个进程(/bin/sh 回显 env), 断言子进程实际收到的值
//     (这是 cheng_csg_roundtrip/cheng_symbol_diff/cheng_profile_report 内部真正调用的同一个函数)。
//  C. 端到端: 通过真实 MCP JSON-RPC 调 cheng_csg_roundtrip, 对 cheng-lang 项目里最小的
//     canary 定宽文件 src/tests/ordinary_zero_exit_fixture.cheng 做 roundtrip, 断言真实
//     Cheng driver 在 RSS 帽下正常跑通(writer/reader exitCode=0)。
import {startMcp, assertTrue} from "./mcp_client.ts";

const TOOLKIT = "/Users/lbcheng/cheng-fusion/src/cheng_toolkit_m9000.ts";
const CHENG_ROOT = "/Users/lbcheng/cheng-lang";

async function testA_defaultAndOverride() {
  console.log("[A] chengDriverSpawnEnv() 默认值 + CHENG_FUSION_RSS_CAP 覆盖");
  delete process.env.CHENG_FUSION_RSS_CAP;
  const mod = await import(TOOLKIT);
  const envDefault = mod.chengDriverSpawnEnv();
  assertTrue(envDefault.CHENG_PROCESS_MAX_RSS_BYTES === "1073741824", `默认 RSS 帽 = 1073741824, 实得 ${envDefault.CHENG_PROCESS_MAX_RSS_BYTES}`);
  process.env.CHENG_FUSION_RSS_CAP = "6000000000";
  const envOverridden = mod.chengDriverSpawnEnv();
  assertTrue(envOverridden.CHENG_PROCESS_MAX_RSS_BYTES === "6000000000", `CHENG_FUSION_RSS_CAP 覆盖生效, 实得 ${envOverridden.CHENG_PROCESS_MAX_RSS_BYTES}`);
  delete process.env.CHENG_FUSION_RSS_CAP;
}

async function testB_realSpawnReceivesEnv() {
  console.log("[B] runChengDriver() 真实子进程实际收到 CHENG_PROCESS_MAX_RSS_BYTES");
  const mod = await import(TOOLKIT);
  const result = await mod.runChengDriver("/bin/sh", ["-c", "echo RSS=$CHENG_PROCESS_MAX_RSS_BYTES"], {cwd: CHENG_ROOT});
  assertTrue(result.exitCode === 0, `/bin/sh 子进程正常退出, exitCode=${result.exitCode}`);
  assertTrue(result.stdout.includes("RSS=1073741824"), `子进程 stdout 含默认 RSS 帽, 实得: ${JSON.stringify(result.stdout)}`);

  process.env.CHENG_FUSION_RSS_CAP = "7777777777";
  const result2 = await mod.runChengDriver("/bin/sh", ["-c", "echo RSS=$CHENG_PROCESS_MAX_RSS_BYTES"], {cwd: CHENG_ROOT});
  assertTrue(result2.stdout.includes("RSS=7777777777"), `子进程 stdout 含覆盖后的 RSS 帽, 实得: ${JSON.stringify(result2.stdout)}`);
  delete process.env.CHENG_FUSION_RSS_CAP;
}

async function testC_endToEndRoundtrip() {
  console.log("[C] 端到端 MCP cheng_csg_roundtrip(canary 小文件) 在 RSS 帽下真实跑通");
  const mcp = startMcp({CHENG_FUSION_RSS_CAP: "9000000000"}, CHENG_ROOT);
  try {
    await mcp.initialize({rootUri: `file://${CHENG_ROOT}`, workspaceFolders: [{uri: `file://${CHENG_ROOT}`, name: "cheng-lang"}]});
    const {isError, parsed} = await mcp.callTool("cheng_csg_roundtrip", {
      source: "src/tests/ordinary_zero_exit_fixture.cheng",
      outDir: "conversion-reports/cheng-csg-fusion-harness-item1",
    });
    assertTrue(isError !== true, `cheng_csg_roundtrip 未报错, 实得: ${JSON.stringify(parsed).slice(0, 300)}`);
    assertTrue(parsed.writerExitCode === 0, `writer exitCode=0, 实得 ${parsed.writerExitCode}`);
    assertTrue(parsed.readerExitCode === 0, `reader exitCode=0, 实得 ${parsed.readerExitCode}`);
  } finally {
    mcp.kill();
  }
}

async function main() {
  await testA_defaultAndOverride();
  await testB_realSpawnReceivesEnv();
  await testC_endToEndRoundtrip();
  console.log("item1 RSS cap: PASS");
}

main().catch((error) => {
  console.error("item1 RSS cap: FAIL", error);
  process.exit(1);
});
