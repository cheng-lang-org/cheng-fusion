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
const chengToolsWithoutProjectRoot = new Set(["cheng_crash_triage"]);
const chengMutatingTools = new Set(["cheng_csg_roundtrip", "cheng_profile_report"]);

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
  if (workspaceRoots.length > 0 || cwd || (options.existingWorkspaceRoots || []).length > 0) {
    return {workspaceRoots, cwd};
  }
  const argumentsInput = params?.arguments || {};
  const argumentWorkspaceRoots = collectWorkspaceRoots(argumentsInput);
  const argumentCwd = collectWorkingDirectories(argumentsInput)[0] || null;
  if (argumentWorkspaceRoots.length > 0 || argumentCwd) {
    return {workspaceRoots: argumentWorkspaceRoots, cwd: argumentCwd};
  }
  return {workspaceRoots, cwd};
}

function updateMcpWorkspaceRoots(params = {}) {
  const roots = collectWorkspaceRoots(params);
  if (roots.length === 0) return mcpWorkspaceRootHints;
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
    const directRoots = collectWorkspaceRoots(message.params);
    if (directRoots.length === 0 && typeof transportContext.refreshWorkspaceRoots === "function") {
      await transportContext.refreshWorkspaceRoots();
    }
    const context = buildMcpInvocationContext(message.params, {existingWorkspaceRoots: mcpWorkspaceRootHints});
    const callRoots = context.workspaceRoots;
    setChengProjectRootHints(callRoots.length > 0 ? callRoots : mcpWorkspaceRootHints);
    const name = message.params?.name;
    const tool = getChengFusionTools().find((candidate) => candidate.name === name);
    if (!tool) throw Object.assign(new Error(`Cheng fusion tool not found: ${name}`), {code: -32602});
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
        onMessage(JSON.parse(body));
        continue;
      }
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const line = buffer.toString("utf8", 0, newline).replace(/\r$/, "").trim();
      buffer = buffer.subarray(newline + 1);
      if (line) onMessage(JSON.parse(line));
    }
  };
}

async function startChengFusionMcpServer(stdin = process.stdin, stdout = process.stdout, stderr = process.stderr) {
  let nextServerRequestId = 1;
  const pendingServerRequests = new Map();
  function writeJson(message) {
    stdout.write(JSON.stringify(message) + "\n");
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
    try {
      const result = await requestClient("roots/list", {}, 1000);
      return updateMcpWorkspaceRoots(result);
    } catch {
      return mcpWorkspaceRootHints;
    }
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
      if (message.method === "notifications/initialized") refreshWorkspaceRoots().catch(() => {});
      if (message.method === "notifications/roots/list_changed") refreshWorkspaceRoots().catch(() => {});
      return;
    }
    try {
      const result = await handleMcpRequest(message, {refreshWorkspaceRoots});
      writeJson({jsonrpc: "2.0", id: message.id, result});
    } catch (error) {
      stdout.write(encodeError(message, error));
    }
  }, (error) => {
    stderr.write((error instanceof Error ? error.stack || error.message : String(error)) + "\n");
  });
  stdin.on("data", onData);
  stdin.resume?.();
}

export {getChengFusionTools,handleMcpRequest,startChengFusionMcpServer};
