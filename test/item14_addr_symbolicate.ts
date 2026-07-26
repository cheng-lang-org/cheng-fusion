// cheng_addr_symbolicate 端到端验证: 起真实 MCP server，并把仓内 AArch64 汇编 fixture
// 编译为真实 Mach-O object/executable；fresh clone 不依赖历史 chain run。
//   [A] 金标地址: 恰好唯一命中同址符号, symbolOffset=0, confidence=high。
//   [B] 交叉验证: otool -tV 反汇编 primary.o 在命中偏移处的指令窗口, 与 lldb 反汇编 exe 在
//       address 处的指令窗口逐条一致(独立于本工具的判定路径)。
//   [C] 负例: 假地址(header 区, 0x100000000)诚实 miss, 不猜。
//   [D] tools/list 能看到新工具。
//   [E] schema 校验: 未知字段被拒绝; 不存在路径报错; 相对路径报错。
import {spawn} from "node:child_process";
import assert from "node:assert/strict";
import {mkdtempSync, realpathSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import {assertAddrSymbolicateReportSchema} from "../src/cheng_addr_symbolicate_m9021.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = join(HERE, "..", "index.ts");
const FIXTURE_SOURCE = join(HERE, "..", "fixtures", "addr_symbolicate", "golden.s");

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
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "fusion-harness-item14-")));
  try {
    const EXE = join(scratch, "golden.exe");
    const PRIMARY_O = join(scratch, "golden.primary.o");
    execFileSync("clang", ["-arch", "arm64", "-c", FIXTURE_SOURCE, "-o", PRIMARY_O]);
    execFileSync("clang", ["-arch", "arm64", PRIMARY_O, "-o", EXE]);
    const nmOut = execFileSync("nm", ["-n", EXE], {encoding: "utf8"});
    const goldenMatch = nmOut.match(/^([0-9a-fA-F]{16})\s+T\s+_fixture_symbol$/m);
    assertTrue(goldenMatch !== null, `linked fixture exposes _fixture_symbol: ${EXE}`);
    const GOLDEN_ADDRESS = `0x${goldenMatch[1]}`;

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

      console.log(`[A] golden address ${GOLDEN_ADDRESS} resolves to a unique symbol`);
      let goldenSymbol = "";
      let goldenOffset = -1;
      {
        const {isError, parsed} = await mcp.callTool("cheng_addr_symbolicate", {binaryPath: EXE, objectPath: PRIMARY_O, address: GOLDEN_ADDRESS});
        assertTrue(isError !== true, `no error, got: ${JSON.stringify(parsed).slice(0, 500)}`);
        assertTrue(parsed.schema === "cheng_addr_symbolicate", `schema correct, got ${parsed.schema}`);
        assert.throws(
          () => assertAddrSymbolicateReportSchema({...parsed, schema: "cheng_addr_symbolicate.v1"}),
          /unsupported address symbolicate report schema/,
          "legacy address-symbolicate report schema must be rejected",
        );
        assertTrue(parsed.matchCount === 1, `matchCount===1, got ${parsed.matchCount}`);
        assertTrue(parsed.confidence === "high", `confidence=high, got ${parsed.confidence}`);
        assertTrue(typeof parsed.symbol === "string" && parsed.symbol.length > 0, `symbol resolved, got ${parsed.symbol}`);
        assertTrue(typeof parsed.symbolOffset === "number" && parsed.symbolOffset >= 0, `symbolOffset is a non-negative number, got ${parsed.symbolOffset}`);
        assertTrue(parsed.symbolOffset === 0, `repository golden vector resolves at exact function start, got ${parsed.symbol}+0x${parsed.symbolOffset.toString(16)}`);
        goldenSymbol = parsed.symbol;
        goldenOffset = parsed.symbolOffset;
        console.log(`  -> symbol=${goldenSymbol} symbolOffset=0x${goldenOffset.toString(16)} windowSize=${parsed.windowSize}`);
      }

      console.log("[B] cross-validation: otool -tV disasm of primary.o at the matched offset == lldb disasm of exe at the address, instruction-for-instruction");
      {
        const normalizeInsn = (s: string) => s.replace(/\s+/g, " ").trim();
        const lldbOut = execFileSync("lldb", ["-b", "-o", `target create ${EXE}`, "-o", `disassemble -s ${GOLDEN_ADDRESS} -c 6`, "-o", "quit"], {encoding: "utf8"});
        const exeLines = lldbOut
          .split("\n")
          .filter((l) => l.includes("[0x"))
          .map((l) => normalizeInsn(l.replace(/^.*\]\s+<[^>]+>:\s*/, "").replace(/\s+;.*$/, "")));
        assertTrue(exeLines.length >= 6, `lldb disasm of exe produced >=6 lines, got ${exeLines.length}`);

        const otoolOut = execFileSync("otool", ["-tV", PRIMARY_O], {encoding: "utf8", maxBuffer: 1 << 30});
        const lines = otoolOut.split("\n");
        const labelIdx = lines.findIndex((l) => l === "_fixture_symbol:");
        assertTrue(labelIdx >= 0, "otool -tV has the fixture function label");
        const startAddrLine = lines[labelIdx + 1];
        const startAddr = parseInt(startAddrLine.split("\t")[0], 16);
        const targetAddr = startAddr + goldenOffset;
        const targetHex = targetAddr.toString(16).padStart(16, "0");
        const targetLineIdx = lines.findIndex((l, i) => i > labelIdx && l.startsWith(targetHex));
        assertTrue(targetLineIdx >= 0, `found the matched-offset instruction line in otool -tV output at ${targetHex}`);
        const objLines = lines.slice(targetLineIdx, targetLineIdx + 6).map((l) => normalizeInsn(l.split("\t").slice(1).join(" ")));
        assertTrue(JSON.stringify(objLines) === JSON.stringify(exeLines), `otool -tV(.o) instructions == lldb disasm(exe) instructions, got obj=${JSON.stringify(objLines)} vs exe=${JSON.stringify(exeLines)}`);
      }

      console.log("[C] negative example: address zero is an honest miss");
      {
        const {isError, parsed} = await mcp.callTool("cheng_addr_symbolicate", {binaryPath: EXE, objectPath: PRIMARY_O, address: "0x0"});
        assertTrue(isError !== true, `no error (a miss is not a tool error), got: ${JSON.stringify(parsed).slice(0, 300)}`);
        assertTrue(parsed.symbol === null, `symbol is null for header-region address, got ${parsed.symbol}`);
        assertTrue(parsed.matchCount === 0, `matchCount===0, got ${parsed.matchCount}`);
        assertTrue(parsed.confidence === "none", `confidence=none, got ${parsed.confidence}`);
        assertTrue(parsed.reason === "address_outside_text_section", `reason explains why, got ${parsed.reason}`);
      }

      console.log("[E] error paths: unknown field, missing binary, relative path");
      {
        const {isError: e1} = await mcp.callTool("cheng_addr_symbolicate", {binaryPath: EXE, objectPath: PRIMARY_O, address: GOLDEN_ADDRESS, bogus: 1});
        assertTrue(e1 === true, "unknown field rejected");

        const {isError: e2, parsed: p2} = await mcp.callTool("cheng_addr_symbolicate", {binaryPath: "/tmp/does_not_exist_gen2_xyz", objectPath: PRIMARY_O, address: "0x1"});
        assertTrue(e2 === true && String(p2).includes("not found"), `missing binaryPath rejected, got ${p2}`);

        const {isError: e3, parsed: p3} = await mcp.callTool("cheng_addr_symbolicate", {binaryPath: "GEN2", objectPath: PRIMARY_O, address: "0x1"});
        assertTrue(e3 === true && String(p3).includes("absolute"), `relative binaryPath rejected, got ${p3}`);
      }
    } finally {
      mcp.kill();
    }
  } finally {
    rmSync(scratch, {recursive: true, force: true});
  }
  console.log("item14 addr_symbolicate: PASS");
}

main().catch((error) => {
  console.error("item14 addr_symbolicate: FAIL", error);
  process.exit(1);
});
