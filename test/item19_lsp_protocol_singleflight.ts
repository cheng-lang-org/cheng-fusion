import {mkdtempSync, readFileSync, realpathSync, rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {JsonRpcChild} from "../cli.ts";
import {
  JsonRpcProcessClient,
  chengLspEnsureClient,
  chengLspSyncDoc,
} from "../src/cheng_toolkit_m9000.ts";
import {JsonRpcFrameDecoder} from "../src/json_rpc_frame_decoder.ts";
import {assertTrue, sleep} from "./mcp_client.ts";

const CHENG_ROOT = realpathSync(process.env.CHENG_TOOLCHAIN_ROOT || process.env.CHENG_ROOT || "/Users/lbcheng/cheng-lang");
const SOURCE = join(CHENG_ROOT, "src/tests/ordinary_zero_exit_fixture.cheng");

function assertThrows(label: string, action: () => void, pattern: RegExp) {
  let failure: unknown = null;
  try {
    action();
  } catch (error) {
    failure = error;
  }
  assertTrue(failure instanceof Error && pattern.test(failure.message), `${label}: expected ${pattern}, got ${failure instanceof Error ? failure.message : String(failure)}`);
}

async function assertRejects(label: string, action: Promise<unknown>, pattern: RegExp) {
  let failure: unknown = null;
  try {
    await action;
  } catch (error) {
    failure = error;
  }
  assertTrue(failure instanceof Error && pattern.test(failure.message), `${label}: expected rejection ${pattern}, got ${failure instanceof Error ? failure.message : String(failure)}`);
}

function frame(value: unknown) {
  const body = JSON.stringify(value);
  return Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

function testBoundedStrictDecoder() {
  console.log("[A] strict bounded Content-Length/JSONL decoder");
  const received: unknown[] = [];
  const valid = frame({jsonrpc: "2.0", id: 1, result: {ok: true}});
  const decoder = new JsonRpcFrameDecoder({framing: "content-length", maxHeaderBytes: 64, maxFrameBytes: 256, label: "test-rpc"});
  for (const byte of valid) decoder.push(Buffer.from([byte]), (message) => received.push(message));
  assertTrue(received.length === 1 && (received[0] as any).result.ok === true, "fragmented valid Content-Length frame is decoded exactly once");

  assertThrows("duplicate Content-Length", () => {
    new JsonRpcFrameDecoder({framing: "content-length", maxHeaderBytes: 64, maxFrameBytes: 256, label: "test-rpc"})
      .push("Content-Length: 2\r\ncontent-length: 2\r\n\r\n{}", () => {});
  }, /exactly one Content-Length/);
  assertThrows("unsafe Content-Length", () => {
    new JsonRpcFrameDecoder({framing: "content-length", maxHeaderBytes: 64, maxFrameBytes: 256, label: "test-rpc"})
      .push("Content-Length: 9007199254740993\r\n\r\n", () => {});
  }, /invalid Content-Length/);
  assertThrows("oversized Content-Length", () => {
    new JsonRpcFrameDecoder({framing: "content-length", maxHeaderBytes: 64, maxFrameBytes: 256, label: "test-rpc"})
      .push("Content-Length: 257\r\n\r\n", () => {});
  }, /invalid Content-Length/);
  assertThrows("unterminated header", () => {
    new JsonRpcFrameDecoder({framing: "content-length", maxHeaderBytes: 16, maxFrameBytes: 256, label: "test-rpc"})
      .push("Content-Length: 2XXXX", () => {});
  }, /header exceeded|lacked CRLF/);
  assertThrows("unterminated JSONL", () => {
    new JsonRpcFrameDecoder({framing: "line", maxHeaderBytes: 16, maxFrameBytes: 32, label: "test-rpc"})
      .push("x".repeat(33), () => {});
  }, /without a newline/);
  assertThrows("invalid UTF-8 body", () => {
    const invalid = Buffer.concat([Buffer.from("Content-Length: 1\r\n\r\n"), Buffer.from([0xff])]);
    new JsonRpcFrameDecoder({framing: "content-length", maxHeaderBytes: 64, maxFrameBytes: 256, label: "test-rpc"})
      .push(invalid, () => {});
  }, /not valid UTF-8/);
}

const MALFORMED_SERVER = `
import {spawn} from "node:child_process";
import {writeFileSync} from "node:fs";
const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {stdio: "ignore"});
writeFileSync(process.env.CHENG_TEST_GRANDCHILD_PID_FILE, String(grandchild.pid));
process.stdin.once("data", () => {
  process.stdout.write("Content-Length: 9007199254740993\\r\\n\\r\\n");
  setInterval(() => {}, 1000);
});
process.stdin.resume();
`;

async function waitForChildExit(child: any, timeoutMs = 3000) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return Promise.race([
    new Promise<boolean>((resolve) => child.once("exit", () => resolve(true))),
    sleep(timeoutMs).then(() => false),
  ]);
}

async function waitForProcessGone(pid: number, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error: any) {
      if (error?.code === "ESRCH") return true;
      throw error;
    }
    await sleep(20);
  }
  return false;
}

async function testProtocolFailureKillsClients() {
  console.log("[B] protocol failure rejects pending requests and kills process groups");
  const tempRoot = mkdtempSync(join(tmpdir(), "cheng-fusion-rpc-group-"));
  const baselineExitListeners = process.listenerCount("exit");
  try {
    const doctorPidFile = join(tempRoot, "doctor-grandchild.pid");
    const doctorClient = new JsonRpcChild(process.execPath, ["-e", MALFORMED_SERVER], {
      cwd: CHENG_ROOT,
      env: {...process.env, CHENG_TEST_GRANDCHILD_PID_FILE: doctorPidFile},
      framing: "content-length",
      detached: true,
    });
    const doctorPending = [
      doctorClient.request("initialize", {}, 3000),
      doctorClient.request("tools/list", {}, 3000),
    ];
    await Promise.all(doctorPending.map((pending, index) => assertRejects(`doctor child malformed frame pending ${index + 1}`, pending, /invalid Content-Length/)));
    assertTrue(doctorClient.dead, "doctor JSON-RPC client is marked dead on protocol failure");
    await assertRejects("doctor dead client rejects new request", doctorClient.request("tools/list", {}, 3000), /exited process/);
    assertTrue(await doctorClient.waitForExit(3000), "doctor malformed child process group exits after protocol failure");
    const doctorGrandchildPid = Number(readFileSync(doctorPidFile, "utf8"));
    assertTrue(await waitForProcessGone(doctorGrandchildPid), "doctor protocol failure kills the malformed server's grandchild in the same process group");
    await doctorClient.close();

    const toolkitPidFile = join(tempRoot, "toolkit-grandchild.pid");
    const toolkitClient = new JsonRpcProcessClient(process.execPath, ["-e", MALFORMED_SERVER], {
      cwd: CHENG_ROOT,
      env: {...process.env, CHENG_TEST_GRANDCHILD_PID_FILE: toolkitPidFile},
    });
    toolkitClient.start();
    const toolkitPending = [
      toolkitClient.request("initialize", {}, 3000),
      toolkitClient.request("shutdown", {}, 3000),
    ];
    await Promise.all(toolkitPending.map((pending, index) => assertRejects(`toolkit client malformed frame pending ${index + 1}`, pending, /invalid Content-Length/)));
    assertTrue(toolkitClient.dead, "toolkit JSON-RPC client is marked dead on protocol failure");
    await assertRejects("toolkit dead client rejects new request", toolkitClient.request("shutdown", {}, 3000), /dead JSON-RPC process/);
    assertTrue(await waitForChildExit(toolkitClient.child), "toolkit malformed child process group exits after protocol failure");
    const toolkitGrandchildPid = Number(readFileSync(toolkitPidFile, "utf8"));
    assertTrue(await waitForProcessGone(toolkitGrandchildPid), "toolkit protocol failure kills the malformed server's grandchild in the same process group");
    toolkitClient.close();
    assertTrue(process.listenerCount("exit") === baselineExitListeners, "dead toolkit clients remove their process exit cleanup listener");
  } finally {
    rmSync(tempRoot, {recursive: true, force: true});
  }
}

async function testRealLspSingleFlightAndDocumentGeneration() {
  console.log("[C] real cheng-lsp same-root initialization is single-flight and didOpen is client-bound");
  const baselineExitListeners = process.listenerCount("exit");
  const firstWave = await Promise.all(Array.from({length: 24}, () => chengLspEnsureClient(CHENG_ROOT)));
  const first = firstWave[0];
  assertTrue(new Set(firstWave).size === 1, "24 concurrent first-use calls return the same initialized real cheng-lsp client");
  assertTrue(first.generation === 1, `first real client generation is 1, got ${first.generation}`);

  const firstMethods: string[] = [];
  const firstNotify = first.notify.bind(first);
  first.notify = (method: string, params: unknown) => {
    firstMethods.push(method);
    return firstNotify(method, params);
  };
  const text = readFileSync(SOURCE, "utf8");
  await Promise.all(Array.from({length: 24}, () => chengLspSyncDoc(first, SOURCE, text)));
  assertTrue(firstMethods.filter((method) => method === "textDocument/didOpen").length === 1, "concurrent first sync sends exactly one didOpen to the actual client");
  assertTrue(firstMethods.filter((method) => method === "textDocument/didChange").length === 0, "identical concurrent first sync sends no didChange");

  first.close();
  await waitForChildExit(first.child);
  const secondWave = await Promise.all(Array.from({length: 24}, () => chengLspEnsureClient(CHENG_ROOT)));
  const second = secondWave[0];
  assertTrue(new Set(secondWave).size === 1 && second !== first, "replacement initialization is also single-flight and returns a new client");
  assertTrue(second.generation === first.generation + 1, `replacement generation increments exactly once, got ${first.generation} -> ${second.generation}`);

  const secondMethods: string[] = [];
  const secondNotify = second.notify.bind(second);
  second.notify = (method: string, params: unknown) => {
    secondMethods.push(method);
    return secondNotify(method, params);
  };
  await chengLspSyncDoc(second, SOURCE, text);
  assertTrue(secondMethods.filter((method) => method === "textDocument/didOpen").length === 1, "replacement client receives didOpen even when text is unchanged");
  assertTrue(secondMethods.filter((method) => method === "textDocument/didChange").length === 0, "replacement client never receives didChange before its own didOpen");
  second.close();
  assertTrue(await waitForChildExit(second.child), "replacement real cheng-lsp exits during test cleanup");
  assertTrue(process.listenerCount("exit") === baselineExitListeners, "real client replacement/close leaves no process exit listener behind");
}

async function main() {
  testBoundedStrictDecoder();
  await testProtocolFailureKillsClients();
  await testRealLspSingleFlightAndDocumentGeneration();
  console.log("item19 lsp protocol/singleflight: PASS");
}

main().catch((error) => {
  console.error("item19 lsp protocol/singleflight: FAIL", error);
  process.exit(1);
});
