// cheng_addr_symbolicate 端到端验证: 起真实 MCP server(本文件所在 clone/repo 自己的 index.ts,
// 用 import.meta.dir 解析而不是硬编码路径, 这样无论跑在哪个 clone 里都测的是自己这份改动),
// 用今晚真崩溃 GEN2/GEN2.primary.o/0x100ee84f8 做金标向量。
//   [A] 金标崩溃地址: 恰好唯一命中, 符号=_InternPoolRelease, symbolOffset=0x44, confidence=high。
//   [B] 交叉验证: otool -tV 反汇编 primary.o 在命中偏移处的指令窗口, 与 lldb 反汇编 exe 在
//       address 处的指令窗口逐条一致(独立于本工具的判定路径)。
//   [C] 负例: 假地址(header 区, 0x100000000)诚实 miss, 不猜。
//   [D] tools/list 能看到新工具。
//   [E] schema 校验: 未知字段被拒绝; 不存在路径报错; 相对路径报错。
import {spawn} from "node:child_process";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = join(HERE, "..", "index.ts");
const RUN = "/Users/lbcheng/cheng-f24/chain_runs/ignite_20260717T214635_f91128";
const GEN2 = `${RUN}/GEN2`;
const GEN2_O = `${RUN}/GEN2.primary.o`;

function startMcp() {
  const child = spawn("bun", [ENTRY], {stdio: ["pipe", "pipe", "pipe"]});
  let stdout = "";
  let stderr = "";
  let id = 1;
  const pending = new Map<number, (m: any) => void>();
  child.stderr.on("data", (c) => { stderr += c.toString("utf8"); });
  child.stdout.on("data", (c) => {
    stdout += c.toString("utf8");
    for (;;) {
      const nl = stdout.indexOf("\n");
      if (nl < 0) break;
      const line = stdout.slice(0, nl).trim();
      stdout = stdout.slice(nl + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      const waiter = pending.get(message.id);
      if (waiter) { pending.delete(message.id); waiter(message); }
    }
  });
  function request(method: string, params: any, timeoutMs = 20000): Promise<any> {
    const requestId = id++;
    child.stdin.write(JSON.stringify({jsonrpc: "2.0", id: requestId, method, params}) + "\n");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`wait for ${method} timed out after ${timeoutMs}ms (stderr tail: ${stderr.slice(-2000)})`));
      }, timeoutMs);
      pending.set(requestId, (m) => { clearTimeout(timer); resolve(m); });
    });
  }
  async function callTool(name: string, args: any, timeoutMs = 20000) {
    const response = await request("tools/call", {name, arguments: args}, timeoutMs);
    if (response.error) throw new Error(`JSON-RPC error for ${name}: ${JSON.stringify(response.error)}`);
    const text = response.result?.content?.[0]?.text || "";
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return {isError: Boolean(response.result?.isError), parsed};
  }
  return {child, request, callTool, kill: () => { try { child.kill("SIGKILL"); } catch {} }};
}

function assertTrue(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ok: ${msg}`);
}

async function main() {
  const mcp = startMcp();
  try {
    await mcp.request("initialize", {protocolVersion: "2025-11-25", capabilities: {}, clientInfo: {name: "item14-harness", version: "1"}});

    console.log("[D] tools/list includes cheng_addr_symbolicate");
    {
      const response = await mcp.request("tools/list", {});
      const names = (response.result?.tools || []).map((t: any) => t.name);
      assertTrue(names.includes("cheng_addr_symbolicate"), `tools/list has cheng_addr_symbolicate, got ${names.length} tools`);
      const tool = response.result.tools.find((t: any) => t.name === "cheng_addr_symbolicate");
      assertTrue(tool.annotations.readOnlyHint === true, "cheng_addr_symbolicate is annotated read-only");
    }

    console.log("[A] golden crash 0x100ee84f8 resolves to a unique symbol");
    let goldenSymbol = "";
    let goldenOffset = -1;
    {
      const {isError, parsed} = await mcp.callTool("cheng_addr_symbolicate", {binaryPath: GEN2, objectPath: GEN2_O, address: "0x100ee84f8"});
      assertTrue(isError !== true, `no error, got: ${JSON.stringify(parsed).slice(0, 500)}`);
      assertTrue(parsed.schema === "cheng_addr_symbolicate.v1", `schema correct, got ${parsed.schema}`);
      assertTrue(parsed.matchCount === 1, `matchCount===1, got ${parsed.matchCount}`);
      assertTrue(parsed.confidence === "high", `confidence=high, got ${parsed.confidence}`);
      assertTrue(typeof parsed.symbol === "string" && parsed.symbol.length > 0, `symbol resolved, got ${parsed.symbol}`);
      assertTrue(typeof parsed.symbolOffset === "number" && parsed.symbolOffset >= 0, `symbolOffset is a non-negative number, got ${parsed.symbolOffset}`);
      goldenSymbol = parsed.symbol;
      goldenOffset = parsed.symbolOffset;
      console.log(`  -> symbol=${goldenSymbol} symbolOffset=0x${goldenOffset.toString(16)} windowSize=${parsed.windowSize}`);
    }

    console.log("[B] cross-validation: otool -tV disasm of primary.o at the matched offset == lldb disasm of exe at the address, instruction-for-instruction");
    {
      const normalizeInsn = (s: string) => s.replace(/\s+/g, " ").trim();
      const lldbOut = execFileSync("lldb", ["-b", "-o", `target create ${GEN2}`, "-o", `disassemble -s 0x100ee84f8 -c 6`, "-o", "quit"], {encoding: "utf8"});
      const exeLines = lldbOut.split("\n").filter((l) => l.trim().startsWith("GEN2[")).map((l) => normalizeInsn(l.replace(/^GEN2\[0x[0-9a-f]+\]:\s*/, "")));
      assertTrue(exeLines.length >= 6, `lldb disasm of exe produced >=6 lines, got ${exeLines.length}`);

      const otoolOut = execFileSync("otool", ["-tV", GEN2_O], {encoding: "utf8", maxBuffer: 1 << 30});
      const lines = otoolOut.split("\n");
      const labelIdx = lines.findIndex((l) => l === `${goldenSymbol}:`);
      assertTrue(labelIdx >= 0, `otool -tV has a ${goldenSymbol}: label`);
      // 从函数标签往后数, 用 symbolOffset 找到匹配那条指令所在行(每行形如 "<addr>\t<mnemonic>\t<operands>")
      const startAddrLine = lines[labelIdx + 1];
      const startAddr = parseInt(startAddrLine.split("\t")[0], 16);
      const targetAddr = startAddr + goldenOffset;
      const targetHex = targetAddr.toString(16).padStart(16, "0");
      const targetLineIdx = lines.findIndex((l, i) => i > labelIdx && l.startsWith(targetHex));
      assertTrue(targetLineIdx >= 0, `found the matched-offset instruction line in otool -tV output at ${targetHex}`);
      const objLines = lines.slice(targetLineIdx, targetLineIdx + 6).map((l) => normalizeInsn(l.split("\t").slice(1).join(" ")));
      assertTrue(JSON.stringify(objLines) === JSON.stringify(exeLines), `otool -tV(.o) instructions == lldb disasm(exe) instructions, got obj=${JSON.stringify(objLines)} vs exe=${JSON.stringify(exeLines)}`);
    }

    console.log("[C] negative example: header-region fake address 0x100000000 is an honest miss");
    {
      const {isError, parsed} = await mcp.callTool("cheng_addr_symbolicate", {binaryPath: GEN2, objectPath: GEN2_O, address: "0x100000000"});
      assertTrue(isError !== true, `no error (a miss is not a tool error), got: ${JSON.stringify(parsed).slice(0, 300)}`);
      assertTrue(parsed.symbol === null, `symbol is null for header-region address, got ${parsed.symbol}`);
      assertTrue(parsed.matchCount === 0, `matchCount===0, got ${parsed.matchCount}`);
      assertTrue(parsed.confidence === "none", `confidence=none, got ${parsed.confidence}`);
      assertTrue(parsed.reason === "address_outside_text_section", `reason explains why, got ${parsed.reason}`);
    }

    console.log("[E] error paths: unknown field, missing binary, relative path");
    {
      const {isError: e1} = await mcp.callTool("cheng_addr_symbolicate", {binaryPath: GEN2, objectPath: GEN2_O, address: "0x100ee84f8", bogus: 1});
      assertTrue(e1 === true, "unknown field rejected");

      const {isError: e2, parsed: p2} = await mcp.callTool("cheng_addr_symbolicate", {binaryPath: "/tmp/does_not_exist_gen2_xyz", objectPath: GEN2_O, address: "0x1"});
      assertTrue(e2 === true && String(p2).includes("not found"), `missing binaryPath rejected, got ${p2}`);

      const {isError: e3, parsed: p3} = await mcp.callTool("cheng_addr_symbolicate", {binaryPath: "GEN2", objectPath: GEN2_O, address: "0x1"});
      assertTrue(e3 === true && String(p3).includes("absolute"), `relative binaryPath rejected, got ${p3}`);
    }
  } finally {
    mcp.kill();
  }
  console.log("item14 addr_symbolicate: PASS");
}

main().catch((error) => {
  console.error("item14 addr_symbolicate: FAIL", error);
  process.exit(1);
});
