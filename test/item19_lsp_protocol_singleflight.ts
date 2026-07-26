import {chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {pathToFileURL} from "node:url";
import {JsonRpcChild} from "../cli.ts";
import {
  JsonRpcProcessClient,
  chengLspEnsureClient,
  chengLspResolveBinary,
  chengLspSyncDoc,
  chengLspDiagnosticsForSyncedDoc,
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

function testLspBinaryAuthority() {
  console.log("[B] LSP binary resolution has one explicit/default authority and deterministic failure paths");
  const tempRoot = realpathSync(mkdtempSync(join(tmpdir(), "cheng-fusion-lsp-authority-")));
  try {
    const shadow = join(tempRoot, "cheng-lsp");
    writeFileSync(shadow, "#!/bin/sh\nexit 0\n");
    chmodSync(shadow, 0o755);
    assertTrue(
      chengLspResolveBinary({PATH: tempRoot}, realpathSync(process.execPath)) === realpathSync(process.execPath),
      "PATH 上的同名二进制不会成为 fallback",
    );
    assertThrows(
      "explicit missing LSP",
      () => chengLspResolveBinary({CHENG_LSP_PATH: join(tempRoot, "missing-lsp")}, realpathSync(process.execPath)),
      new RegExp(`CHENG_LSP_PATH cheng-lsp binary not found at ${join(tempRoot, "missing-lsp").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
    const nonExecutable = join(tempRoot, "non-executable-lsp");
    writeFileSync(nonExecutable, "not executable\n");
    chmodSync(nonExecutable, 0o600);
    assertThrows(
      "explicit non-executable LSP",
      () => chengLspResolveBinary({CHENG_LSP_PATH: nonExecutable}, realpathSync(process.execPath)),
      /CHENG_LSP_PATH cheng-lsp is not executable at/,
    );
  } finally {
    rmSync(tempRoot, {recursive: true, force: true});
  }
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

async function testDiagnosticsWaitForCurrentPublish() {
  console.log("[C] diagnostics wait for the current document publish event");
  const client = new JsonRpcProcessClient("/unused/cheng-lsp", [], {});
  client.generation = 101;
  const notifications: string[] = [];
  client.notify = (method: string) => {
    notifications.push(method);
  };
  const source = join(CHENG_ROOT, "src/tests/fusion_diagnostics_event_fixture.cheng");
  const uri = await chengLspSyncDoc(client, source, "fn main() =\n    return\n");
  let firstSettled = false;
  const first = chengLspDiagnosticsForSyncedDoc(client, uri, 1000).then((diagnostics) => {
    firstSettled = true;
    return diagnostics;
  });
  await sleep(20);
  assertTrue(!firstSettled, "didOpen must not turn an early empty pull result into zero diagnostics");
  const expected = [{message: "fixture diagnostic"}];
  client.handleMessage({
    method: "textDocument/publishDiagnostics",
    params: {uri, version: 1, diagnostics: expected},
  });
  assertTrue(await first === expected, "the first diagnostics query resolves from the post-didOpen publish event");

  await chengLspSyncDoc(client, source, "fn main() =\n    return 0\n");
  let secondSettled = false;
  const second = chengLspDiagnosticsForSyncedDoc(client, uri, 1000).then((diagnostics) => {
    secondSettled = true;
    return diagnostics;
  });
  await sleep(20);
  assertTrue(!secondSettled, "didChange must not reuse diagnostics published for the previous text version");
  client.handleMessage({
    method: "textDocument/publishDiagnostics",
    params: {uri, version: 2, diagnostics: []},
  });
  assertTrue((await second).length === 0, "a post-didChange empty publish is accepted as a proven clean document");

  await chengLspSyncDoc(client, source, "fn main() =\n    return 1\n");
  await assertRejects(
    "missing current publish",
    chengLspDiagnosticsForSyncedDoc(client, uri, 20),
    /refusing to treat unfinished analysis as zero diagnostics/,
  );
  assertTrue(
    notifications.join(",") ===
      "textDocument/didOpen,textDocument/didChange,textDocument/didChange",
    "diagnostics synchronization emits one ordered open/change notification per text version",
  );
}

async function testInstalledLspArtifactFailsClosedBeforeSpawn() {
  console.log("[D] installed stale cheng-lsp is rejected before spawn");
  const baselineExitListeners = process.listenerCount("exit");
  await assertRejects(
    "revoked installed LSP",
    chengLspEnsureClient(CHENG_ROOT),
    /revoked installed cheng-lsp artifact/,
  );
  assertTrue(
    process.listenerCount("exit") === baselineExitListeners,
    "artifact rejection happens before a JSON-RPC client installs cleanup listeners",
  );
}

async function testOrdinaryBodylessRoutineStillHardErrors() {
  console.log("[D] ordinary bodyless fn remains a parser hard error");
  const tempRoot = realpathSync(
    mkdtempSync(join(tmpdir(), "cheng-fusion-bodyless-fn.")),
  );
  const source = join(tempRoot, "src/main.cheng");
  writeFileSync(
    join(tempRoot, "cheng-package.toml"),
    'package_id = "pkg://bodyless-fn-test"\n',
  );
  mkdirSync(join(tempRoot, "src"));
  writeFileSync(source, "fn MissingBody(): int32\n");
  const binary = chengLspResolveBinary();
  const client = new JsonRpcProcessClient(binary, [], {cwd: tempRoot});
  client.generation = 1;
  client.rootPath = tempRoot;
  try {
    client.start();
    const rootUri = pathToFileURL(tempRoot).href;
    await client.request("initialize", {
      capabilities: {},
      processId: process.pid,
      rootUri,
      workspaceFolders: [{uri: rootUri, name: "bodyless-fn-test"}],
    }, 20000);
    client.notify("initialized", {});
    const uri = await chengLspSyncDoc(
      client,
      source,
      readFileSync(source, "utf8"),
    );
    const diagnostics = await chengLspDiagnosticsForSyncedDoc(
      client,
      uri,
      10000,
    );
    assertTrue(
      diagnostics.some(
        (diagnostic: any) =>
          diagnostic.severity === 1 &&
          /expected '='|suite assignment missing/.test(
            String(diagnostic.message || ""),
          ),
      ),
      `ordinary bodyless fn must remain red, got ${JSON.stringify(diagnostics)}`,
    );
    await client.request("shutdown", null, 5000);
    client.notify("exit", null);
    assertTrue(
      await waitForChildExit(client.child),
      "ordinary bodyless test LSP exits through shutdown/exit",
    );
  } finally {
    if (!client.dead) {
      await client.request("shutdown", null, 1000).catch(() => undefined);
      if (!client.dead) client.notify("exit", null);
      await waitForChildExit(client.child);
    }
    rmSync(tempRoot, {recursive: true, force: true});
  }
}

async function main() {
  testBoundedStrictDecoder();
  testLspBinaryAuthority();
  await testProtocolFailureKillsClients();
  await testDiagnosticsWaitForCurrentPublish();
  await testInstalledLspArtifactFailsClosedBeforeSpawn();
  await testOrdinaryBodylessRoutineStillHardErrors();
  console.log("item19 lsp protocol/singleflight: PASS");
}

main().catch((error) => {
  console.error("item19 lsp protocol/singleflight: FAIL", error);
  process.exit(1);
});
