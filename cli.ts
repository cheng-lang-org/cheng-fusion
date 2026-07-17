#!/usr/bin/env bun
// @ts-nocheck
import {accessSync, closeSync, constants as fsConstants, fstatSync, lstatSync, openSync, readSync, statSync} from "node:fs";
import {spawn} from "node:child_process";
import {delimiter, dirname, isAbsolute, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {handleMcpRequest} from "./src/cheng_fusion_mcp_server_m9009.ts";
import {JSON_RPC_MAX_FRAME_BYTES, JsonRpcFrameDecoder} from "./src/json_rpc_frame_decoder.ts";
import {
  CHENG_DRIVER,
  CHENG_STAGE3_DRIVER,
  CHENG_TOOLCHAIN_ROOT,
  chengDriverSpawnEnv,
} from "./src/cheng_toolkit_m9000.ts";

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const MCP_ENTRY = join(PACKAGE_ROOT, "index.ts");
const DOCTOR_TIMEOUT_MS = 10_000;
const INPUT_UTF8_DECODER = new TextDecoder("utf-8", {fatal: true});

const USAGE = `Usage:
  cheng-fusion list
  cheng-fusion run <tool> --input <JSON|@file|-> [--root <path>] [--cwd <path>]
  cheng-fusion doctor

Commands:
  list    Print the exact MCP tools/list result as JSON.
  run     Execute a registry tool through the same validation/context/execute path as MCP.
  doctor  Verify the real MCP entry point, tool schemas, Cheng binaries, code signatures,
          and a minimal cheng-lsp initialize handshake.
`;

class CliFailure extends Error {
  constructor(code, message, details = {}, exitCode = 1) {
    super(message);
    this.name = "CliFailure";
    this.code = code;
    this.details = details;
    this.exitCode = exitCode;
  }
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function errorDetails(error) {
  const details = {};
  if (error && typeof error === "object") {
    if (error.code !== undefined) details.causeCode = error.code;
    if (error.exitCode !== undefined) details.exitCode = error.exitCode;
    if (error.signal !== undefined) details.signal = error.signal;
  }
  return details;
}

function tail(value, limit = 4000) {
  const text = String(value || "");
  return text.length > limit ? text.slice(-limit) : text;
}

function writeJson(stream, value) {
  stream.write(JSON.stringify(value, null, 2) + "\n");
}

function takeOption(argv, index, name) {
  const argument = argv[index];
  if (argument === name) {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new CliFailure("OPTION_VALUE_MISSING", `${name} requires a value`, {option: name});
    }
    return {value, consumed: 2};
  }
  const prefix = `${name}=`;
  if (argument.startsWith(prefix)) {
    const value = argument.slice(prefix.length);
    if (!value) throw new CliFailure("OPTION_VALUE_MISSING", `${name} requires a value`, {option: name});
    return {value, consumed: 1};
  }
  return null;
}

function parseRunArguments(argv) {
  if (argv.length === 0 || argv[0].startsWith("-")) {
    throw new CliFailure("TOOL_NAME_MISSING", "run requires a tool name");
  }
  const tool = argv[0];
  const options = {tool, input: null, root: null, cwd: null};
  for (let index = 1; index < argv.length;) {
    let parsed = takeOption(argv, index, "--input");
    if (parsed) {
      if (options.input !== null) throw new CliFailure("OPTION_DUPLICATE", "--input may be passed only once", {option: "--input"});
      options.input = parsed.value;
      index += parsed.consumed;
      continue;
    }
    parsed = takeOption(argv, index, "--root");
    if (parsed) {
      if (options.root !== null) throw new CliFailure("OPTION_DUPLICATE", "--root may be passed only once", {option: "--root"});
      options.root = resolve(parsed.value);
      index += parsed.consumed;
      continue;
    }
    parsed = takeOption(argv, index, "--cwd");
    if (parsed) {
      if (options.cwd !== null) throw new CliFailure("OPTION_DUPLICATE", "--cwd may be passed only once", {option: "--cwd"});
      options.cwd = resolve(parsed.value);
      index += parsed.consumed;
      continue;
    }
    throw new CliFailure("UNKNOWN_OPTION", `unknown run option: ${argv[index]}`, {option: argv[index]});
  }
  if (options.input === null) {
    throw new CliFailure("INPUT_MISSING", "run requires --input <JSON|@file|->");
  }
  return options;
}

async function readAllStdin() {
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    byteLength += bytes.length;
    if (byteLength > JSON_RPC_MAX_FRAME_BYTES) {
      process.stdin.destroy();
      throw new CliFailure("INPUT_TOO_LARGE", `stdin JSON exceeds ${JSON_RPC_MAX_FRAME_BYTES} bytes`, {source: "stdin", maxBytes: JSON_RPC_MAX_FRAME_BYTES});
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, byteLength);
}

function decodeInputBytes(bytes, source) {
  if (bytes.length > JSON_RPC_MAX_FRAME_BYTES) {
    throw new CliFailure("INPUT_TOO_LARGE", `${source} exceeds ${JSON_RPC_MAX_FRAME_BYTES} bytes`, {source, maxBytes: JSON_RPC_MAX_FRAME_BYTES, actualBytes: bytes.length});
  }
  try {
    return INPUT_UTF8_DECODER.decode(bytes);
  } catch (error) {
    throw new CliFailure("INPUT_UTF8_INVALID", `${source} is not valid UTF-8: ${errorText(error)}`, {source});
  }
}

function readBoundedRegularFile(path) {
  const before = lstatSync(path);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new CliFailure("INPUT_FILE_NOT_REGULAR", `input JSON path must be a regular non-symlink file: ${path}`, {path});
  }
  if (before.size > JSON_RPC_MAX_FRAME_BYTES) {
    throw new CliFailure("INPUT_TOO_LARGE", `${path} exceeds ${JSON_RPC_MAX_FRAME_BYTES} bytes`, {
      source: path,
      maxBytes: JSON_RPC_MAX_FRAME_BYTES,
      actualBytes: before.size,
    });
  }

  const noFollow = Number(fsConstants.O_NOFOLLOW || 0);
  const fd = openSync(path, fsConstants.O_RDONLY | noFollow);
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new CliFailure("INPUT_FILE_CHANGED", `input JSON file changed while it was being opened: ${path}`, {path});
    }
    const chunks = [];
    let byteLength = 0;
    for (;;) {
      const capacity = JSON_RPC_MAX_FRAME_BYTES + 1 - byteLength;
      if (capacity <= 0) break;
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, capacity));
      const bytesRead = readSync(fd, chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      chunks.push(chunk.subarray(0, bytesRead));
      byteLength += bytesRead;
    }
    if (byteLength > JSON_RPC_MAX_FRAME_BYTES) {
      throw new CliFailure("INPUT_TOO_LARGE", `${path} exceeds ${JSON_RPC_MAX_FRAME_BYTES} bytes`, {
        source: path,
        maxBytes: JSON_RPC_MAX_FRAME_BYTES,
        actualBytesAtLeast: byteLength,
      });
    }
    const after = fstatSync(fd);
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || byteLength !== after.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) {
      throw new CliFailure("INPUT_FILE_CHANGED", `input JSON file changed while it was being read: ${path}`, {path});
    }
    return Buffer.concat(chunks, byteLength);
  } finally {
    closeSync(fd);
  }
}

async function parseInput(inputSpec) {
  let text;
  let source;
  if (inputSpec === "-") {
    source = "stdin";
    text = decodeInputBytes(await readAllStdin(), source);
  } else if (inputSpec.startsWith("@")) {
    const pathText = inputSpec.slice(1);
    if (!pathText) throw new CliFailure("INPUT_FILE_MISSING", "@file input requires a file path");
    const path = resolve(pathText);
    source = path;
    try {
      text = decodeInputBytes(readBoundedRegularFile(path), source);
    } catch (error) {
      if (error instanceof CliFailure) throw error;
      throw new CliFailure("INPUT_FILE_READ_FAILED", `cannot read input JSON file: ${path}: ${errorText(error)}`, {path, ...errorDetails(error)});
    }
  } else {
    source = "--input";
    text = inputSpec;
    const bytes = Buffer.byteLength(text, "utf8");
    if (bytes > JSON_RPC_MAX_FRAME_BYTES) {
      throw new CliFailure("INPUT_TOO_LARGE", `inline JSON exceeds ${JSON_RPC_MAX_FRAME_BYTES} bytes`, {
        source,
        maxBytes: JSON_RPC_MAX_FRAME_BYTES,
        actualBytes: bytes,
      });
    }
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new CliFailure("INPUT_JSON_INVALID", `${source} is not valid JSON: ${errorText(error)}`, {source});
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CliFailure("INPUT_NOT_OBJECT", `${source} must decode to a JSON object`, {source});
  }
  return value;
}

async function listTools() {
  const result = await handleMcpRequest({jsonrpc: "2.0", id: 1, method: "tools/list", params: {}});
  writeJson(process.stdout, result);
  return 0;
}

async function runTool(argv) {
  const options = parseRunArguments(argv);
  const input = await parseInput(options.input);
  const params = {name: options.tool, arguments: input};
  if (options.root) params.workspaceRoots = [options.root];
  if (options.cwd) params.cwd = options.cwd;
  let result;
  try {
    result = await handleMcpRequest({jsonrpc: "2.0", id: 1, method: "tools/call", params});
  } catch (error) {
    const toolNotFound = error?.code === -32602;
    throw new CliFailure(
      toolNotFound ? "TOOL_NOT_FOUND" : "TOOL_CALL_FAILED",
      errorText(error),
      {tool: options.tool, ...errorDetails(error)},
    );
  }
  writeJson(process.stdout, result);
  return result?.isError ? 1 : 0;
}

class JsonRpcChild {
  constructor(command, args, options = {}) {
    this.command = command;
    this.args = args;
    this.framing = options.framing || "line";
    this.detached = options.detached === undefined ? process.platform !== "win32" : Boolean(options.detached);
    this.stderr = "";
    this.decoder = new JsonRpcFrameDecoder({framing: this.framing, label: `JSON-RPC child ${command}`});
    this.pending = new Map();
    this.nextId = 1;
    this.dead = false;
    this.exited = false;
    this.exitPromise = new Promise((resolveExit) => { this.resolveExit = resolveExit; });
    this.child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: this.detached,
    });
    this.child.stderr.on("data", (chunk) => { this.stderr = tail(this.stderr + chunk.toString("utf8"), 64 * 1024); });
    this.child.stdin.on("error", (error) => this.failProtocol(error));
    this.child.stdout.on("data", (chunk) => {
      if (this.dead) return;
      try {
        this.decoder.push(chunk, (message) => this.handleMessage(message));
      } catch (error) {
        this.failProtocol(error);
      }
    });
    this.child.on("error", (error) => {
      this.dead = true;
      this.exited = true;
      this.decoder.clear();
      this.resolveExit?.({exitCode: null, signal: null, error});
      this.rejectPending(error);
    });
    this.child.on("exit", (exitCode, signal) => {
      this.dead = true;
      this.exited = true;
      this.decoder.clear();
      this.resolveExit?.({exitCode, signal});
      const error = Object.assign(
        new Error(`process exited before JSON-RPC response: command=${command} exitCode=${exitCode} signal=${signal} stderr=${tail(this.stderr)}`),
        {exitCode, signal},
      );
      this.rejectPending(error);
    });
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  failProtocol(error) {
    if (this.dead) return;
    const protocolError = error instanceof Error ? error : new Error(String(error));
    this.dead = true;
    this.decoder.clear();
    this.rejectPending(protocolError);
    try { this.signalTree("SIGKILL"); } catch {}
  }

  handleMessage(message) {
    if (message?.id === undefined || !this.pending.has(message.id)) return;
    const pending = this.pending.get(message.id);
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    pending.resolve(message);
  }

  send(message) {
    if (this.dead) throw new Error(`cannot write to exited process: ${this.command}`);
    const body = JSON.stringify(message);
    if (this.framing === "content-length") {
      this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    } else {
      this.child.stdin.write(body + "\n");
    }
  }

  request(method, params = {}, timeoutMs = DOCTOR_TIMEOUT_MS) {
    const id = this.nextId++;
    const response = new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Object.assign(new Error(`${method} timed out after ${timeoutMs}ms`), {code: "ETIMEDOUT"}));
      }, timeoutMs);
      this.pending.set(id, {resolve: resolvePromise, reject, timer});
    });
    try {
      this.send({jsonrpc: "2.0", id, method, params});
    } catch (error) {
      const pending = this.pending.get(id);
      if (pending) {
        this.pending.delete(id);
        clearTimeout(pending.timer);
        pending.reject(error);
      }
    }
    return response;
  }

  notify(method, params = {}) {
    this.send({jsonrpc: "2.0", method, params});
  }

  signalTree(signal) {
    try {
      if (this.detached && process.platform !== "win32" && typeof this.child.pid === "number") process.kill(-this.child.pid, signal);
      else this.child.kill(signal);
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }

  async waitForExit(timeoutMs) {
    if (this.exited) return true;
    let timer;
    const timedOut = new Promise((resolveTimeout) => {
      timer = setTimeout(() => resolveTimeout(false), timeoutMs);
    });
    const exited = await Promise.race([this.exitPromise.then(() => true), timedOut]);
    clearTimeout(timer);
    return exited;
  }

  async close() {
    if (this.exited) return;
    if (!this.dead) {
      try { this.child.stdin.end(); } catch {}
    }
    if (await this.waitForExit(200)) return;
    try { this.signalTree("SIGTERM"); } catch {}
    if (await this.waitForExit(500)) return;
    try { this.signalTree("SIGKILL"); } catch {}
    await this.waitForExit(500);
    this.dead = true;
    this.rejectPending(new Error(`JSON-RPC process did not exit after SIGKILL: ${this.command}`));
  }
}

export {JsonRpcChild};

function resolveConfiguredPath(value) {
  return isAbsolute(value) ? value : resolve(value);
}

function findExecutableOnPath(name) {
  for (const directory of String(process.env.PATH || "").split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    try {
      if (statSync(candidate).isFile()) {
        accessSync(candidate, fsConstants.X_OK);
        return candidate;
      }
    } catch {}
  }
  return null;
}

function resolveLspBinary() {
  if (process.env.CHENG_LSP_PATH) return resolveConfiguredPath(process.env.CHENG_LSP_PATH);
  return findExecutableOnPath("cheng-lsp") || join(CHENG_TOOLCHAIN_ROOT, "artifacts/cheng-lsp");
}

function executableStatus(label, configuredPath) {
  const path = resolveConfiguredPath(configuredPath);
  try {
    const stat = statSync(path);
    if (!stat.isFile()) {
      return {ok: false, path, error: {code: "EXECUTABLE_NOT_FILE", message: `${label} is not a regular file: ${path}`, path}};
    }
    accessSync(path, fsConstants.X_OK);
    return {ok: true, path};
  } catch (error) {
    const missing = error?.code === "ENOENT";
    return {
      ok: false,
      path,
      error: {
        code: missing ? "EXECUTABLE_NOT_FOUND" : "EXECUTABLE_NOT_EXECUTABLE",
        message: missing ? `${label} not found: ${path}` : `${label} is not executable: ${path}: ${errorText(error)}`,
        path,
        ...errorDetails(error),
      },
    };
  }
}

function spawnCapture(command, args, options = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeoutMs = options.timeoutMs || DOCTOR_TIMEOUT_MS;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill("SIGKILL"); } catch {}
      resolvePromise({exitCode: null, signal: "SIGKILL", timedOut: true, stdout: tail(stdout), stderr: tail(stderr)});
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({exitCode: null, signal: null, timedOut: false, stdout: tail(stdout), stderr: tail(stderr), spawnError: errorText(error), ...errorDetails(error)});
    });
    child.on("exit", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({exitCode, signal, timedOut: false, stdout: tail(stdout), stderr: tail(stderr)});
    });
  });
}

function doctorRecorder() {
  const checks = [];
  const errors = [];
  return {
    checks,
    errors,
    pass(id, details = {}) {
      checks.push({id, ok: true, ...details});
    },
    skip(id, reason) {
      checks.push({id, ok: true, skipped: true, reason});
    },
    fail(id, error, details = {}) {
      const item = {check: id, ...error};
      checks.push({id, ok: false, error: item, ...details});
      errors.push(item);
    },
  };
}

function rpcFailure(code, label, response) {
  const rpcError = response?.error;
  return {
    code,
    message: rpcError
      ? `${label} returned JSON-RPC error ${rpcError.code}: ${rpcError.message}`
      : `${label} returned no result`,
    ...(rpcError ? {rpcError: {code: rpcError.code, message: rpcError.message, ...(rpcError.data === undefined ? {} : {data: rpcError.data})}} : {}),
  };
}

function validateToolSchemas(tools) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return {
      ok: false,
      error: {
        code: "TOOLS_LIST_EMPTY",
        message: "tools/list returned no tools; schema validation requires a non-empty registry",
      },
    };
  }
  const invalid = tools
    .filter((tool) => tool?.inputSchema?.type !== "object")
    .map((tool) => ({name: tool?.name || null, actualType: tool?.inputSchema?.type ?? null}));
  if (invalid.length > 0) {
    return {
      ok: false,
      error: {
        code: "SCHEMA_TOP_LEVEL_NOT_OBJECT",
        message: `${invalid.length} tool schema(s) do not have top-level type=object`,
        invalid,
      },
    };
  }
  return {ok: true, toolCount: tools.length};
}

async function checkRealMcp(recorder) {
  let client;
  let tools = null;
  try {
    client = new JsonRpcChild(process.execPath, [MCP_ENTRY], {cwd: PACKAGE_ROOT, framing: "line"});
    let initialize;
    try {
      initialize = await client.request("initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: {name: "cheng-fusion-doctor", version: "1"},
      });
    } catch (error) {
      recorder.fail("mcp.initialize", {
        code: "MCP_INITIALIZE_FAILED",
        message: `real MCP initialize failed: ${errorText(error)}`,
        command: process.execPath,
        entry: MCP_ENTRY,
        stderr: tail(client.stderr),
        ...errorDetails(error),
      });
      recorder.fail("mcp.tools_list", {code: "MCP_INITIALIZE_REQUIRED", message: "tools/list was not attempted because initialize failed"});
      recorder.fail("schemas.top_level_object", {code: "TOOLS_LIST_REQUIRED", message: "schema validation was not attempted because tools/list did not complete"});
      return null;
    }
    if (initialize?.error || !initialize?.result) {
      recorder.fail("mcp.initialize", rpcFailure("MCP_INITIALIZE_RPC_ERROR", "real MCP initialize", initialize));
      recorder.fail("mcp.tools_list", {code: "MCP_INITIALIZE_REQUIRED", message: "tools/list was not attempted because initialize returned an error"});
      recorder.fail("schemas.top_level_object", {code: "TOOLS_LIST_REQUIRED", message: "schema validation was not attempted because tools/list did not complete"});
      return null;
    }
    recorder.pass("mcp.initialize", {serverInfo: initialize.result.serverInfo || null});

    let listed;
    try {
      listed = await client.request("tools/list", {});
    } catch (error) {
      recorder.fail("mcp.tools_list", {
        code: "MCP_TOOLS_LIST_FAILED",
        message: `real MCP tools/list failed: ${errorText(error)}`,
        stderr: tail(client.stderr),
        ...errorDetails(error),
      });
      recorder.fail("schemas.top_level_object", {code: "TOOLS_LIST_REQUIRED", message: "schema validation was not attempted because tools/list failed"});
      return null;
    }
    if (listed?.error || !Array.isArray(listed?.result?.tools)) {
      recorder.fail("mcp.tools_list", rpcFailure("MCP_TOOLS_LIST_RPC_ERROR", "real MCP tools/list", listed));
      recorder.fail("schemas.top_level_object", {code: "TOOLS_LIST_REQUIRED", message: "schema validation was not attempted because tools/list returned no tools array"});
      return null;
    }
    tools = listed.result.tools;
    recorder.pass("mcp.tools_list", {toolCount: tools.length});
    const schemaValidation = validateToolSchemas(tools);
    if (schemaValidation.ok) recorder.pass("schemas.top_level_object", {toolCount: schemaValidation.toolCount});
    else recorder.fail("schemas.top_level_object", schemaValidation.error);
    return tools;
  } finally {
    await client?.close();
  }
}

async function checkCodeSign(recorder, label, status) {
  const id = `codesign.${label}`;
  if (process.platform !== "darwin") {
    recorder.skip(id, "codesign verification applies only on macOS");
    return;
  }
  if (!status.ok) {
    recorder.fail(id, {code: "CODESIGN_EXECUTABLE_REQUIRED", message: `codesign was not attempted because ${label} is unavailable`, path: status.path});
    return;
  }
  const result = await spawnCapture("/usr/bin/codesign", ["--verify", "--verbose=2", status.path]);
  if (result.exitCode === 0) {
    recorder.pass(id, {path: status.path});
    return;
  }
  recorder.fail(id, {
    code: result.timedOut ? "CODESIGN_TIMEOUT" : "CODESIGN_VERIFY_FAILED",
    message: result.timedOut
      ? `codesign verification timed out for ${status.path}`
      : `codesign verification failed for ${status.path}: exitCode=${result.exitCode} signal=${result.signal}`,
    path: status.path,
    exitCode: result.exitCode,
    signal: result.signal,
    stderr: result.stderr,
    ...(result.spawnError ? {spawnError: result.spawnError} : {}),
  });
}

async function checkLspSpawn(recorder, lspStatus) {
  const id = "lsp.initialize";
  if (!lspStatus.ok) {
    recorder.fail(id, {code: "LSP_EXECUTABLE_REQUIRED", message: "cheng-lsp initialize was not attempted because its executable is unavailable", path: lspStatus.path});
    return;
  }
  let client;
  try {
    client = new JsonRpcChild(lspStatus.path, [], {
      cwd: CHENG_TOOLCHAIN_ROOT,
      env: chengDriverSpawnEnv(),
      framing: "content-length",
      detached: true,
    });
    const rootUri = pathToFileURL(CHENG_TOOLCHAIN_ROOT).href;
    const response = await client.request("initialize", {
      capabilities: {},
      processId: process.pid,
      rootUri,
      workspaceFolders: [{uri: rootUri, name: "cheng-toolchain"}],
    });
    if (response?.error || !response?.result) {
      recorder.fail(id, {
        ...rpcFailure("LSP_INITIALIZE_RPC_ERROR", "cheng-lsp initialize", response),
        path: lspStatus.path,
        stderr: tail(client.stderr),
      });
      return;
    }
    client.notify("initialized", {});
    recorder.pass(id, {path: lspStatus.path, capabilities: response.result.capabilities || {}});
  } catch (error) {
    recorder.fail(id, {
      code: error?.code === "ETIMEDOUT" ? "LSP_INITIALIZE_TIMEOUT" : "LSP_INITIALIZE_FAILED",
      message: `cheng-lsp initialize failed: ${errorText(error)}`,
      path: lspStatus.path,
      stderr: tail(client?.stderr),
      ...errorDetails(error),
    });
  } finally {
    if (client && !client.dead) {
      try {
        const shutdown = await client.request("shutdown", {}, 2000);
        if (!shutdown?.error) client.notify("exit", {});
      } catch {}
    }
    await client?.close();
  }
}

async function doctor() {
  const recorder = doctorRecorder();
  const tools = await checkRealMcp(recorder);
  const statuses = {
    backend_driver: executableStatus("backend driver", CHENG_DRIVER),
    stage3: executableStatus("stage3 driver", CHENG_STAGE3_DRIVER),
    lsp: executableStatus("cheng-lsp", resolveLspBinary()),
  };
  for (const [label, status] of Object.entries(statuses)) {
    const id = `executable.${label}`;
    if (status.ok) recorder.pass(id, {path: status.path});
    else recorder.fail(id, status.error);
  }
  await Promise.all(Object.entries(statuses).map(([label, status]) => checkCodeSign(recorder, label, status)));
  await checkLspSpawn(recorder, statuses.lsp);
  const report = {
    schema: "cheng_fusion_doctor.v1",
    ok: recorder.errors.length === 0,
    runtime: {executable: process.execPath, platform: process.platform, arch: process.arch},
    paths: {
      packageRoot: PACKAGE_ROOT,
      mcpEntry: MCP_ENTRY,
      toolchainRoot: CHENG_TOOLCHAIN_ROOT,
      backendDriver: statuses.backend_driver.path,
      stage3: statuses.stage3.path,
      lsp: statuses.lsp.path,
    },
    toolCount: tools?.length ?? null,
    checks: recorder.checks,
    errors: recorder.errors,
  };
  writeJson(process.stdout, report);
  return report.ok ? 0 : 1;
}

async function runCli(argv = process.argv.slice(2)) {
  const command = argv[0];
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    return command ? 0 : 1;
  }
  if (command === "list") {
    if (argv.length !== 1) throw new CliFailure("UNEXPECTED_ARGUMENT", "list takes no arguments", {arguments: argv.slice(1)});
    return listTools();
  }
  if (command === "run") return runTool(argv.slice(1));
  if (command === "doctor") {
    if (argv.length !== 1) throw new CliFailure("UNEXPECTED_ARGUMENT", "doctor takes no arguments", {arguments: argv.slice(1)});
    return doctor();
  }
  throw new CliFailure("UNKNOWN_COMMAND", `unknown command: ${command}`, {command});
}

if (import.meta.main) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    const failure = error instanceof CliFailure
      ? error
      : new CliFailure("INTERNAL_ERROR", errorText(error), errorDetails(error));
    writeJson(process.stderr, {
      schema: "cheng_fusion_cli_error.v1",
      ok: false,
      error: {code: failure.code, message: failure.message, ...failure.details},
    });
    process.exitCode = failure.exitCode || 1;
  });
}

export {doctor, listTools, parseInput, runCli, runTool, validateToolSchemas};
