// cheng_exec_diff 端到端验证: 起真实 MCP server, 用真实 Cheng driver 编译+运行真实夹具,
// 覆盖四种 verdict:
//   identical           — 同一个 driver 跟自己比(stage3 vs stage3), 平凡夹具
//   semantic_divergence — 真实已知分歧: /tmp/enum19/sweep/t26c_min.cheng, DRV27 vs stage3
//                         (int8(-100) 回读: DRV27 打印 156, stage3 打印 -100, 手工验证过)
//   compile_wall        — ZC_NOT_READY 摘要抽取(单列不算分歧); 用固定文本 stub driver 保证
//                         对文本格式的解析在任意时刻都可复现, 不依赖编译器当前的 not-ready 前沿
//                         (那是随每次会话变化的, 硬编码一个"现在还不支持"的真实夹具会很快过期)
//   both_fail           — 两侧都编译失败且都不是 ZC_NOT_READY(真正的双坏, 非驱动间分歧)
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, chmodSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {startMcp, assertTrue} from "./mcp_client.ts";

const CHENG_ROOT = "/Users/lbcheng/cheng-lang";
const STAGE3 = `${CHENG_ROOT}/artifacts/bootstrap/cheng.stage3`;
const DRV27 = "/tmp/f23/DRV27";
const CANARY = `${CHENG_ROOT}/src/tests/ordinary_zero_exit_fixture.cheng`;
const DIVERGENT_FIXTURE = "/tmp/enum19/sweep/t26c_min.cheng";

function makeStubDriver(dir, name, script) {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/bash\n${script}\n`);
  chmodSync(path, 0o755);
  return path;
}

async function main() {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "fusion-harness-item5-")));
  try {
    const mcp = startMcp({}, CHENG_ROOT);
    try {
      await mcp.initialize({rootUri: `file://${CHENG_ROOT}`, workspaceFolders: [{uri: `file://${CHENG_ROOT}`, name: "cheng-lang"}]});

      console.log("[A] identical: stage3 vs stage3 上的平凡夹具");
      {
        const {isError, parsed} = await mcp.callTool("cheng_exec_diff", {fixture: CANARY, driverA: STAGE3, driverB: STAGE3, root: CHENG_ROOT}, undefined, 60000);
        assertTrue(isError !== true, `调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 300)}`);
        assertTrue(parsed.results?.[0]?.verdict === "identical", `verdict=identical, 实得 ${parsed.results?.[0]?.verdict}`);
        assertTrue(parsed.results[0].compileRcA === 0 && parsed.results[0].compileRcB === 0, `两侧编译都 rc=0`);
        assertTrue(parsed.results[0].runRcA === 0 && parsed.results[0].runRcB === 0, `两侧运行都 rc=0`);
        assertTrue(parsed.results[0].stdoutDigestA === parsed.results[0].stdoutDigestB, `stdout 摘要相同`);
        assertTrue(parsed.summary.identical === 1, `summary.identical=1`);
      }

      console.log("[B] semantic_divergence: 真实已知分歧 DRV27 vs stage3, t26c_min.cheng");
      {
        const {isError, parsed} = await mcp.callTool("cheng_exec_diff", {fixture: DIVERGENT_FIXTURE, driverA: DRV27, driverB: STAGE3, root: CHENG_ROOT}, undefined, 60000);
        assertTrue(isError !== true, `调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 300)}`);
        const result = parsed.results?.[0];
        assertTrue(result?.compileRcA === 0 && result?.compileRcB === 0, `两侧都编译成功(都是合法程序, 只是运行时行为不同), 实得 compileRcA=${result?.compileRcA} compileRcB=${result?.compileRcB}`);
        assertTrue(result?.verdict === "semantic_divergence", `verdict=semantic_divergence, 实得 ${result?.verdict} (stdoutA=${JSON.stringify(result?.runStdoutA)} stdoutB=${JSON.stringify(result?.runStdoutB)})`);
        assertTrue(result?.stdoutDigestA !== result?.stdoutDigestB, `两侧 stdout 摘要不同(DRV27 打印 156, stage3 打印 -100)`);
        assertTrue(parsed.summary.semantic_divergence === 1, `summary.semantic_divergence=1`);
        console.log(`  ok: A stdout=${JSON.stringify(result.runStdoutA)} B stdout=${JSON.stringify(result.runStdoutB)}`);
      }

      console.log("[C] compile_wall: 固定文本 stub driver 模拟 ZC_NOT_READY, 单列不算分歧");
      {
        const notReadyDriver = makeStubDriver(scratch, "stub_notready.sh", [
          'echo "ZC_NOT_READY idx=0/1 function=FakeTargetFn body_kind=return detail=none line=5 fz_kind=3 stmt_kind=2 bail=801 slot_diag=none" >&2',
          'echo "ZC_NOT_READY_TOTAL count=1" >&2',
          "exit 2",
        ].join("\n"));
        const {isError, parsed} = await mcp.callTool("cheng_exec_diff", {fixture: CANARY, driverA: notReadyDriver, driverB: STAGE3, root: CHENG_ROOT}, undefined, 30000);
        assertTrue(isError !== true, `调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 300)}`);
        const result = parsed.results?.[0];
        assertTrue(result?.verdict === "compile_wall", `verdict=compile_wall, 实得 ${result?.verdict}`);
        assertTrue(result?.notReady?.A?.entries?.length === 1, `notReady.A 解析出 1 条, 实得 ${JSON.stringify(result?.notReady?.A)}`);
        const entry = result.notReady.A.entries[0];
        assertTrue(entry.function === "FakeTargetFn" && entry.bodyKind === "return" && entry.bail === 801, `function/body_kind/bail 字段解析正确, 实得 ${JSON.stringify(entry)}`);
        assertTrue(result.notReady.A.total === 1, `total 取自 ZC_NOT_READY_TOTAL, 实得 ${result.notReady.A.total}`);
        assertTrue(parsed.summary.compile_wall === 1, `summary.compile_wall=1(不计入 semantic_divergence)`);
        assertTrue(parsed.summary.semantic_divergence === 0, `compile_wall 不误记为 semantic_divergence`);
      }

      console.log("[D] both_fail: 两侧都编译失败且都不含 ZC_NOT_READY(真双坏, 非分歧)");
      {
        const failDriverA = makeStubDriver(scratch, "stub_fail_a.sh", ['echo "fatal: unexpected token" 1>&2', "exit 1"].join("\n"));
        const failDriverB = makeStubDriver(scratch, "stub_fail_b.sh", ['echo "fatal: parse error" 1>&2', "exit 1"].join("\n"));
        const {isError, parsed} = await mcp.callTool("cheng_exec_diff", {fixture: CANARY, driverA: failDriverA, driverB: failDriverB, root: CHENG_ROOT}, undefined, 30000);
        assertTrue(isError !== true, `调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 300)}`);
        const result = parsed.results?.[0];
        assertTrue(result?.verdict === "both_fail", `verdict=both_fail, 实得 ${result?.verdict}`);
        assertTrue(!result?.notReady, `both_fail 不带 notReady 字段`);
        assertTrue(parsed.summary.both_fail === 1, `summary.both_fail=1`);
      }

      console.log("[E] 数组 fixture: 一次调用跑 2 个夹具(identical + semantic_divergence 混合), summary 计数正确");
      {
        const {isError, parsed} = await mcp.callTool("cheng_exec_diff", {fixture: [CANARY, DIVERGENT_FIXTURE], driverA: DRV27, driverB: STAGE3, root: CHENG_ROOT}, undefined, 60000);
        assertTrue(isError !== true, `调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 300)}`);
        assertTrue(parsed.results.length === 2, `results 长度=2, 实得 ${parsed.results.length}`);
        assertTrue(parsed.summary.identical + parsed.summary.semantic_divergence + parsed.summary.compile_wall + parsed.summary.both_fail === 2, `summary 计数总和=2`);
      }

      console.log("[F] schema 校验: 缺 root/driverA/driverB 报错而不是静默");
      {
        const {isError, parsed} = await mcp.callTool("cheng_exec_diff", {fixture: CANARY}, undefined, 10000);
        assertTrue(isError === true, `缺必填字段应报 isError, 实得 isError=${isError} parsed=${JSON.stringify(parsed).slice(0, 200)}`);
      }
    } finally {
      mcp.kill();
    }
  } finally {
    rmSync(scratch, {recursive: true, force: true});
  }
  console.log("item5 exec_diff: PASS");
}

main().catch((error) => {
  console.error("item5 exec_diff: FAIL", error);
  process.exit(1);
});
