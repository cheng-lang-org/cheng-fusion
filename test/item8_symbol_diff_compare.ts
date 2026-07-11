// cheng_symbol_diff action:compare 端到端验证: 起真实 MCP server, 用真实构建产物
// (/tmp/f23/GEN2U.primary.o 完整编译器世代 3629 个 T 符号, vs /tmp/f23/t_g12_drv42.exe.primary.o
// 一个 27 符号的小程序 driver)断言 defined 全局 T 符号差分结构正确: onlyInA/onlyInB/common
// 计数自洽、common 默认不带全量列表、前缀聚类摘要非空、以及原有 action:snapshot 未被破坏。
import {startMcp, assertTrue} from "./mcp_client.ts";

const CHENG_ROOT = "/Users/lbcheng/cheng-lang";
const OBJECT_A = "/tmp/f23/GEN2U.primary.o";
const OBJECT_B = "/tmp/f23/t_g12_drv42.exe.primary.o";

async function main() {
  const mcp = startMcp({}, CHENG_ROOT);
  try {
    await mcp.initialize({rootUri: `file://${CHENG_ROOT}`, workspaceFolders: [{uri: `file://${CHENG_ROOT}`, name: "cheng-lang"}]});

    console.log("[A] compare: 两个真实 .primary.o 世代, 计数自洽 + common 默认不带全量列表");
    {
      const {isError, parsed} = await mcp.callTool("cheng_symbol_diff", {action: "compare", objectA: OBJECT_A, objectB: OBJECT_B}, undefined, 30000);
      assertTrue(isError !== true, `调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 300)}`);
      assertTrue(parsed.schema === "cheng_symbol_diff_compare.v1", `schema 正确, 实得 ${parsed.schema}`);
      assertTrue(parsed.countA === 3629, `countA=3629(GEN2U.primary.o 全量 T 符号数), 实得 ${parsed.countA}`);
      assertTrue(parsed.countB === 27, `countB=27(小 driver), 实得 ${parsed.countB}`);
      assertTrue(parsed.countOnlyInA + parsed.countCommon === parsed.countA, `onlyInA+common=countA, 实得 ${parsed.countOnlyInA}+${parsed.countCommon} vs ${parsed.countA}`);
      assertTrue(parsed.countOnlyInB + parsed.countCommon === parsed.countB, `onlyInB+common=countB, 实得 ${parsed.countOnlyInB}+${parsed.countCommon} vs ${parsed.countB}`);
      assertTrue(Array.isArray(parsed.onlyInA) && parsed.onlyInA.length === Math.min(parsed.countOnlyInA, 2000), `onlyInA 列表长度=min(countOnlyInA,默认limit 2000), 实得 ${parsed.onlyInA?.length} vs ${parsed.countOnlyInA}`);
      assertTrue(parsed.onlyInATruncated === (parsed.countOnlyInA > 2000), `onlyInATruncated 与默认 2000 封顶一致, 实得 ${parsed.onlyInATruncated} countOnlyInA=${parsed.countOnlyInA}`);
      assertTrue(Array.isArray(parsed.onlyInB) && parsed.onlyInB.length === parsed.countOnlyInB, `onlyInB 列表长度=countOnlyInB(远小于默认 limit, 未截断), 实得 ${parsed.onlyInB?.length} vs ${parsed.countOnlyInB}`);
      assertTrue(parsed.onlyInBTruncated === false, `onlyInB 未被默认 limit 截断, 实得 ${parsed.onlyInBTruncated}`);
      assertTrue(!("common" in parsed), `common 默认不带全量列表(includeCommon 未传, key 不应出现), 实得 keys=${Object.keys(parsed).join(",")}`);
      assertTrue(parsed.countCommon > 0, `两侧真实有共享 runtime 符号(如 _main 之外的 std_ 系), 实得 countCommon=${parsed.countCommon}`);
      assertTrue(parsed.onlyInB.includes("_G12DebugStage"), `_G12DebugStage 是小 driver 自身入口, 只应出现在 onlyInB, 实得 ${JSON.stringify(parsed.onlyInB)}`);
      assertTrue(!parsed.onlyInB.includes("_main"), `_main 两侧都定义, 应落在 common 而非 onlyInB, 实得 onlyInB含_main=${parsed.onlyInB.includes("_main")}`);
      const primaryCluster = parsed.clustersOnlyInA.find((c) => c.prefix === "Primary");
      assertTrue(primaryCluster && primaryCluster.count > 0, `clustersOnlyInA 含 Primary 前缀聚类且计数>0, 实得 ${JSON.stringify(parsed.clustersOnlyInA.slice(0, 3))}`);
      const sorted = [...parsed.clustersOnlyInA].sort((x, y) => y.count - x.count);
      assertTrue(JSON.stringify(sorted) === JSON.stringify(parsed.clustersOnlyInA), `clustersOnlyInA 按 count 降序排列`);
      console.log(`  ok: countA=${parsed.countA} countB=${parsed.countB} onlyInA=${parsed.countOnlyInA} onlyInB=${parsed.countOnlyInB} common=${parsed.countCommon}`);
    }

    console.log("[B] includeCommon:true 显式要价, 全量 common 列表出现且长度=countCommon");
    {
      const {isError, parsed} = await mcp.callTool("cheng_symbol_diff", {action: "compare", objectA: OBJECT_A, objectB: OBJECT_B, includeCommon: true}, undefined, 30000);
      assertTrue(isError !== true, `调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 300)}`);
      assertTrue(Array.isArray(parsed.common) && parsed.common.length === parsed.countCommon, `common 列表长度=countCommon, 实得 ${parsed.common?.length} vs ${parsed.countCommon}`);
    }

    console.log("[C] limit 截断 onlyInA 并标记 onlyInATruncated");
    {
      const {isError, parsed} = await mcp.callTool("cheng_symbol_diff", {action: "compare", objectA: OBJECT_A, objectB: OBJECT_B, limit: 10}, undefined, 30000);
      assertTrue(isError !== true, `调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 300)}`);
      assertTrue(parsed.onlyInA.length === 10, `onlyInA 被 limit=10 截断, 实得长度 ${parsed.onlyInA.length}`);
      assertTrue(parsed.onlyInATruncated === true, `onlyInATruncated=true, 实得 ${parsed.onlyInATruncated}`);
      assertTrue(parsed.countOnlyInA > 10, `countOnlyInA 仍报真实全量, 实得 ${parsed.countOnlyInA}`);
    }

    console.log("[D] 反向比较 objectA/objectB 交换后 onlyInA/onlyInB 对调");
    {
      const forward = await mcp.callTool("cheng_symbol_diff", {action: "compare", objectA: OBJECT_A, objectB: OBJECT_B}, undefined, 30000);
      const reverse = await mcp.callTool("cheng_symbol_diff", {action: "compare", objectA: OBJECT_B, objectB: OBJECT_A}, undefined, 30000);
      assertTrue(forward.parsed.countOnlyInA === reverse.parsed.countOnlyInB, `交换后 onlyInA/onlyInB 计数对调, 实得 ${forward.parsed.countOnlyInA} vs ${reverse.parsed.countOnlyInB}`);
      assertTrue(forward.parsed.countOnlyInB === reverse.parsed.countOnlyInA, `交换后 onlyInB/onlyInA 计数对调, 实得 ${forward.parsed.countOnlyInB} vs ${reverse.parsed.countOnlyInA}`);
      assertTrue(forward.parsed.countCommon === reverse.parsed.countCommon, `交换后 common 计数不变, 实得 ${forward.parsed.countCommon} vs ${reverse.parsed.countCommon}`);
    }

    console.log("[E] 不存在的路径报错而不是静默");
    {
      const {isError, parsed} = await mcp.callTool("cheng_symbol_diff", {action: "compare", objectA: "/tmp/f23/does_not_exist.o", objectB: OBJECT_B}, undefined, 10000);
      assertTrue(isError === true, `不存在路径应报 isError, 实得 isError=${isError} parsed=${JSON.stringify(parsed).slice(0, 200)}`);
    }

    console.log("[F] 既有 action:snapshot 未被破坏(回归)");
    {
      const {isError, parsed} = await mcp.callTool("cheng_symbol_diff", {action: "snapshot"}, undefined, 30000);
      assertTrue(isError !== true, `调用未报错, 实得: ${JSON.stringify(parsed).slice(0, 300)}`);
      assertTrue(parsed.schema === "cheng_symbols_v1", `snapshot schema 未回归, 实得 ${parsed.schema}`);
      assertTrue(typeof parsed.primaryUnsupportCount === "number", `primaryUnsupportCount 是数字, 实得 ${parsed.primaryUnsupportCount}`);
    }
  } finally {
    mcp.kill();
  }
  console.log("item8 symbol_diff compare: PASS");
}

main().catch((error) => {
  console.error("item8 symbol_diff compare: FAIL", error);
  process.exit(1);
});
