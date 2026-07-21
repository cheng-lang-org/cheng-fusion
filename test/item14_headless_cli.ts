// item14 headless CLI / doctor production-path gate:
//   A. CLI list is byte-structure-equivalent to a real MCP tools/list response.
//   B. CLI run and real MCP tools/call return the same result for the same registry tool/input.
//   C. --input supports inline JSON, @file, and stdin; failures exit nonzero.
//   D. Two real git clones containing minimal Cheng projects run a lightweight real driver tool
//      concurrently and remain bound to their explicit roots (no process-global root bleed).
//   E. doctor really spawns index.ts, validates object schemas, executable/code-sign state, and
//      a cheng-lsp initialize handshake; a missing driver yields a concrete structured code.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {EventEmitter} from "node:events";
import {accessSync, chmodSync, constants, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {validateToolSchemas} from "../cli.ts";
import {handleMcpRequest, writeToStreamWithBackpressure} from "../src/cheng_fusion_mcp_server_m9009.ts";
import {getChengFusionToolManifest, getChengFusionTools, initChengFusionToolRegistryModule} from "../src/cheng_fusion_tool_registry.ts";
import {JSON_RPC_MAX_FRAME_BYTES, JsonRpcFrameDecoder} from "../src/json_rpc_frame_decoder.ts";
import {resolveChengProjectRoot} from "../src/cheng_toolkit_m9000.ts";

const PROJECT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(PROJECT, "cli.ts");
const ENTRY = join(PROJECT, "index.ts");
const PACKAGE_JSON = join(PROJECT, "package.json");
const INSTALL = join(PROJECT, "install.sh");
const TIMEOUT_MS = 30_000;

function assertTrue(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  console.log(`  ok: ${message}`);
}

function runProcess(command: string, args: string[], options: {cwd?: string; env?: Record<string, string>; stdin?: string | Buffer; timeoutMs?: number} = {}) {
  return new Promise<any>((resolvePromise, reject) => {
    const detached = process.platform !== "win32";
    const child = spawn(command, args, {
      cwd: options.cwd || PROJECT,
      env: {...process.env, ...(options.env || {})} as any,
      stdio: ["pipe", "pipe", "pipe"],
      detached,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timeoutError: Error | null = null;
    let forceTimer: ReturnType<typeof setTimeout> | null = null;
    const timeoutMs = options.timeoutMs || TIMEOUT_MS;
    const timer = setTimeout(() => {
      if (settled) return;
      timeoutError = new Error(`process timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}\nstdout=${stdout.slice(-2000)}\nstderr=${stderr.slice(-2000)}`);
      try {
        if (detached && typeof child.pid === "number") process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        try { child.kill("SIGKILL"); } catch {}
      }
      forceTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(timeoutError);
      }, 2000);
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      reject(error);
    });
    child.on("exit", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      if (timeoutError) {
        reject(timeoutError);
        return;
      }
      resolvePromise({exitCode, signal, stdout, stderr});
    });
    if (options.stdin !== undefined) child.stdin.end(options.stdin);
    else child.stdin.end();
  });
}

function parseJson(text: string, label: string) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} did not emit valid JSON: ${error instanceof Error ? error.message : String(error)}\n${text.slice(-3000)}`);
  }
}

async function runCli(args: string[], options: {cwd?: string; env?: Record<string, string>; stdin?: string; timeoutMs?: number} = {}) {
  return runProcess(process.execPath, [CLI, ...args], options);
}

class McpClient {
  child: any;
  stdoutBuffer = "";
  stderr = "";
  nextId = 1;
  pending = new Map<number, any>();
  rootsResponse: any = {roots: []};
  rootsError: string | null = null;
  rootsListCount = 0;

  constructor(cwd = PROJECT, env: Record<string, string> = {}) {
    this.child = spawn(process.execPath, [ENTRY], {
      cwd,
      env: {...process.env, ...env} as any,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stderr.on("data", (chunk: Buffer) => { this.stderr += chunk.toString("utf8"); });
    this.child.stdout.on("data", (chunk: Buffer) => {
      this.stdoutBuffer += chunk.toString("utf8");
      for (;;) {
        const newline = this.stdoutBuffer.indexOf("\n");
        if (newline < 0) break;
        const line = this.stdoutBuffer.slice(0, newline).trim();
        this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
        if (!line) continue;
        const message = JSON.parse(line);
        if (message.method === "roots/list" && message.id !== undefined) {
          this.rootsListCount++;
          const response = this.rootsError
            ? {jsonrpc: "2.0", id: message.id, error: {code: -32001, message: this.rootsError}}
            : {jsonrpc: "2.0", id: message.id, result: this.rootsResponse};
          this.child.stdin.write(JSON.stringify(response) + "\n");
          continue;
        }
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        pending.resolve(message);
      }
    });
    this.child.on("exit", (exitCode: number | null, signal: string | null) => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`MCP exited early: exitCode=${exitCode} signal=${signal} stderr=${this.stderr.slice(-2000)}`));
      }
      this.pending.clear();
    });
  }

  request(method: string, params: any) {
    const id = this.nextId++;
    const response = new Promise<any>((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP ${method} timed out; stderr=${this.stderr.slice(-2000)}`));
      }, TIMEOUT_MS);
      this.pending.set(id, {resolve: resolvePromise, reject, timer});
    });
    this.child.stdin.write(JSON.stringify({jsonrpc: "2.0", id, method, params}) + "\n");
    return response;
  }

  close() {
    try { this.child.stdin.end(); } catch {}
    try { this.child.kill("SIGTERM"); } catch {}
  }
}

function toolJson(result: any) {
  assertTrue(result && result.isError !== true, "tool call succeeded");
  const text = result.content?.[0]?.text;
  assert.equal(typeof text, "string", "tool result contains text content");
  return parseJson(text, "tool content");
}

async function git(cwd: string, args: string[]) {
  const result = await runProcess("git", args, {cwd});
  assert.equal(result.exitCode, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result;
}

function writeMinimalChengProject(root: string, functionName: string, value: number) {
  mkdirSync(join(root, "src"), {recursive: true});
  writeFileSync(join(root, "cheng-package.toml"), 'package_id = "pkg://cheng/headless-cli-fixture"\n');
  writeFileSync(join(root, "src/main.cheng"), `fn ${functionName}(): int32 =\n    return ${value}\n\nfn main(): int32 =\n    return ${functionName}()\n`);
}

async function testMcpCliParity(tempRoot: string) {
  console.log("[A] MCP/CLI list + run parity, including JSON/@file/stdin input");
  const mcp = new McpClient();
  try {
    const initialized = await mcp.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: {name: "item14", version: "1"},
    });
    assertTrue(Boolean(initialized.result?.serverInfo), "real MCP initialize completed");

    const mcpList = await mcp.request("tools/list", {});
    assert.equal(mcpList.error, undefined, `MCP tools/list failed: ${JSON.stringify(mcpList.error)}`);
    const cliListRun = await runCli(["list"]);
    assert.equal(cliListRun.exitCode, 0, `CLI list failed: ${cliListRun.stderr}`);
    const cliList = parseJson(cliListRun.stdout, "CLI list");
    assert.deepEqual(cliList, mcpList.result);
    assertTrue(cliList.tools.length > 0, `CLI list exactly matches MCP tools/list (${cliList.tools.length} tools)`);
    initChengFusionToolRegistryModule();
    const registryTools = getChengFusionTools();
    const registryManifest = getChengFusionToolManifest();
    const registryNames = registryTools.map((tool: any) => tool.name).sort();
    assert.equal(registryManifest.count, registryTools.length);
    assert.deepEqual(registryManifest.names, registryNames);
    assert.equal(new Set(registryNames).size, registryNames.length);
    assert.equal(registryManifest.sha256, createHash("sha256").update(registryNames.map((name: string) => `${name}\n`).join(""), "utf8").digest("hex"));
    assert.deepEqual(cliList.tools.map((tool: any) => tool.name).sort(), registryNames);
    assertTrue(true, "registry count and identity are derived from the unique actual tool names");
    assertTrue(cliList.tools.every((tool: any) => tool.inputSchema?.type === "object"), "every listed schema has top-level type=object");
    for (const executingTool of ["cheng_crash_triage", "cheng_corrupt_hunt"]) {
      assert.equal(cliList.tools.find((tool: any) => tool.name === executingTool)?.annotations?.readOnlyHint, false);
    }
    assertTrue(true, "tools that execute user binaries are not advertised as read-only");

    const input = {stderr: "src/main.cheng:4:9: error: item14 parity diagnostic\n"};
    const mcpCall = await mcp.request("tools/call", {name: "cheng_crash_triage", arguments: input});
    assert.equal(mcpCall.error, undefined, `MCP tools/call failed: ${JSON.stringify(mcpCall.error)}`);

    const inline = await runCli(["run", "cheng_crash_triage", "--input", JSON.stringify(input)]);
    assert.equal(inline.exitCode, 0, `CLI inline run failed: ${inline.stderr}`);
    const inlineResult = parseJson(inline.stdout, "CLI inline run");
    assert.deepEqual(inlineResult, mcpCall.result);
    assertTrue(true, "CLI run result exactly matches real MCP tools/call result");

    const inputFile = join(tempRoot, "crash-input.json");
    writeFileSync(inputFile, JSON.stringify(input));
    const fromFile = await runCli(["run", "cheng_crash_triage", "--input", `@${inputFile}`]);
    assert.equal(fromFile.exitCode, 0, `CLI @file run failed: ${fromFile.stderr}`);
    assert.deepEqual(parseJson(fromFile.stdout, "CLI @file run"), inlineResult);
    assertTrue(true, "@file input matches inline JSON output");

    const fromStdin = await runCli(["run", "cheng_crash_triage", "--input", "-"], {stdin: JSON.stringify(input)});
    assert.equal(fromStdin.exitCode, 0, `CLI stdin run failed: ${fromStdin.stderr}`);
    assert.deepEqual(parseJson(fromStdin.stdout, "CLI stdin run"), inlineResult);
    assertTrue(true, "stdin input matches inline JSON output");
  } finally {
    mcp.close();
  }

}

async function testNonzeroErrors(tempRoot: string) {
  console.log("[B] CLI errors are structured and exit nonzero");
  const invalidJson = await runCli(["run", "cheng_crash_triage", "--input", "{"]);
  assert.notEqual(invalidJson.exitCode, 0);
  const invalidJsonError = parseJson(invalidJson.stderr, "invalid JSON stderr");
  assert.equal(invalidJsonError.error?.code, "INPUT_JSON_INVALID");
  assertTrue(true, "invalid JSON exits nonzero with INPUT_JSON_INVALID");

  const invalidUtf8Path = join(tempRoot, "invalid-utf8.json");
  writeFileSync(invalidUtf8Path, Buffer.from([0xff]));
  const invalidUtf8 = await runCli(["run", "cheng_crash_triage", "--input", `@${invalidUtf8Path}`]);
  assert.notEqual(invalidUtf8.exitCode, 0);
  assert.equal(parseJson(invalidUtf8.stderr, "invalid UTF-8 stderr").error?.code, "INPUT_UTF8_INVALID");
  assertTrue(true, "@file input rejects invalid UTF-8 before JSON parsing");

  const symlinkInputTarget = join(tempRoot, "symlink-input-target.json");
  const symlinkInputPath = join(tempRoot, "symlink-input.json");
  writeFileSync(symlinkInputTarget, "{}");
  symlinkSync(symlinkInputTarget, symlinkInputPath);
  const symlinkInput = await runCli(["run", "cheng_crash_triage", "--input", `@${symlinkInputPath}`]);
  assert.notEqual(symlinkInput.exitCode, 0);
  assert.equal(parseJson(symlinkInput.stderr, "symlink input stderr").error?.code, "INPUT_FILE_NOT_REGULAR");
  assertTrue(true, "@file input rejects symlinks instead of reopening an unpinned target");

  const oversizedInputPath = join(tempRoot, "oversized-input.json");
  writeFileSync(oversizedInputPath, "");
  truncateSync(oversizedInputPath, 64 * 1024 * 1024 + 1);
  const oversizedInput = await runCli(["run", "cheng_crash_triage", "--input", `@${oversizedInputPath}`]);
  assert.notEqual(oversizedInput.exitCode, 0);
  assert.equal(parseJson(oversizedInput.stderr, "oversized input stderr").error?.code, "INPUT_TOO_LARGE");
  assertTrue(true, "@file input is size-bounded before reading the payload");

  const unknownTool = await runCli(["run", "cheng_does_not_exist", "--input", "{}"]);
  assert.notEqual(unknownTool.exitCode, 0);
  const unknownToolError = parseJson(unknownTool.stderr, "unknown tool stderr");
  assert.equal(unknownToolError.error?.code, "TOOL_NOT_FOUND");
  assertTrue(true, "unknown tool exits nonzero with TOOL_NOT_FOUND");

  const toolError = await runCli(["run", "cheng_crash_triage", "--input", "{}"]);
  assert.notEqual(toolError.exitCode, 0);
  const toolErrorResult = parseJson(toolError.stdout, "tool error stdout");
  assert.equal(toolErrorResult.isError, true);
  assertTrue(true, "registry validation/runtime error preserves MCP isError output and exits nonzero");

  for (const [label, argumentsValue] of [
    ["null", null],
    ["array", []],
    ["string", "not-an-object"],
    ["number", 7],
    ["boolean", false],
  ] as const) {
    const malformedArguments = await handleMcpRequest({
      method: "tools/call",
      params: {name: "cheng_crash_triage", arguments: argumentsValue},
    });
    assert.equal(malformedArguments.isError, true, `${label} arguments must be a tool contract error`);
    assert.match(malformedArguments.content?.[0]?.text || "", /arguments must be a JSON object/);
  }
  const omittedArguments = await handleMcpRequest({method: "tools/call", params: {name: "cheng_crash_triage"}});
  assert.equal(omittedArguments.isError, true);
  assert.doesNotMatch(omittedArguments.content?.[0]?.text || "", /arguments must be a JSON object/);
  assertTrue(true, "only omitted MCP arguments default to {}; null, arrays, and primitives never execute a tool");

  const contractRoot = join(tempRoot, "contract-error-root");
  writeMinimalChengProject(contractRoot, "ContractError", 1);
  const contractError = await runCli(["run", "cheng_csg_roundtrip", "--input", "{}", "--root", contractRoot]);
  assert.notEqual(contractError.exitCode, 0);
  const contractErrorResult = parseJson(contractError.stdout, "tool contract error stdout");
  assert.equal(contractErrorResult.isError, true);
  assertTrue(JSON.stringify(contractErrorResult).includes("source is required"), "tool contract errors throw and cannot be returned as exit-0 JSON payloads");

  const oversizedFrame = await runProcess(process.execPath, [ENTRY], {
    stdin: "Content-Length: 9007199254740993\r\n\r\n",
  });
  assert.notEqual(oversizedFrame.exitCode, 0);
  assertTrue(oversizedFrame.stderr.includes("invalid Content-Length"), "unsafe/oversized MCP frame lengths fail the server instead of growing an unbounded buffer");

  const invalidBody = Buffer.concat([
    Buffer.from('{"jsonrpc":"2.0","id":1,"method":"p', "utf8"),
    Buffer.from([0xff]),
    Buffer.from('ing"}', "utf8"),
  ]);
  const invalidWire = Buffer.concat([
    Buffer.from(`Content-Length: ${invalidBody.length}\r\n\r\n`, "ascii"),
    invalidBody,
  ]);
  const invalidMcpUtf8 = await runProcess(process.execPath, [ENTRY], {stdin: invalidWire});
  assert.notEqual(invalidMcpUtf8.exitCode, 0);
  assertTrue(invalidMcpUtf8.stderr.includes("JSON frame is not valid UTF-8"), "real MCP Content-Length input rejects malformed UTF-8 fatally");

  const flood = Array.from({length: 40}, (_, index) => JSON.stringify({jsonrpc: "2.0", id: index + 1, method: "tools/list", params: {}}) + "\n").join("");
  const floodedMcp = await runProcess(process.execPath, [ENTRY], {stdin: flood});
  assert.notEqual(floodedMcp.exitCode, 0);
  assertTrue(floodedMcp.stderr.includes("MCP input request queue exceeded its bound"), "MCP request FIFO is hard-bounded under a same-chunk flood");
}

function contentLengthFrame(value: unknown) {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"), body]);
}

async function testStrictAutoFraming() {
  console.log("[B2] shared MCP/LSP decoder: strict auto framing, chunk queue, fatal UTF-8");

  const fragmentedMessages: any[] = [];
  const fragmented = new JsonRpcFrameDecoder({framing: "auto", label: "item14 fragmented"});
  const fragmentedWire = Buffer.concat([
    Buffer.from("\r\n\t \r\n", "ascii"),
    contentLengthFrame({jsonrpc: "2.0", id: 1, result: {ok: true}}),
  ]);
  for (let index = 0; index < fragmentedWire.length; index++) {
    fragmented.push(fragmentedWire.subarray(index, index + 1), (message) => fragmentedMessages.push(message));
  }
  assert.equal(fragmentedMessages.length, 1);
  assert.equal(fragmentedMessages[0].result.ok, true);
  assertTrue(true, "Content-Length auto framing survives leading blank records and one-byte chunks");

  const sameChunkMessages: any[] = [];
  const sameChunk = new JsonRpcFrameDecoder({framing: "auto", label: "item14 same chunk"});
  sameChunk.push(Buffer.concat([
    contentLengthFrame({jsonrpc: "2.0", id: 2, result: "first"}),
    contentLengthFrame({jsonrpc: "2.0", id: 3, result: "second"}),
  ]), (message) => sameChunkMessages.push(message));
  assert.deepEqual(sameChunkMessages.map((message) => message.result), ["first", "second"]);
  assertTrue(true, "one chunk may contain multiple complete Content-Length frames");

  const payload = "x".repeat(1024 * 1024);
  const bulkFrame = Buffer.from(JSON.stringify({jsonrpc: "2.0", method: "bulk", params: {payload}}) + "\n", "utf8");
  const bulkFrameCount = Math.ceil((JSON_RPC_MAX_FRAME_BYTES + 1) / bulkFrame.length);
  const bulkWire = Buffer.concat(Array.from({length: bulkFrameCount}, () => bulkFrame));
  assertTrue(bulkWire.length > JSON_RPC_MAX_FRAME_BYTES && bulkFrame.length < JSON_RPC_MAX_FRAME_BYTES, "bulk fixture exceeds 64 MiB only in aggregate");
  let bulkMessages = 0;
  const bulk = new JsonRpcFrameDecoder({framing: "auto", label: "item14 bulk"});
  bulk.push(bulkWire, () => { bulkMessages++; });
  assert.equal(bulkMessages, bulkFrameCount);
  assertTrue(true, "aggregate stream may exceed 64 MiB when every JSONL frame is independently bounded");

  const fixed = new JsonRpcFrameDecoder({framing: "auto", label: "item14 fixed protocol"});
  fixed.push(Buffer.from('{"jsonrpc":"2.0","method":"ping"}\n', "utf8"), () => {});
  assert.throws(
    () => fixed.push(contentLengthFrame({jsonrpc: "2.0", method: "ping"}), () => {}),
    /invalid JSON frame/,
  );
  assertTrue(true, "auto framing is selected once and never reinterprets a later protocol switch");

  const invalidUtf8 = new JsonRpcFrameDecoder({framing: "auto", label: "item14 invalid utf8"});
  assert.throws(
    () => invalidUtf8.push(Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d, 0x0a]), () => {}),
    /not valid UTF-8/,
  );
  assertTrue(true, "JSONL invalid UTF-8 is fatal instead of replacement-decoded");

  const readerModule = pathToFileURL(join(PROJECT, "src/cheng_fusion_mcp_server_m9009.ts")).href;
  const rejectionScript = [
    `import {createMessageReader} from ${JSON.stringify(readerModule)};`,
    'const reader = createMessageReader(async () => { throw new Error("async reader rejection sentinel"); }, (error) => console.error(`reader fatal: ${error.message}`));',
    `reader(Buffer.from(${JSON.stringify('{"jsonrpc":"2.0","id":1,"method":"ping"}\n')}, "utf8"));`,
    "setTimeout(() => {}, 1000);",
  ].join("\n");
  const rejectedReader = await runProcess(process.execPath, ["-e", rejectionScript], {timeoutMs: 5_000});
  assert.notEqual(rejectedReader.exitCode, 0);
  assertTrue(rejectedReader.stderr.includes("reader fatal: async reader rejection sentinel"), "async onMessage rejection reaches the fatal path and exits nonzero");

  const blockedOutput: any = new EventEmitter();
  let writeCalls = 0;
  blockedOutput.write = () => { writeCalls++; return false; };
  let drained = false;
  const pendingWrite = writeToStreamWithBackpressure(blockedOutput, "bounded-output").then(() => { drained = true; });
  await Promise.resolve();
  assert.equal(writeCalls, 1);
  assert.equal(drained, false);
  blockedOutput.emit("drain");
  await pendingWrite;
  assert.equal(drained, true);
  assertTrue(true, "MCP output waits for stream drain instead of accumulating ignored writes");
}

async function testMcpEofDrain() {
  console.log("[B3] MCP stdin EOF drains accepted work and backpressured output");

  const listRequest = JSON.stringify({jsonrpc: "2.0", id: 81, method: "tools/list", params: {}}) + "\n";
  const halfClosed = await runProcess(process.execPath, [ENTRY], {stdin: listRequest});
  assert.equal(halfClosed.exitCode, 0, `MCP must finish an accepted tools/list after stdin EOF: ${halfClosed.stderr}`);
  const listResponse = parseJson(halfClosed.stdout.trim(), "half-closed MCP tools/list");
  assert.equal(listResponse.id, 81);
  assertTrue(Array.isArray(listResponse.result?.tools) && listResponse.result.tools.length > 0, "stdin EOF after an asynchronous request preserves its complete response");

  const emptyEof = await runProcess(process.execPath, [ENTRY], {stdin: ""});
  assert.equal(emptyEof.exitCode, 0, `empty MCP EOF must exit cleanly: ${emptyEof.stderr}`);
  assert.equal(emptyEof.stdout, "");
  assertTrue(true, "MCP with no requests exits cleanly on EOF");

  const serverModule = pathToFileURL(join(PROJECT, "src/cheng_fusion_mcp_server_m9009.ts")).href;
  const delayedOutputScript = [
    'import {Writable} from "node:stream";',
    `import {startChengFusionMcpServer} from ${JSON.stringify(serverModule)};`,
    "const delayedOutput = new Writable({",
    "  highWaterMark: 1,",
    "  write(chunk, _encoding, done) {",
    "    setTimeout(() => process.stdout.write(chunk, () => done()), 75);",
    "  },",
    "});",
    "startChengFusionMcpServer(process.stdin, delayedOutput, process.stderr).catch((error) => { console.error(error); process.exit(1); });",
  ].join("\n");
  const pingRequest = JSON.stringify({jsonrpc: "2.0", id: 82, method: "ping", params: {}}) + "\n";
  const backpressured = await runProcess(process.execPath, ["-e", delayedOutputScript], {stdin: pingRequest, timeoutMs: 5_000});
  assert.equal(backpressured.exitCode, 0, `backpressured MCP EOF must flush before exit: ${backpressured.stderr}`);
  assert.deepEqual(parseJson(backpressured.stdout.trim(), "backpressured MCP ping"), {jsonrpc: "2.0", id: 82, result: {}});
  assertTrue(true, "stdin EOF waits for stdout drain instead of truncating a backpressured response");
}

async function testConcurrentCloneIsolation(tempRoot: string) {
  console.log("[C] two real git clones execute concurrently with explicit root isolation");
  const seed = join(tempRoot, "seed");
  const cloneA = join(tempRoot, "clone-a");
  const cloneB = join(tempRoot, "clone-b");
  mkdirSync(seed, {recursive: true});
  writeMinimalChengProject(seed, "SeedValue", 7);
  await git(seed, ["init", "--quiet"]);
  await git(seed, ["config", "user.name", "cheng-fusion-item14"]);
  await git(seed, ["config", "user.email", "item14@invalid.local"]);
  await git(seed, ["add", "cheng-package.toml", "src/main.cheng"]);
  await git(seed, ["commit", "--quiet", "-m", "minimal Cheng fixture"]);
  await Promise.all([
    git(tempRoot, ["clone", "--quiet", seed, cloneA]),
    git(tempRoot, ["clone", "--quiet", seed, cloneB]),
  ]);
  writeMinimalChengProject(cloneA, "CloneAValue", 11);
  writeMinimalChengProject(cloneB, "CloneBValue", 22);

  const inputObject = {action: "snapshot", source: "src/main.cheng"};
  const input = JSON.stringify(inputObject);
  const toolProcessOptions = {timeoutMs: 60_000, env: {CHENG_FUSION_TIMEOUT_MS: "30000"}};
  const [runA, runB] = await Promise.all([
    runCli(["run", "cheng_symbol_diff", "--input", input, "--root", cloneA], toolProcessOptions),
    runCli(["run", "cheng_symbol_diff", "--input", input, "--root", cloneB], toolProcessOptions),
  ]);
  assert.equal(runA.exitCode, 0, `clone A CLI failed: ${runA.stderr}\n${runA.stdout}`);
  assert.equal(runB.exitCode, 0, `clone B CLI failed: ${runB.stderr}\n${runB.stdout}`);
  const cliResultA = parseJson(runA.stdout, "clone A CLI");
  const cliResultB = parseJson(runB.stdout, "clone B CLI");
  const outputA = toolJson(cliResultA);
  const outputB = toolJson(cliResultB);
  assert.equal(outputA.schema, "cheng_symbols_v1", `clone A did not use the real driver: ${JSON.stringify(outputA)}`);
  assert.equal(outputB.schema, "cheng_symbols_v1", `clone B did not use the real driver: ${JSON.stringify(outputB)}`);
  assert.equal(outputA.root, cloneA);
  assert.equal(outputB.root, cloneB);
  assert.equal(outputA.source, join(cloneA, "src/main.cheng"));
  assert.equal(outputB.source, join(cloneB, "src/main.cheng"));
  assert.notEqual(outputA.root, outputB.root);
  assertTrue(!JSON.stringify(outputA).includes(cloneB), "clone A output contains no clone B path");
  assertTrue(!JSON.stringify(outputB).includes(cloneA), "clone B output contains no clone A path");

  const mcp = new McpClient(PROJECT, {CHENG_FUSION_TIMEOUT_MS: "30000"});
  try {
    await mcp.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: {name: "item14-root-isolation", version: "1"},
      rootUri: pathToFileURL(cloneA).href,
      workspaceFolders: [{uri: pathToFileURL(cloneA).href, name: "clone-a"}],
    });
    const [mcpA, mcpB] = await Promise.all([
      mcp.request("tools/call", {name: "cheng_symbol_diff", arguments: inputObject, workspaceRoots: [cloneA]}),
      mcp.request("tools/call", {name: "cheng_symbol_diff", arguments: inputObject, workspaceRoots: [cloneB]}),
    ]);
    assert.equal(mcpA.error, undefined, `clone A MCP failed: ${JSON.stringify(mcpA.error)}`);
    assert.equal(mcpB.error, undefined, `clone B MCP failed: ${JSON.stringify(mcpB.error)}`);
    const mcpOutputA = toolJson(mcpA.result);
    const mcpOutputB = toolJson(mcpB.result);
    assert.equal(mcpOutputA.root, cloneA);
    assert.equal(mcpOutputB.root, cloneB);
    assertTrue(!JSON.stringify(mcpOutputA).includes(cloneB), "same MCP process keeps clone A isolated from clone B");
    assertTrue(!JSON.stringify(mcpOutputB).includes(cloneA), "same MCP process keeps clone B isolated from clone A");
    assert.deepEqual(mcpA.result, cliResultA);
    assert.deepEqual(mcpB.result, cliResultB);
    assertTrue(true, "rooted CLI output exactly matches rooted MCP output for both clones");

    const cwdOnly = await runCli(["run", "cheng_symbol_diff", "--input", input, "--cwd", cloneA], toolProcessOptions);
    assert.equal(cwdOnly.exitCode, 0, `--cwd-only CLI failed: ${cwdOnly.stderr}\n${cwdOnly.stdout}`);
    const cwdResult = parseJson(cwdOnly.stdout, "--cwd-only CLI");
    const cwdOutput = toolJson(cwdResult);
    assert.equal(cwdOutput.root, cloneA);
    const mcpCwd = await mcp.request("tools/call", {name: "cheng_symbol_diff", arguments: inputObject, cwd: cloneA});
    assert.equal(mcpCwd.error, undefined, `--cwd MCP failed: ${JSON.stringify(mcpCwd.error)}`);
    assert.deepEqual(mcpCwd.result, cwdResult);
    assertTrue(true, "--cwd independently selects the root and matches MCP context semantics");

    const conflictingContext = await runCli(["run", "cheng_symbol_diff", "--input", input, "--root", cloneA, "--cwd", cloneB], toolProcessOptions);
    assert.notEqual(conflictingContext.exitCode, 0);
    const conflictingResult = parseJson(conflictingContext.stdout, "conflicting CLI context");
    assert.equal(conflictingResult.isError, true);
    assertTrue(JSON.stringify(conflictingResult).includes("cwd belongs to a project outside the active workspace roots"), "conflicting --root/--cwd hard-fails instead of silently switching projects");

    const inheritedRoot = await mcp.request("tools/call", {name: "cheng_symbol_diff", arguments: inputObject});
    assert.equal(inheritedRoot.error, undefined, `inherited-root MCP failed: ${JSON.stringify(inheritedRoot.error)}`);
    assert.equal(toolJson(inheritedRoot.result).root, cloneA);
    assertTrue(true, "per-call explicit roots do not overwrite the initialize-time MCP root hint");
  } finally {
    mcp.close();
  }

  console.log("[C1] request-local roots/list snapshots cannot bleed across concurrent calls");
  await handleMcpRequest({method: "initialize", params: {
    protocolVersion: "2025-11-25",
    capabilities: {roots: {}},
    rootUri: pathToFileURL(cloneA).href,
  }});
  let refreshIndex = 0;
  const refreshSnapshots = [[cloneA], [cloneB]];
  const transport = {
    refreshWorkspaceRoots: async () => refreshSnapshots[refreshIndex++],
  };
  const [snapshotA, snapshotB] = await Promise.all([
    handleMcpRequest({method: "tools/call", params: {name: "cheng_symbol_diff", arguments: inputObject}}, transport),
    handleMcpRequest({method: "tools/call", params: {name: "cheng_symbol_diff", arguments: inputObject}}, transport),
  ]);
  assert.equal(toolJson(snapshotA).root, cloneA);
  assert.equal(toolJson(snapshotB).root, cloneB);
  assertTrue(true, "each concurrent call consumes its own roots/list return value");

  let explicitRootRefreshes = 0;
  await assert.rejects(
    handleMcpRequest({method: "tools/call", params: {
      name: "cheng_symbol_diff",
      arguments: {...inputObject, root: cloneB},
    }}, {refreshWorkspaceRoots: async () => {
      explicitRootRefreshes++;
      throw new Error("authorization roots unavailable");
    }}),
    /authorization roots unavailable/,
  );
  assert.equal(explicitRootRefreshes, 1);
  assertTrue(true, "arguments.root cannot bypass the current roots/list authorization snapshot");

  console.log("[C2] roots/list empty/error clears stale state; model arguments cannot forge workspace authorization");
  const rootsMcp = new McpClient(PROJECT, {CHENG_FUSION_TIMEOUT_MS: "30000"});
  try {
    rootsMcp.rootsResponse = {roots: [{uri: pathToFileURL(cloneA).href, name: "clone-a"}]};
    await rootsMcp.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {roots: {listChanged: true}},
      clientInfo: {name: "item14-roots-list", version: "1"},
      rootUri: pathToFileURL(cloneA).href,
    });

    const argumentLocal = await rootsMcp.request("tools/call", {
      name: "cheng_symbol_diff",
      arguments: {...inputObject, workspaceRoots: [cloneB]},
    });
    assert.equal(argumentLocal.error, undefined, `authorized-root call failed: ${JSON.stringify(argumentLocal.error)}`);
    assert.equal(toolJson(argumentLocal.result).root, cloneA);
    assert.equal(rootsMcp.rootsListCount, 1);
    assertTrue(true, "workspaceRoots inside model arguments is ignored; roots/list remains authoritative");

    const forgedExplicitRoot = await rootsMcp.request("tools/call", {
      name: "cheng_symbol_diff",
      arguments: {...inputObject, root: cloneB},
    });
    assert.equal(forgedExplicitRoot.error, undefined);
    assert.equal(forgedExplicitRoot.result?.isError, true);
    assertTrue(JSON.stringify(forgedExplicitRoot.result).includes("outside the active workspace roots"), "arguments.root outside roots/list is rejected");
    assert.equal(rootsMcp.rootsListCount, 2);

    const listed = await rootsMcp.request("tools/call", {name: "cheng_symbol_diff", arguments: inputObject});
    assert.equal(listed.error, undefined, `roots/list selected call failed: ${JSON.stringify(listed.error)}`);
    assert.equal(toolJson(listed.result).root, cloneA);
    assert.equal(rootsMcp.rootsListCount, 3);
    assertTrue(true, "root-dependent call without explicit context consumes the current roots/list result");

    rootsMcp.rootsResponse = {roots: []};
    const emptyRoots = await rootsMcp.request("tools/call", {name: "cheng_symbol_diff", arguments: inputObject});
    assert.equal(emptyRoots.error, undefined);
    assert.equal(emptyRoots.result?.isError, true);
    assertTrue(!JSON.stringify(emptyRoots.result).includes(cloneA), "empty roots/list clears the previous clone instead of reusing stale state");

    rootsMcp.rootsResponse = {roots: [{uri: pathToFileURL(cloneA).href, name: "clone-a"}]};
    const restored = await rootsMcp.request("tools/call", {name: "cheng_symbol_diff", arguments: inputObject});
    assert.equal(toolJson(restored.result).root, cloneA);
    rootsMcp.rootsError = "roots backend unavailable";
    const rootsFailure = await rootsMcp.request("tools/call", {name: "cheng_symbol_diff", arguments: inputObject});
    assertTrue(Boolean(rootsFailure.error) && String(rootsFailure.error.message).includes("roots backend unavailable"), "roots/list failure hard-fails and cannot run against a cached old clone");
  } finally {
    rootsMcp.close();
  }

  console.log("[C3] realpath isolation rejects input and output symlink escapes");
  const escapedSource = join(cloneA, "src/escape.cheng");
  symlinkSync(join(cloneB, "src/main.cheng"), escapedSource);
  const escapedRun = await runCli(["run", "cheng_symbol_diff", "--input", JSON.stringify({action: "snapshot", source: "src/escape.cheng"}), "--root", cloneA], toolProcessOptions);
  assert.notEqual(escapedRun.exitCode, 0);
  const escapedResult = parseJson(escapedRun.stdout, "symlink escape result");
  assert.equal(escapedResult.isError, true);
  const escapedError = String(escapedResult.content?.[0]?.text);
  assertTrue(/(?:outside|not inside) (?:the )?(?:active )?Cheng project root/.test(escapedError), `existing input is checked against its real target: ${escapedError}`);

  const externalOutput = join(cloneB, "external-output");
  mkdirSync(externalOutput);
  symlinkSync(externalOutput, join(cloneA, "linked-output"));
  assert.throws(
    () => resolveChengProjectRoot({root: cloneA, outDir: "linked-output/new-report"}),
    /(?:outside Cheng project root|symbolic link)/,
  );
  assertTrue(true, "prospective output rejects a symlink ancestor before any write");
}

async function testDoctor(tempRoot: string) {
  console.log("[D] doctor positive path and concrete negative diagnostics");
  const healthy = await runCli(["doctor"], {timeoutMs: 60_000});
  assert.equal(healthy.exitCode, 0, `doctor failed: ${healthy.stderr}\n${healthy.stdout}`);
  const report = parseJson(healthy.stdout, "doctor");
  assert.equal(report.schema, "cheng_fusion_doctor.v1");
  assert.equal(report.ok, true);
  for (const required of [
    "mcp.initialize",
    "mcp.tools_list",
    "schemas.top_level_object",
    "executable.backend_driver",
    "executable.stage3",
    "executable.lsp",
    "codesign.backend_driver",
    "codesign.stage3",
    "codesign.lsp",
    "lsp.initialize",
  ]) {
    assertTrue(report.checks.some((check: any) => check.id === required && check.ok === true), `doctor passed ${required}`);
  }

  const missingDriver = join(tempRoot, "missing-backend-driver");
  const unhealthy = await runCli(["doctor"], {env: {CHENG_DRIVER: missingDriver}, timeoutMs: 60_000});
  assert.notEqual(unhealthy.exitCode, 0);
  const failedReport = parseJson(unhealthy.stdout, "negative doctor");
  assert.equal(failedReport.ok, false);
  assertTrue(failedReport.errors.some((error: any) => error.check === "executable.backend_driver" && error.code === "EXECUTABLE_NOT_FOUND" && error.path === missingDriver), "missing driver reports concrete EXECUTABLE_NOT_FOUND path");
  assertTrue(!JSON.stringify(failedReport).includes("-32000"), "doctor never collapses failure to generic -32000");

  const emptyValidation = validateToolSchemas([]);
  assert.equal(emptyValidation.ok, false);
  assert.equal(emptyValidation.error?.code, "TOOLS_LIST_EMPTY");
  assertTrue(true, "an empty tools/list cannot vacuously pass doctor schema validation");
}

async function testPackageAndInstall(tempRoot: string) {
  console.log("[E] package bin and install dry-run expose the headless entry without global writes");
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
  assert.equal(pkg.bin?.["cheng-fusion"], "cli.ts");
  assert.equal(pkg.bin?.["cheng-fusion-mcp"], "index.ts");
  accessSync(CLI, constants.X_OK);
  accessSync(ENTRY, constants.X_OK);
  assertTrue(true, "package.json exposes executable headless CLI and MCP bins");
  const dryRun = await runProcess("bash", [INSTALL, "--dry-run"], {
    cwd: PROJECT,
    env: {CLAUDE_CONFIG_PATH: join(tempRoot, "claude.json")},
  });
  assert.equal(dryRun.exitCode, 0, `install --dry-run failed: ${dryRun.stderr}`);
  assertTrue(dryRun.stdout.includes(`"command": "${process.execPath}"`), "install.sh registers the resolved Bun absolute path");
  assertTrue(dryRun.stdout.includes(`headless CLI: ${process.execPath} ${CLI} --help`), "install.sh prints the explicit headless CLI entry");

  const realConfig = join(tempRoot, "claude-real.json");
  const originalConfigText = JSON.stringify({
    unrelated: {keep: true},
    mcpServers: {"cheng-fusion": {command: "/old/bun", args: ["/old/index.ts"], env: {KEEP: "1"}, disabled: true}},
  }, null, 2) + "\n";
  writeFileSync(realConfig, originalConfigText, {mode: 0o640});
  chmodSync(realConfig, 0o640);
  const installed = await runProcess("bash", [INSTALL], {cwd: PROJECT, env: {CLAUDE_CONFIG_PATH: realConfig}});
  assert.equal(installed.exitCode, 0, `real install failed: ${installed.stderr}\n${installed.stdout}`);
  const installedConfig = JSON.parse(readFileSync(realConfig, "utf8"));
  assert.deepEqual(installedConfig.unrelated, {keep: true});
  assert.deepEqual(installedConfig.mcpServers["cheng-fusion"].env, {KEEP: "1"});
  assert.equal(installedConfig.mcpServers["cheng-fusion"].disabled, true);
  assert.equal(installedConfig.mcpServers["cheng-fusion"].command, process.execPath);
  assert.deepEqual(installedConfig.mcpServers["cheng-fusion"].args, [ENTRY]);
  assert.equal(statSync(realConfig).mode & 0o777, 0o640);
  const backups = readdirSync(tempRoot).filter((name) => name.startsWith("claude-real.json.bak-"));
  assert.equal(backups.length, 1);
  assert.equal(readFileSync(join(tempRoot, backups[0]), "utf8"), originalConfigText);
  assertTrue(!readdirSync(tempRoot).some((name) => name.includes(".tmp-")), "real install atomically preserves old keys, mode and exact recoverable backup without temporary transaction files");

  const lockPath = `${realConfig}.cheng-fusion.lock`;
  const lockStat = lstatSync(lockPath);
  assertTrue(lockStat.isFile() && !lockStat.isSymbolicLink() && lockStat.nlink === 1 && (lockStat.mode & 0o077) === 0, "installer keeps a private regular advisory-lock inode");
  const lockHolder = spawn("/usr/bin/lockf", ["-k", "-t", "0", lockPath, process.execPath, "-e", "process.stdout.write('locked\\n'); setInterval(() => {}, 1000)"], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  await new Promise<void>((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error("advisory lock holder did not start")), 5000);
    lockHolder.once("error", (error) => { clearTimeout(timer); reject(error); });
    lockHolder.stdout.once("data", () => { clearTimeout(timer); resolvePromise(); });
    lockHolder.once("exit", (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`advisory lock holder exited early: code=${code} signal=${signal}`));
    });
  });
  const beforeLockedInstall = readFileSync(realConfig, "utf8");
  try {
    const lockedInstall = await runProcess("bash", [INSTALL], {cwd: PROJECT, env: {CLAUDE_CONFIG_PATH: realConfig}});
    assert.notEqual(lockedInstall.exitCode, 0);
    assertTrue(readFileSync(realConfig, "utf8") === beforeLockedInstall, "live advisory lock fails loudly without changing config");
  } finally {
    try {
      if (process.platform !== "win32" && typeof lockHolder.pid === "number") process.kill(-lockHolder.pid, "SIGKILL");
      else lockHolder.kill("SIGKILL");
    } catch {}
  }
  await new Promise<void>((resolvePromise) => lockHolder.once("close", () => resolvePromise()));
  const afterStaleLock = await runProcess("bash", [INSTALL], {cwd: PROJECT, env: {CLAUDE_CONFIG_PATH: realConfig}});
  assert.equal(afterStaleLock.exitCode, 0, `released persistent lock inode must not block install: ${afterStaleLock.stderr}`);
  assertTrue(existsSync(lockPath), "released advisory-lock inode remains reusable instead of acting as a stale lock");

  const precisionConfig = join(tempRoot, "precision-preserved.json");
  const precisionText = '{\n  "unrelated": {"tooLarge": 9007199254740993, "negativeZero": -0, "decimal": 1.2300, "exponent": 1e+40},\n  "mcpServers": {}\n}\n';
  writeFileSync(precisionConfig, precisionText);
  const precisionInstall = await runProcess("bash", [INSTALL], {cwd: PROJECT, env: {CLAUDE_CONFIG_PATH: precisionConfig}});
  assert.equal(precisionInstall.exitCode, 0, `lossless-number install failed: ${precisionInstall.stderr}`);
  const precisionWritten = readFileSync(precisionConfig, "utf8");
  assertTrue(precisionWritten.includes('"tooLarge": 9007199254740993') && precisionWritten.includes('"negativeZero": -0') && precisionWritten.includes('"decimal": 1.2300') && precisionWritten.includes('"exponent": 1e+40'), "installer preserves unrelated JSON numeric lexemes without IEEE-754 rounding");
  const precisionBackups = readdirSync(tempRoot).filter((name) => name.startsWith("precision-preserved.json.bak-"));
  assert.equal(precisionBackups.length, 1);
  assert.equal(readFileSync(join(tempRoot, precisionBackups[0]), "utf8"), precisionText);
  assertTrue(true, "lossless JSON parser preserves unrelated precision-sensitive config values");

  const nestedConfig = join(tempRoot, "new-private-config", "nested", "claude.json");
  const nestedInstall = await runProcess("bash", [INSTALL], {cwd: PROJECT, env: {CLAUDE_CONFIG_PATH: nestedConfig}});
  assert.equal(nestedInstall.exitCode, 0, `install creates a missing private config directory: ${nestedInstall.stderr}`);
  assert.equal(statSync(dirname(nestedConfig)).mode & 0o777, 0o700);
  assert.equal(statSync(nestedConfig).mode & 0o777, 0o600);
  assertTrue(true, "missing config directory is created privately before the atomic transaction");

  for (const [name, malformedShape] of [
    ["top-level-array", "[]\n"],
    ["mcp-servers-array", '{"mcpServers":[]}\n'],
    ["named-entry-primitive", '{"mcpServers":{"cheng-fusion":"invalid"}}\n'],
  ] as const) {
    const invalidConfig = join(tempRoot, `${name}.json`);
    writeFileSync(invalidConfig, malformedShape);
    const invalidInstall = await runProcess("bash", [INSTALL], {cwd: PROJECT, env: {CLAUDE_CONFIG_PATH: invalidConfig}});
    assert.notEqual(invalidInstall.exitCode, 0);
    assert.equal(readFileSync(invalidConfig, "utf8"), malformedShape);
    assertTrue(!readdirSync(tempRoot).some((entry) => entry.startsWith(`${name}.json.tmp-`)), `${name} hard-fails without rewriting or temporary transaction debris`);
  }

  const symlinkTarget = join(tempRoot, "symlink-target.json");
  const symlinkConfig = join(tempRoot, "symlink-config.json");
  const symlinkTargetText = '{"mcpServers":{},"keep":true}\n';
  writeFileSync(symlinkTarget, symlinkTargetText);
  symlinkSync(symlinkTarget, symlinkConfig);
  const symlinkInstall = await runProcess("bash", [INSTALL], {cwd: PROJECT, env: {CLAUDE_CONFIG_PATH: symlinkConfig}});
  assert.notEqual(symlinkInstall.exitCode, 0);
  assertTrue(lstatSync(symlinkConfig).isSymbolicLink() && readFileSync(symlinkTarget, "utf8") === symlinkTargetText, "installer rejects a config symlink without replacing the link or touching its target");

  const danglingConfig = join(tempRoot, "dangling-config.json");
  symlinkSync(join(tempRoot, "missing-target.json"), danglingConfig);
  const danglingInstall = await runProcess("bash", [INSTALL], {cwd: PROJECT, env: {CLAUDE_CONFIG_PATH: danglingConfig}});
  assert.notEqual(danglingInstall.exitCode, 0);
  assertTrue(lstatSync(danglingConfig).isSymbolicLink(), "installer rejects a dangling config symlink instead of overwriting it");

  const nodePath = Bun.which("node");
  const dirnamePath = Bun.which("dirname");
  assertTrue(Boolean(nodePath && dirnamePath), "node and dirname are available for isolated install failure test");
  const noBunBin = join(tempRoot, "path-with-node-without-bun");
  mkdirSync(noBunBin);
  symlinkSync(nodePath!, join(noBunBin, "node"));
  symlinkSync(dirnamePath!, join(noBunBin, "dirname"));
  const refusedConfig = join(tempRoot, "must-not-be-created.json");
  const noBun = await runProcess("/bin/bash", [INSTALL], {
    cwd: PROJECT,
    env: {PATH: noBunBin, CLAUDE_CONFIG_PATH: refusedConfig},
  });
  assert.notEqual(noBun.exitCode, 0);
  assertTrue(noBun.stderr.includes("bun is required"), "install.sh reports missing Bun concretely");
  assertTrue(!existsSync(refusedConfig), "install.sh does not write MCP config when Bun is unavailable");
}

async function main() {
  const tempRoot = realpathSync(mkdtempSync(join(tmpdir(), "cheng-fusion-item14-")));
  try {
    await testMcpCliParity(tempRoot);
    await testNonzeroErrors(tempRoot);
    await testStrictAutoFraming();
    await testMcpEofDrain();
    await testConcurrentCloneIsolation(tempRoot);
    await testDoctor(tempRoot);
    await testPackageAndInstall(tempRoot);
  } finally {
    rmSync(tempRoot, {recursive: true, force: true});
  }
  console.log("item14 headless CLI: PASS");
}

main().catch((error) => {
  console.error("item14 headless CLI: FAIL", error);
  process.exit(1);
});
