// @ts-nocheck
// Adapted from claude-code-ts/claude/tool/cheng_fusion_mcp_server_m9009.ts.
// Only change: getChengFusionTools() now reads from the local static registry
// (./cheng_fusion_tool_registry.ts) instead of filtering the full claude-code
// builtin tool registry (../artifact/builtin_tool_registry_m4623.ts) by name
// prefix "cheng_". Behavior (tool list, order, schemas, dispatch) is unchanged.
import {getChengFusionTools as getAllChengFusionTools, initChengFusionToolRegistryModule} from "./cheng_fusion_tool_registry.ts";
import {setChengProjectRootHints,withChengInvocationContext,zodToJsonSchema} from "./cheng_toolkit_m9000.ts";

let mcpWorkspaceRootHints = [];
let mcpClientCanListRoots = false;
const chengToolsWithoutProjectRoot = new Set(["cheng_crash_triage", "cheng_corrupt_hunt", "cheng_shape_matrix", "cheng_claim_audit", "cheng_ignition_chain", "cheng_orphan_slot_scan", "cheng_fixture_matrix"]);
const chengMutatingTools = new Set(["cheng_csg_roundtrip", "cheng_profile_report", "cheng_exec_diff", "cheng_zc_census", "cheng_shape_matrix", "cheng_ignition_chain", "cheng_residual_peel", "cheng_fixture_matrix"]);

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
  if (!tool.inputSchema?.safeParse) return {ok: true, value: input || {}};
  const parsed = tool.inputSchema.safeParse(input || {});
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
    push(value.cwd);
    push(value.currentWorkingDirectory);
    for (const root of value.workspaceRoots || []) push(root);
    for (const root of value.workspace_roots || []) push(root);
    for (const folder of value.workspaceFolders || []) push(folder);
    for (const folder of value.workspace_folders || []) push(folder);
    for (const root of value.roots || []) push(root);
    for (const root of value.clientInfo?.workspaceFolders || []) push(root);
  };
  visit(params);
  visit(params.arguments);
  visit(params._meta);
  visit(params._meta?.arguments);
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
  visit(params.arguments);
  visit(params._meta);
  visit(params._meta?.arguments);
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

async function handleMcpRequest(message, transportContext = {}) {
  if (message.method === "initialize") {
    updateMcpClientCapabilities(message.params);
    updateMcpWorkspaceRoots(message.params);
    return {
      protocolVersion: message.params?.protocolVersion || "2025-11-25",
      capabilities: {tools: {}},
      serverInfo: {name: "cheng-fusion", version: "2.1.205"},
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
    const tool = getChengFusionTools().find((candidate) => candidate.name === name);
    if (!tool) throw Object.assign(new Error(`Cheng fusion tool not found: ${name}`), {code: -32602});
    const directRoots = collectWorkspaceRoots(message.params);
    if (!chengToolsWithoutProjectRoot.has(tool.name) && directRoots.length === 0 && typeof transportContext.refreshWorkspaceRoots === "function") {
      await transportContext.refreshWorkspaceRoots();
    }
    const context = buildMcpInvocationContext(message.params, {existingWorkspaceRoots: mcpWorkspaceRootHints});
    const validation = validateInput(tool, stripMcpContextFields(message.params?.arguments || {}));
    if (!validation.ok) return {isError: true, content: [{type: "text", text: `Invalid input for ${tool.name}: ${validation.error}`}]};
    try {
      const input = chengToolsWithoutProjectRoot.has(tool.name)
        ? validation.value
        : withChengInvocationContext(validation.value, context, {requireRoot: true, requireActiveProjectContext: true});
      const result = await tool.execute(input);
      return {content: toolContent(result)};
    } catch (error) {
      return {isError: true, content: [{type: "text", text: error instanceof Error ? error.message : String(error)}]};
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
  let buffer = Buffer.alloc(0);
  // Robustness: onMessage is async and called fire-and-forget from the stdin
  // 'data' listener. A synchronous throw or a rejected promise escaping here
  // becomes an uncaught exception / unhandled rejection that kills the process
  // (= client disconnect). Route both to onError (stderr) and keep reading.
  const dispatch = (parsed) => {
    try {
      const returned = onMessage(parsed);
      if (returned && typeof returned.then === "function") returned.catch((err) => onError(err));
    } catch (err) {
      onError(err);
    }
  };
  // Robustness: a partial/corrupt frame must not throw out of the 'data'
  // listener. Parse in isolation; on failure record the bad frame on stderr and
  // skip it (the buffer has already been advanced past this frame), continuing
  // to read subsequent well-formed frames. Valid frames are unaffected.
  const parseFrame = (text) => {
    try {
      return {ok: true, value: JSON.parse(text)};
    } catch (err) {
      onError(new Error(`failed to parse MCP frame (${text.length} bytes), skipping: ${err instanceof Error ? err.message : String(err)}`));
      return {ok: false};
    }
  };
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (buffer.length === 0) return;
      const preview = buffer.toString("utf8", 0, Math.min(buffer.length, 32));
      if (/^Content-Length:/i.test(preview)) {
        const split = buffer.indexOf("\r\n\r\n");
        if (split < 0) return;
        const header = buffer.toString("utf8", 0, split);
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) return onError(new Error(`bad MCP header: ${header}`));
        const length = Number(match[1]);
        const start = split + 4;
        if (buffer.length < start + length) return;
        const body = buffer.toString("utf8", start, start + length);
        buffer = buffer.subarray(start + length);
        const parsed = parseFrame(body);
        if (parsed.ok) dispatch(parsed.value);
        continue;
      }
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const line = buffer.toString("utf8", 0, newline).replace(/\r$/, "").trim();
      buffer = buffer.subarray(newline + 1);
      if (line) {
        const parsed = parseFrame(line);
        if (parsed.ok) dispatch(parsed.value);
      }
    }
  };
}

async function startChengFusionMcpServer(stdin = process.stdin, stdout = process.stdout, stderr = process.stderr) {
  let nextServerRequestId = 1;
  const pendingServerRequests = new Map();
  let shuttingDown = false;
  function logStderr(text) {
    try {
      stderr.write(text.endsWith("\n") ? text : text + "\n");
    } catch {
      // stderr itself is gone; nothing left to do but stay alive silently.
    }
  }
  function gracefulExit(reason) {
    if (shuttingDown) return;
    shuttingDown = true;
    logStderr(`cheng-fusion: ${reason}; exiting cleanly`);
    process.exit(0);
  }
  function isBrokenPipe(error) {
    const code = error && (error.code || error.errno);
    return code === "EPIPE" || code === "EOF" || code === "ERR_STREAM_DESTROYED" || code === "ERR_STREAM_WRITE_AFTER_END";
  }
  // Robustness: the client's read end can vanish mid-write (EPIPE) or the stream
  // can already be destroyed. Never let a stdout write throw out of a handler and
  // kill the process. A broken pipe means the client is gone -> exit cleanly; any
  // other write error is recorded on stderr without crashing. Bytes for the happy
  // path are unchanged: on success this is exactly `stdout.write(text)`.
  function safeWrite(text) {
    try {
      stdout.write(text);
    } catch (error) {
      if (isBrokenPipe(error)) return gracefulExit(`stdout broken pipe (${error.code || error.errno})`);
      logStderr(`cheng-fusion: stdout write error: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    }
  }
  function writeJson(message) {
    safeWrite(JSON.stringify(message) + "\n");
  }
  function requestClient(method, params = {}, timeoutMs = 1000) {
    const id = `cheng-fusion-${nextServerRequestId++}`;
    writeJson({jsonrpc: "2.0", id, method, params});
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingServerRequests.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pendingServerRequests.set(id, {resolve, reject, timer});
    });
  }
  async function refreshWorkspaceRoots() {
    if (!mcpClientCanListRoots) return mcpWorkspaceRootHints;
    // Clear the cache before asking the client. A timeout/error must never leave a stale
    // previous-project root available to a later tool call.
    updateMcpWorkspaceRoots({roots: []});
    const result = await requestClient("roots/list", {}, 1000);
    return updateMcpWorkspaceRoots(result);
  }
  const onData = createMessageReader(async (message) => {
    if (message.id !== undefined && message.method === undefined && pendingServerRequests.has(message.id)) {
      const pending = pendingServerRequests.get(message.id);
      pendingServerRequests.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else pending.resolve(message.result || {});
      return;
    }
    if (message.id === undefined) {
      if (message.method === "notifications/initialized" || message.method === "notifications/roots/list_changed") {
        refreshWorkspaceRoots().catch((error) => {
          stderr.write(`roots/list refresh failed: ${error instanceof Error ? error.message : String(error)}\n`);
        });
      }
      return;
    }
    try {
      const result = await handleMcpRequest(message, {refreshWorkspaceRoots});
      writeJson({jsonrpc: "2.0", id: message.id, result});
    } catch (error) {
      safeWrite(encodeError(message, error));
    }
  }, (error) => {
    logStderr((error instanceof Error ? error.stack || error.message : String(error)));
  });
  // Robustness: an async EPIPE on stdout surfaces as an 'error' event (not a
  // throw). Without a handler it becomes an uncaughtException that kills the
  // process. A broken pipe here means the client is gone -> exit cleanly.
  stdout.on?.("error", (error) => {
    if (isBrokenPipe(error)) return gracefulExit(`stdout error (${error.code || error.errno})`);
    logStderr(`cheng-fusion: stdout error: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  });
  // Robustness: the client closing its write end (stdin EOF) is the normal
  // disconnect signal -> exit cleanly so we don't linger. A stdin error that is
  // a reset/broken pipe is also a disconnect; anything else is recorded but not
  // fatal.
  stdin.on?.("end", () => gracefulExit("stdin ended"));
  stdin.on?.("close", () => gracefulExit("stdin closed"));
  stdin.on?.("error", (error) => {
    const code = error && (error.code || error.errno);
    if (code === "ECONNRESET" || isBrokenPipe(error)) return gracefulExit(`stdin error (${code})`);
    logStderr(`cheng-fusion: stdin error: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  });
  // Robustness: process-level last line of defense for the running server (the
  // index.ts .catch only guards startup). A broken pipe / reset escaping any
  // path is a real disconnect -> exit cleanly. Any other uncaught error or
  // unhandled rejection is a bug we must surface on stderr, but crashing drops
  // the whole MCP session, so we log and keep the process alive.
  process.on("uncaughtException", (error) => {
    if (isBrokenPipe(error) || (error && (error.code || error.errno) === "ECONNRESET")) {
      return gracefulExit(`uncaught stream disconnect (${error.code || error.errno})`);
    }
    logStderr(`cheng-fusion: uncaughtException (kept alive): ${error instanceof Error ? error.stack || error.message : String(error)}`);
  });
  process.on("unhandledRejection", (reason) => {
    if (isBrokenPipe(reason) || (reason && (reason.code || reason.errno) === "ECONNRESET")) {
      return gracefulExit(`unhandled stream disconnect (${reason.code || reason.errno})`);
    }
    logStderr(`cheng-fusion: unhandledRejection (kept alive): ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`);
  });
  stdin.on("data", onData);
  stdin.resume?.();
}

export {getChengFusionTools,handleMcpRequest,startChengFusionMcpServer};
