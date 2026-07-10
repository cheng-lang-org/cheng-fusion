// 工具3: cheng_template_leak_audit — 模板泄漏神谕。
//
// 真实端到端: 起真实 MCP server, 对一个真实的 .primary.o 跑 nm + objdump + 回源, 断言:
//  (a) 错误路径: objectPath 不存在 -> isError=true, 消息里带路径。
//  (b) 若 /tmp/f23/GEN2L.primary.o 这个真实构建产物还在(过去会话真编译产物, 非本次伪造),
//      对它跑真实审计, 断言结构正确 + 已知的两个泛型泄漏符号(std/result.cheng 的
//      Value[T]/ErrorInfoOf[T])被正确回源到 sourceFile/line/signature, verdict 是合法枚举值,
//      callEdges 与 objdump -r 直接统计一致, 且如实断言当前 invariantHeld 状态(不预设已修)。
//  (c) 若该临时构建产物已被清理, 只做 (a) 并跳过 (b), 不伪造数据。
import {existsSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {startMcp, assertTrue} from "./mcp_client.ts";

const CHENG_ROOT = "/Users/lbcheng/cheng-lang";
const REAL_FIXTURE_OBJECT = "/tmp/f23/GEN2L.primary.o";

function objdumpBranch26Count(objectPath: string, symbol: string): number {
  const out = execFileSync("objdump", ["-r", objectPath], {encoding: "utf8", maxBuffer: 1 << 29});
  let count = 0;
  for (const line of out.split("\n")) {
    if (line.includes("ARM64_RELOC_BRANCH26") && line.trim().endsWith(symbol)) count++;
  }
  return count;
}

async function main() {
  const mcp = startMcp({}, CHENG_ROOT);
  try {
    await mcp.initialize({rootUri: `file://${CHENG_ROOT}`, workspaceFolders: [{uri: `file://${CHENG_ROOT}`, name: "cheng-lang"}]});

    console.log("[A] 不存在的 objectPath -> 明确报错, 不静默返回空结果");
    {
      const {isError, parsed} = await mcp.callTool("cheng_template_leak_audit", {objectPath: "/tmp/definitely_missing_xyz.primary.o"});
      assertTrue(isError === true, `不存在的 objectPath 应报错, 实得 isError=${isError}`);
      assertTrue(String(parsed).includes("not found"), `错误信息应指出文件不存在, 实得: ${JSON.stringify(parsed).slice(0, 200)}`);
    }

    if (!existsSync(REAL_FIXTURE_OBJECT)) {
      console.log(`[B] 跳过: 真实构建产物 ${REAL_FIXTURE_OBJECT} 当前不在(过去会话临时产物已被清理), 不伪造数据`);
      console.log("item7 template_leak_audit: PASS (partial: fixture absent)");
      return;
    }

    console.log(`[B] 对真实构建产物 ${REAL_FIXTURE_OBJECT} 跑真实审计`);
    const {isError, parsed} = await mcp.callTool("cheng_template_leak_audit", {objectPath: REAL_FIXTURE_OBJECT, root: CHENG_ROOT}, undefined, 30000);
    assertTrue(isError !== true, `真实审计不应报错, 实得: ${JSON.stringify(parsed).slice(0, 300)}`);
    assertTrue(parsed.schema === "cheng_template_leak_audit.v1", `schema 正确, 实得 ${parsed.schema}`);
    assertTrue(parsed.scannedMangledSymbolCount > 400, `扫描到大量 __L mangled T 符号(真实大对象), 实得 ${parsed.scannedMangledSymbolCount}`);
    assertTrue(Array.isArray(parsed.leaks), "leaks 是数组");
    assertTrue(parsed.invariantHeld === (parsed.liveLeakCount === 0), `invariantHeld 与 liveLeakCount==0 一致, 实得 invariantHeld=${parsed.invariantHeld} liveLeakCount=${parsed.liveLeakCount}`);
    for (const leak of parsed.leaks) {
      assertTrue(leak.verdict === "live_leak" || leak.verdict === "dead_weight", `verdict 是合法枚举值, 实得 ${leak.verdict}`);
      assertTrue(leak.genericParams?.length > 0 && leak.leakPositions?.length > 0, `每条 leak 都确实带裸泛型参数出现位置, 实得: ${JSON.stringify(leak)}`);
      assertTrue(leak.callEdges === objdumpBranch26Count(REAL_FIXTURE_OBJECT, leak.symbol), `callEdges 与 objdump -r 独立复算一致(symbol=${leak.symbol}), 实得 ${leak.callEdges}`);
    }

    console.log("  已知两个泛型符号(std/result.cheng Value[T]/ErrorInfoOf[T])应在 leaks 中被正确回源");
    const value = parsed.leaks.find((l: any) => l.symbol === "_std_result__Value__L78");
    const errorInfoOf = parsed.leaks.find((l: any) => l.symbol === "_std_result__ErrorInfoOf__L81");
    assertTrue(!!value, `Value__L78 出现在 leaks 中, 实得 leaks=${JSON.stringify(parsed.leaks.map((l: any) => l.symbol))}`);
    assertTrue(!!errorInfoOf, `ErrorInfoOf__L81 出现在 leaks 中`);
    assertTrue(value.sourceFile === "src/std/result.cheng" && value.line === 78, `Value 回源正确, 实得 ${value.sourceFile}:${value.line}`);
    assertTrue(errorInfoOf.sourceFile === "src/std/result.cheng" && errorInfoOf.line === 81, `ErrorInfoOf 回源正确, 实得 ${errorInfoOf.sourceFile}:${errorInfoOf.line}`);
    assertTrue(value.signature === "fn Value[T](r: var Result[T]): T =", `Value 签名原样摘录, 实得: ${value.signature}`);
    assertTrue(errorInfoOf.signature === "fn ErrorInfoOf[T](r: var Result[T]): ErrorInfo =", `ErrorInfoOf 签名原样摘录, 实得: ${errorInfoOf.signature}`);

    console.log(`  如实断言当前态: liveLeakCount=${parsed.liveLeakCount} invariantHeld=${parsed.invariantHeld} (不预设已修, 只报真实值)`);
  } finally {
    mcp.kill();
  }
  console.log("item7 template_leak_audit: PASS");
}

main().catch((error) => {
  console.error("item7 template_leak_audit: FAIL", error);
  process.exit(1);
});
