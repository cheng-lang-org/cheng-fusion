// @ts-nocheck
// Adapted from claude-code-ts/claude/tool/cheng_fusion_mcp_server_m9009.ts.
// Only change: getChengFusionTools() now reads from the local static registry
// (./cheng_fusion_tool_registry.ts) instead of filtering the full claude-code
// builtin tool registry (../artifact/builtin_tool_registry_m4623.ts) by name
// prefix "cheng_". Behavior (tool list, order, schemas, dispatch) is unchanged.
import {getChengFusionToolManifest, getChengFusionTools as getAllChengFusionTools, initChengFusionToolRegistryModule} from "./cheng_fusion_tool_registry.ts";
import {setChengProjectRootHints,withChengInvocationContext,zodToJsonSchema} from "./cheng_toolkit_m9000.ts";
import {JSON_RPC_MAX_FRAME_BYTES,JsonRpcFrameDecoder} from "./json_rpc_frame_decoder.ts";
import {randomBytes} from "node:crypto";
import {createChengFusionMcpRuntimeIdentity} from "./cheng_fusion_mcp_runtime_identity.ts";
import {chengFusionSourceDriftReport} from "./cheng_fusion_source_guard.ts";

let mcpWorkspaceRootHints = [];
let mcpClientCanListRoots = false;
let mcpRuntimeSessionIdentity = null;
const chengMutatingTools = new Set(["cheng_csg_roundtrip", "cheng_profile_report", "cheng_exec_diff", "cheng_zc_census", "cheng_crash_triage", "cheng_corrupt_hunt", "cheng_shape_matrix", "cheng_ignition_chain", "cheng_residual_peel", "cheng_fixture_matrix", "cheng_regalloc_preflight", "cheng_semantic_snapshot_audit", "cheng_driver_frontier_probe"]);

function getChengFusionTools() {
  initChengFusionToolRegistryModule();
  return getAllChengFusionTools();
}

async function describeTool(tool) {
  if (typeof tool.prompt === "function") return await tool.prompt();
  if (typeof tool.description === "function") return await tool.description();
  return tool.name;
}

function validateInput(tool, input) {
  const value = input === undefined ? {} : input;
  if (!tool.inputSchema?.safeParse) return {ok: true, value};
  const parsed = tool.inputSchema.safeParse(value);
  if (parsed.success) return {ok: true, value: parsed.data};
  return {ok: false, error: parsed.error?.message || String(parsed.error)};
}

function toolContent(result) {
  if (Array.isArray(result?.content)) return result.content;
  return [{type: "text", text: JSON.stringify(result ?? null, null, 2)}];
}

function pathFromMaybeFileUri(value) {
  const text = String(value || "");
  if (!text) return null;
  if (!text.startsWith("file://")) return text;
  try {
    return decodeURIComponent(new URL(text).pathname);
  } catch {
    return null;
  }
}

function collectWorkspaceRoots(params = {}) {
  const roots = [];
  const push = (value) => {
    const path = pathFromMaybeFileUri(value?.uri || value?.rootUri || value?.path || value);
    if (path) roots.push(path);
  };
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    push(value.rootUri);
    push(value.rootPath);
    push(value.workspaceRoot);
    push(value.workspace_root);
    push(value.projectRoot);
    push(value.project_root);
    for (const root of value.workspaceRoots || []) push(root);
    for (const root of value.workspace_roots || []) push(root);
    for (const folder of value.workspaceFolders || []) push(folder);
    for (const folder of value.workspace_folders || []) push(folder);
    for (const root of value.roots || []) push(root);
    for (const root of value.clientInfo?.workspaceFolders || []) push(root);
  };
  visit(params);
  visit(params._meta);
  visit(params.meta);
  visit(params.context);
  visit(params.clientContext);
  return roots;
}

function collectWorkingDirectories(params = {}) {
  const dirs = [];
  const push = (value) => {
    const path = pathFromMaybeFileUri(value);
    if (path) dirs.push(path);
  };
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    push(value.cwd);
    push(value.currentWorkingDirectory);
    push(value.current_working_directory);
    push(value.workingDirectory);
    push(value.working_directory);
  };
  visit(params);
  visit(params._meta);
  visit(params.meta);
  visit(params.context);
  visit(params.clientContext);
  return dirs;
}

function stripMcpContextFields(input = {}) {
  const out = {...input};
  delete out.cwd;
  delete out.currentWorkingDirectory;
  delete out.current_working_directory;
  delete out.workingDirectory;
  delete out.working_directory;
  delete out.workspaceRoots;
  delete out.workspace_roots;
  delete out.workspaceFolders;
  delete out.workspace_folders;
  delete out.rootUri;
  delete out.rootPath;
  delete out.workspaceRoot;
  delete out.workspace_root;
  delete out.projectRoot;
  delete out.project_root;
  delete out.facts;
  delete out.roots;
  return out;
}

function buildMcpInvocationContext(params = {}, options = {}) {
  const workspaceRoots = collectWorkspaceRoots(params);
  const cwd = collectWorkingDirectories(params)[0] || null;
  if (workspaceRoots.length > 0 || cwd) {
    return {workspaceRoots, cwd};
  }
  return {workspaceRoots: [...(options.existingWorkspaceRoots || [])], cwd: null};
}

function updateMcpWorkspaceRoots(params = {}) {
  const roots = collectWorkspaceRoots(params);
  mcpWorkspaceRootHints = setChengProjectRootHints(roots);
  return mcpWorkspaceRootHints;
}

function updateMcpClientCapabilities(params = {}) {
  mcpClientCanListRoots = Boolean(params.capabilities?.roots);
}

function bindToolResponseToMcpRuntime(result) {
  if (mcpRuntimeSessionIdentity === null) return result;
  return {
    ...result,
    _meta: {
      chengFusionRuntimeIdentity: mcpRuntimeSessionIdentity,
    },
  };
}

async function handleMcpRequest(message, transportContext = {}) {
  if (message.method === "initialize") {
    if (mcpRuntimeSessionIdentity !== null) {
      throw new Error("cheng_fusion_mcp_runtime_already_initialized");
    }
    updateMcpClientCapabilities(message.params);
    updateMcpWorkspaceRoots(message.params);
    initChengFusionToolRegistryModule();
    const requestedNonce = message.params?._meta?.chengFusionRuntimeNonce;
    const initializationNonce =
      typeof requestedNonce === "string" && /^[0-9a-f]{64}$/.test(requestedNonce)
        ? requestedNonce
        : randomBytes(32).toString("hex");
    mcpRuntimeSessionIdentity = createChengFusionMcpRuntimeIdentity(
      getChengFusionToolManifest(),
      initializationNonce,
    );
    return {
      protocolVersion: message.params?.protocolVersion || "2025-11-25",
      capabilities: {tools: {}},
      serverInfo: {
        name: "cheng-fusion",
        version: "current",
        runtimeIdentity: mcpRuntimeSessionIdentity,
      },
      instructions: "Deterministic Cheng fusion tools for the active Cheng project: CSG, LSP, crash triage, line maps, profiling, and symbol regression checks."
    };
  }
  if (message.method === "ping") return {};
  if (message.method === "tools/list") {
    const tools = await Promise.all(getChengFusionTools().map(async (tool) => ({
      name: tool.name,
      description: await describeTool(tool),
      inputSchema: zodToJsonSchema(tool.inputSchema),
      annotations: {readOnlyHint: !chengMutatingTools.has(tool.name)}
    })));
    return {tools};
  }
  if (message.method === "tools/call") {
    const name = message.params?.name;
    // 陈旧源守卫: 本进程的模块图是 import 那一刻的 src/ 快照。src/ 一旦被编辑, 后续任何结论都来自
    // 编辑前的代码, 必须硬失败而不是返回一个会被误判的旧结论(见 cheng_fusion_source_guard.ts)。
    const sourceDrift = chengFusionSourceDriftReport(typeof name === "string" ? name : null);
    if (sourceDrift) {
      return bindToolResponseToMcpRuntime({isError: true, content: [{type: "text", text: JSON.stringify(sourceDrift, null, 2)}]});
    }
    const tool = getChengFusionTools().find((candidate) => candidate.name === name);
    if (!tool) throw Object.assign(new Error(`Cheng fusion tool not found: ${name}`), {code: -32602});
    const rawArguments = message.params?.arguments === undefined ? {} : message.params.arguments;
    if (rawArguments === null || typeof rawArguments !== "object" || Array.isArray(rawArguments)) {
      return bindToolResponseToMcpRuntime({
        isError: true,
        content: [{type: "text", text: `Invalid input for ${tool.name}: arguments must be a JSON object`}],
      });
    }
    const validation = validateInput(tool, stripMcpContextFields(rawArguments));
    if (!validation.ok) return bindToolResponseToMcpRuntime({isError: true, content: [{type: "text", text: `Invalid input for ${tool.name}: ${validation.error}`}]});
    const directRoots = collectWorkspaceRoots(message.params);
    let invocationRootSnapshot = [...mcpWorkspaceRootHints];
    if (tool.requiresChengProjectRoot && directRoots.length === 0 && typeof transportContext.refreshWorkspaceRoots === "function") {
      invocationRootSnapshot = [...await transportContext.refreshWorkspaceRoots()];
    }
    const context = buildMcpInvocationContext(message.params, {existingWorkspaceRoots: invocationRootSnapshot});
    try {
      const input = tool.requiresChengProjectRoot
        ? withChengInvocationContext(validation.value, context, {requireRoot: true, requireActiveProjectContext: true})
        : validation.value;
      const result = await tool.execute(input);
      return bindToolResponseToMcpRuntime({content: toolContent(result)});
    } catch (error) {
      return bindToolResponseToMcpRuntime({isError: true, content: [{type: "text", text: error instanceof Error ? error.message : String(error)}]});
    }
  }
  throw Object.assign(new Error(`Method not found: ${message.method}`), {code: -32601});
}

function encodeError(message, error) {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: message?.id ?? null,
    error: {code: error?.code || -32603, message: error instanceof Error ? error.message : String(error)}
  }) + "\n";
}

function createMessageReader(onMessage, onError) {
  const decoder = new JsonRpcFrameDecoder({framing: "auto", label: "MCP input"});
  let failed = false;
  const fail = (error) => {
    if (failed) return;
    failed = true;
    decoder.clear();
    const fatal = error instanceof Error ? error : new Error(String(error));
    onError(fatal);
    throw fatal;
  };
  const dispatch = (parsed, frame) => {
    const returned = onMessage(parsed, frame);
    if (returned && typeof returned.then === "function") {
      returned.catch((error) => {
        setTimeout(() => fail(error), 0);
      });
    }
  };
  const reader = (chunk) => {
    if (failed) return;
    try {
      decoder.push(chunk, dispatch);
    } catch (error) {
      fail(error);
    }
  };
  reader.end = () => {
    if (failed) return;
    const bufferedBytes = decoder.queue?.length || 0;
    if (bufferedBytes > 0 || decoder.expectedBodyBytes !== null) {
      fail(new Error(`MCP input: truncated JSON frame at EOF (${bufferedBytes} buffered bytes)`));
    }
  };
  return reader;
}

function writeToStreamWithBackpressure(stream, text) {
  let accepted;
  try {
    accepted = stream.write(text);
  } catch (error) {
    return Promise.reject(error);
  }
  if (accepted !== false) return Promise.resolve();
  if (typeof stream.once !== "function") {
    return Promise.reject(new Error("output stream rejected a write but cannot signal drain"));
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      stream.removeListener?.("drain", onDrain);
      stream.removeListener?.("error", onError);
      stream.removeListener?.("close", onClose);
    };
    const onDrain = () => { cleanup(); resolve(); };
    const onError = (error) => { cleanup(); reject(error instanceof Error ? error : new Error(String(error))); };
    const onClose = () => { cleanup(); reject(Object.assign(new Error("output stream closed before drain"), {code: "EOF"})); };
    stream.once("drain", onDrain);
    stream.once("error", onError);
    stream.once("close", onClose);
  });
}

async function startChengFusionMcpServer(stdin = process.stdin, stdout = process.stdout, stderr = process.stderr) {
  const maxQueuedClientMessages = 32;
  const maxQueuedClientBytes = JSON_RPC_MAX_FRAME_BYTES;
  const highWaterMessages = 8;
  const lowWaterMessages = 4;
  const highWaterBytes = 8 * 1024 * 1024;
  const lowWaterBytes = 4 * 1024 * 1024;
  let nextServerRequestId = 1;
  const pendingServerRequests = new Map();
  const queuedClientMessages = [];
  let queuedClientBytes = 0;
  let processingClientMessage = false;
  let inputPaused = false;
  let inputEnded = false;
  let inputEndReason = "stdin ended";
  let gracefulDrainInFlight = false;
  let outputTail = Promise.resolve();
  let shuttingDown = false;
  function logStderr(text) {
    try {
      stderr.write(text.endsWith("\n") ? text : text + "\n");
    } catch {
      // stderr itself is gone; nothing left to do but stay alive silently.
    }
  }
  function shutdown(reason, exitCode, immediate = true) {
    if (shuttingDown) return;
    shuttingDown = true;
    queuedClientMessages.length = 0;
    queuedClientBytes = 0;
    const disconnectError = new Error(`MCP client disconnected: ${reason}`);
    for (const pending of pendingServerRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(disconnectError);
    }
    pendingServerRequests.clear();
    logStderr(`cheng-fusion: ${reason}; exiting ${exitCode === 0 ? "cleanly" : "with failure"}`);
    if (immediate) process.exit(exitCode);
    process.exitCode = exitCode;
  }
  function gracefulExit(reason) {
    shutdown(reason, 0);
  }
  function fatalExit(error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    shutdown(message, 1);
  }
  function isBrokenPipe(error) {
    const code = error && (error.code || error.errno);
    return code === "EPIPE" || code === "EOF" || code === "ERR_STREAM_DESTROYED" || code === "ERR_STREAM_WRITE_AFTER_END";
  }
  function updateInputFlow() {
    if (shuttingDown) return;
    if (inputEnded) {
      if (!inputPaused) stdin.pause?.();
      inputPaused = true;
      return;
    }
    // A server-initiated roots/list response must always be allowed through the
    // same duplex stream, otherwise pausing at high water could deadlock the
    // active request. Excess requests are still bounded below and fail hard.
    const mustReceiveServerResponse = pendingServerRequests.size > 0;
    const aboveHighWater = queuedClientMessages.length >= highWaterMessages || queuedClientBytes >= highWaterBytes;
    const belowLowWater = queuedClientMessages.length <= lowWaterMessages && queuedClientBytes <= lowWaterBytes;
    if (!inputPaused && aboveHighWater && !mustReceiveServerResponse) {
      stdin.pause?.();
      inputPaused = true;
    } else if (inputPaused && (mustReceiveServerResponse || belowLowWater)) {
      stdin.resume?.();
      inputPaused = false;
    }
  }

  function safeWrite(text) {
    const operation = outputTail.then(() => writeToStreamWithBackpressure(stdout, text));
    outputTail = operation.catch(() => {});
    return operation.catch((error) => {
      if (isBrokenPipe(error)) return gracefulExit(`stdout broken pipe (${error.code || error.errno})`);
      throw error;
    });
  }

  function maybeFinishAfterInputEnd() {
    if (!inputEnded || shuttingDown || gracefulDrainInFlight) return;
    if (processingClientMessage || queuedClientMessages.length > 0 || pendingServerRequests.size > 0) return;
    gracefulDrainInFlight = true;
    const observedOutputTail = outputTail;
    observedOutputTail.then(() => {
      gracefulDrainInFlight = false;
      if (shuttingDown) return;
      if (
        processingClientMessage
        || queuedClientMessages.length > 0
        || pendingServerRequests.size > 0
        || outputTail !== observedOutputTail
      ) {
        maybeFinishAfterInputEnd();
        return;
      }
      // Do not call process.exit here: even a write that returned true may still
      // be buffered by the runtime. With stdin exhausted, setting exitCode lets
      // the event loop flush the transport before exiting naturally.
      shutdown(`${inputEndReason}; all requests and output drained`, 0, false);
    }).catch((error) => fatalExit(error));
  }
  function writeJson(message) {
    return safeWrite(JSON.stringify(message) + "\n");
  }
  function requestClient(method, params = {}, timeoutMs = 1000) {
    const id = `cheng-fusion-${nextServerRequestId++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingServerRequests.delete(id);
        updateInputFlow();
        maybeFinishAfterInputEnd();
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pendingServerRequests.set(id, {resolve, reject, timer});
      updateInputFlow();
      writeJson({jsonrpc: "2.0", id, method, params}).catch((error) => {
        const pending = pendingServerRequests.get(id);
        if (!pending) return;
        pendingServerRequests.delete(id);
        clearTimeout(pending.timer);
        updateInputFlow();
        maybeFinishAfterInputEnd();
        reject(error);
      });
    });
  }
  async function refreshWorkspaceRoots() {
    if (!mcpClientCanListRoots) return mcpWorkspaceRootHints;
    // Clear the cache before asking the client. A timeout/error must never leave a stale
    // previous-project root available to a later tool call.
    updateMcpWorkspaceRoots({roots: []});
    try {
      const result = await requestClient("roots/list", {}, 1000);
      return [...updateMcpWorkspaceRoots(result)];
    } catch (error) {
      updateMcpWorkspaceRoots({roots: []});
      throw error;
    }
  }

  function settleServerResponse(message) {
    if (message.id !== undefined && message.method === undefined && pendingServerRequests.has(message.id)) {
      const pending = pendingServerRequests.get(message.id);
      pendingServerRequests.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else pending.resolve(message.result || {});
      updateInputFlow();
      maybeFinishAfterInputEnd();
      return true;
    }
    return false;
  }

  async function processClientMessage(message) {
    if (message.id === undefined) {
      if (message.method === "notifications/initialized" || message.method === "notifications/roots/list_changed") {
        try {
          await refreshWorkspaceRoots();
        } catch (error) {
          logStderr(`roots/list refresh failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return;
    }
    try {
      const result = await handleMcpRequest(message, {refreshWorkspaceRoots});
      await writeJson({jsonrpc: "2.0", id: message.id, result});
    } catch (error) {
      await safeWrite(encodeError(message, error));
    }
  }

  async function pumpClientMessages() {
    if (processingClientMessage || shuttingDown) return;
    processingClientMessage = true;
    try {
      while (!shuttingDown && queuedClientMessages.length > 0) {
        const next = queuedClientMessages.shift();
        queuedClientBytes -= next.frameBytes;
        updateInputFlow();
        await processClientMessage(next.message);
      }
    } finally {
      processingClientMessage = false;
      updateInputFlow();
      maybeFinishAfterInputEnd();
    }
  }

  function enqueueClientMessage(message, frame = {}) {
    if (shuttingDown) return;
    if (settleServerResponse(message)) return;
    const frameBytes = Number.isSafeInteger(frame.frameBytes) && frame.frameBytes >= 0
      ? frame.frameBytes
      : Buffer.byteLength(JSON.stringify(message), "utf8");
    if (queuedClientMessages.length >= maxQueuedClientMessages || queuedClientBytes + frameBytes > maxQueuedClientBytes) {
      throw new Error(`MCP input request queue exceeded its bound (${maxQueuedClientMessages} messages / ${maxQueuedClientBytes} bytes)`);
    }
    queuedClientMessages.push({message, frameBytes});
    queuedClientBytes += frameBytes;
    updateInputFlow();
    pumpClientMessages().catch((error) => {
      fatalExit(error);
    });
  }

  const onData = createMessageReader(enqueueClientMessage, (error) => {
    fatalExit(error);
  });
  function finishInput(reason) {
    if (inputEnded || shuttingDown) return;
    inputEnded = true;
    inputEndReason = reason;
    stdin.removeListener?.("data", onData);
    stdin.pause?.();
    inputPaused = true;
    onData.end?.();
    maybeFinishAfterInputEnd();
  }
  // Robustness: an async EPIPE on stdout surfaces as an 'error' event (not a
  // throw). Without a handler it becomes an uncaughtException that kills the
  // process. A broken pipe here means the client is gone -> exit cleanly.
  stdout.on?.("error", (error) => {
    if (isBrokenPipe(error)) return gracefulExit(`stdout error (${error.code || error.errno})`);
    fatalExit(error);
  });
  // EOF closes only the client's write half. Finish every frame already
  // accepted, every server-initiated request, and every backpressured response
  // before allowing the process to exit.
  stdin.on?.("end", () => finishInput("stdin ended"));
  stdin.on?.("close", () => finishInput("stdin closed"));
  stdin.on?.("error", (error) => {
    const code = error && (error.code || error.errno);
    if (code === "ECONNRESET" || isBrokenPipe(error)) return gracefulExit(`stdin error (${code})`);
    fatalExit(error);
  });
  stdin.on("data", onData);
  stdin.resume?.();
}

export {createMessageReader,getChengFusionTools,handleMcpRequest,startChengFusionMcpServer,writeToStreamWithBackpressure};
