// 共享 MCP stdio JSON-RPC 客户端: 起 cheng-fusion-mcp.ts 子进程, 发 initialize + tools/call, 收行分隔 JSON。
// 不依赖交互会话, 纯 bun 脚本可独立跑。
import {spawn} from "node:child_process";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {verifyInheritedParentGuardForChild} from "../src/cheng_toolkit_m9000.ts";

const PROJECT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = join(PROJECT, "index.ts");

export function startMcp(env: Record<string, string> = {}, cwd: string = PROJECT) {
  const inheritedProof = verifyInheritedParentGuardForChild();
  const childEnv = {...process.env, ...env} as Record<string, string>;
  if (inheritedProof) {
    for (const key of [
      "BEAT_C_GUARD_PARENT_CAPABILITY",
      "BEAT_C_GUARD_PARENT_MONITOR_PID",
      "BEAT_C_GUARD_PARENT_LIMIT_BYTES",
      "BEAT_C_GUARD_PARENT_PROOF_FD",
    ]) {
      if (Object.hasOwn(env, key) && env[key] !== process.env[key]) {
        throw new Error(`startMcp cannot replace verified parent-guard field: ${key}`);
      }
      childEnv[key] = String(process.env[key]);
    }
  }
  const child = spawn("bun", [ENTRY], {
    cwd,
    stdio: inheritedProof
      ? ["pipe", "pipe", "pipe", inheritedProof.proofFd]
      : ["pipe", "pipe", "pipe"],
    env: childEnv as any,
  });
  let stdout = "";
  let stderr = "";
  let id = 1;
  const pending = new Map<number, (message: any) => void>();
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
    for (;;) {
      const nl = stdout.indexOf("\n");
      if (nl < 0) break;
      const line = stdout.slice(0, nl).trim();
      stdout = stdout.slice(nl + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        waiter(message);
      }
    }
  });
  function request(method: string, params: any, timeoutMs = 25000): Promise<any> {
    const requestId = id++;
    child.stdin.write(JSON.stringify({jsonrpc: "2.0", id: requestId, method, params}) + "\n");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`harness-side wait for ${method} timed out after ${timeoutMs}ms (server stderr tail: ${stderr.slice(-2000)})`));
      }, timeoutMs);
      pending.set(requestId, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
  }
  async function callTool(name: string, args: any, meta?: any, timeoutMs = 25000) {
    const response = await request("tools/call", {name, arguments: args, ...(meta ? {_meta: meta} : {})}, timeoutMs);
    if (response.error) throw new Error(`JSON-RPC error for ${name}: ${JSON.stringify(response.error)}`);
    const text = response.result?.content?.[0]?.text || "";
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return {isError: Boolean(response.result?.isError), parsed, raw: response.result};
  }
  async function initialize(params: any = {}) {
    return request("initialize", {protocolVersion: "2025-11-25", capabilities: {}, clientInfo: {name: "fusion-harness", version: "1"}, ...params});
  }
  function getStderr() { return stderr; }
  function kill() { try { child.kill("SIGKILL"); } catch {} }
  return {child, request, callTool, initialize, kill, getStderr};
}

export function assertTrue(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
  console.log(`  ok: ${message}`);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
