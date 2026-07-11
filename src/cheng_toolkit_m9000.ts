// @ts-nocheck
import {existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from "node:fs";
import {spawn, spawnSync} from "node:child_process";
import {basename, dirname, isAbsolute, join, relative, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {b as defineModuleInitializer} from "./runtime.ts";
import * as zodSchema from "zod";
const initZodModule = () => {};
import {withDefaultToolDefinitionBehavior as withDefaultToolDefinitionBehavior, initToolDefinitionLookupAndDefaultsModule as initToolDefinitionLookupAndDefaultsModule} from "./tool_definition_lookup_and_defaults_m2929.ts";

const CHENG_TOOLCHAIN_ROOT = process.env.CHENG_TOOLCHAIN_ROOT || process.env.CHENG_ROOT || "/Users/lbcheng/cheng-lang";
const CHENG_ROOT = CHENG_TOOLCHAIN_ROOT;
const CHENG_DRIVER = process.env.CHENG_DRIVER || join(CHENG_TOOLCHAIN_ROOT, "artifacts/backend_driver/cheng");
const CHENG_STAGE3_DRIVER = process.env.CHENG_STAGE3_DRIVER || join(CHENG_TOOLCHAIN_ROOT, "artifacts/bootstrap/cheng.stage3");
// Fusion-vendored cold driver: bootstrap/cheng_cold.c from CHENG_TOOLCHAIN_ROOT
// patched to understand CSG record kind=9 (call-edge facts) and compiled by
// vendor/cold-driver/build.sh, without touching the main repo tree. See
// resolveColdCsgDriver() in cheng_csg_roundtrip_m9003.ts for priority order.
const CHENG_FUSION_PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHENG_FUSION_VENDOR_COLD_DRIVER = process.env.CHENG_FUSION_VENDOR_COLD_DRIVER || join(CHENG_FUSION_PACKAGE_ROOT, "vendor/cold-driver/cheng_cold_csg9");
const CHENG_LSP_DEFAULT = join(CHENG_TOOLCHAIN_ROOT, "artifacts/cheng-lsp");
const CSG_CORE_READER_ROOT = process.env.CSG_CORE_READER_ROOT || process.env.TS_CSG_ROOT || join(CHENG_TOOLCHAIN_ROOT, "ts-csg");
const CSG_CORE_READER = join(CSG_CORE_READER_ROOT, "dist/csgc-reader.js");
const CHENG_CANARY = "src/tests/ordinary_zero_exit_fixture.cheng";
const CHENG_INVOCATION_CONTEXT_VERIFIED = Symbol.for("openclaude.cheng.invocationContextVerified");
const CHENG_FUSION_RSS_CAP_BYTES_DEFAULT = "1073741824";
const CHENG_FUSION_LSP_TIMEOUT_MS_DEFAULT = 15000;
const CHENG_FUSION_DRIVER_TIMEOUT_MS_DEFAULT = 120000;
let chengProjectRootHints = [];

// RSS 帽: 每个 Cheng driver 子进程都必须带 CHENG_PROCESS_MAX_RSS_BYTES, 可被 CHENG_FUSION_RSS_CAP 覆盖.
function chengFusionRssCapBytes() {
  const override = String(process.env.CHENG_FUSION_RSS_CAP || "").trim();
  return override || CHENG_FUSION_RSS_CAP_BYTES_DEFAULT;
}

function chengDriverSpawnEnv(extraEnv = {}) {
  return {...process.env, CHENG_PROCESS_MAX_RSS_BYTES: chengFusionRssCapBytes(), ...extraEnv};
}

// 超时孤儿: 单一 env 旋钮 CHENG_FUSION_TIMEOUT_MS, 存在时覆盖所有调用点(不论各自默认值多大).
function chengFusionTimeoutMs(defaultMs) {
  const raw = Number(process.env.CHENG_FUSION_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : defaultMs;
}

function killChengProcessGroup(child, signal = "SIGKILL") {
  if (!child || child.killed) return;
  try {
    if (typeof child.pid === "number") process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (error && error.code !== "ESRCH") {
      try { child.kill(signal); } catch {}
    }
  }
}

function initChengToolkit() {
  initToolDefinitionLookupAndDefaultsModule();
  initZodModule();
}

function textResult(text) {
  return {content: [{type: "text", text: String(text)}]};
}

function jsonResult(value) {
  return textResult(JSON.stringify(value, null, 2));
}

function takeTrailingText(value, limit = 4000) {
  const text = String(value || "");
  return text.length > limit ? text.slice(-limit) : text;
}

// ZC_NOT_READY idx=E/T function=NAME body_kind=KIND detail=... line=NUM fz_kind=... stmt_kind=... bail=NUM slot_diag=...
// Shared between cheng_exec_diff (compile_wall detection: function/bodyKind/bail only,
// loose match tolerant of field-order drift) and cheng_zc_census (needs every field when
// zc_enumerate.sh falls back to printing this raw line shape instead of its structured
// pipe rows) — one producer (backend_driver_dispatch_min.cheng), one parser per need.
const ZC_NOT_READY_LINE = /^ZC_NOT_READY idx=(\d+)\/(\d+) function=(\S+) body_kind=(\S+) .*?\bbail=(-?\d+)\b/m;
const ZC_NOT_READY_LINE_FULL = /^ZC_NOT_READY idx=(\d+)\/(\d+) function=(\S+) body_kind=(\S+) detail=(\S+) line=(\d+) fz_kind=(\S+) stmt_kind=(\S+) bail=(-?\d+) slot_diag=(\S+)/;
const ZC_NOT_READY_TOTAL = /^ZC_NOT_READY_TOTAL count=(\d+)/m;

function parseZcNotReady(text) {
  const combined = String(text || "");
  const entries = [];
  const lineRe = new RegExp(ZC_NOT_READY_LINE.source, "gm");
  let match;
  while ((match = lineRe.exec(combined)) !== null) {
    entries.push({function: match[3], bodyKind: match[4], bail: Number(match[5])});
  }
  const totalMatch = combined.match(ZC_NOT_READY_TOTAL);
  return {entries, total: totalMatch ? Number(totalMatch[1]) : entries.length};
}

function parseZcNotReadyLineFull(line) {
  const match = String(line || "").match(ZC_NOT_READY_LINE_FULL);
  if (!match) return null;
  return {function: match[3], bodyKind: match[4], detail: match[5], line: Number(match[6]), fzKind: match[7], stmtKind: match[8], bail: match[9], slotDiag: match[10]};
}

function stripUntrustedChengInvocationContextFields(input = {}) {
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
  delete out.roots;
  return out;
}

function createChengTextTool(config) {
  return withDefaultToolDefinitionBehavior({
    name: config.name,
    searchHint: config.searchHint,
    maxResultSizeChars: config.maxResultSizeChars || 1e5,
    shouldDefer: true,
    get inputSchema() {
      return config.inputSchema;
    },
    isEnabled() {
      return true;
    },
    toAutoClassifierInput(input) {
      return config.toAutoClassifierInput ? config.toAutoClassifierInput(input) : `${config.name}:${JSON.stringify(input || {})}`;
    },
    async description() {
      return config.description;
    },
    async prompt() {
      return config.prompt || config.description;
    },
    async call(input) {
      const result = await this.execute(input);
      return {data: result?.content?.[0]?.text || ""};
    },
    mapToolResultToToolResultBlockParam(data, toolUseId) {
      return {tool_use_id: toolUseId, type: "tool_result", content: data};
    },
    async execute(input) {
      const rawInput = input || {};
      const trustedInput = rawInput?.[CHENG_INVOCATION_CONTEXT_VERIFIED]
        ? rawInput
        : stripUntrustedChengInvocationContextFields(rawInput);
      const executionInput = config.requiresChengProjectRoot
        ? withChengInvocationContext(trustedInput, {}, {requireRoot: true, requireActiveProjectContext: true})
        : trustedInput;
      return config.execute(executionInput);
    },
  });
}

function projectRootFromImportMeta() {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function pathExistsDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function pathExistsFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function normalizeMaybeFileUri(value) {
  const text = String(value || "");
  if (text.startsWith("file://")) return fileURLToPath(text);
  return text;
}

function findChengPackageRoot(startPath) {
  if (!startPath) return null;
  let current = resolve(normalizeMaybeFileUri(startPath));
  if (pathExistsFile(current)) current = dirname(current);
  for (;;) {
    if (existsSync(join(current, "cheng-package.toml"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function normalizeChengProjectRoot(root, label = "Cheng project root") {
  const resolvedRoot = resolve(normalizeMaybeFileUri(root));
  if (!pathExistsDirectory(resolvedRoot)) throw new Error(`${label} does not exist: ${resolvedRoot}`);
  if (!existsSync(join(resolvedRoot, "cheng-package.toml"))) {
    throw new Error(`${label} is not a Cheng project root (missing cheng-package.toml): ${resolvedRoot}`);
  }
  return resolvedRoot;
}

function uniqueProjectRoots(candidates) {
  const roots = [];
  const seen = new Set();
  for (const candidate of candidates || []) {
    if (!candidate) continue;
    const root = findChengPackageRoot(normalizeMaybeFileUri(candidate));
    if (!root || seen.has(root)) continue;
    seen.add(root);
    roots.push(root);
  }
  return roots;
}

function isInsideOrEqual(path, root) {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function assertChengProjectPathBelongsToRoot(value, root, label) {
  if (!value) return null;
  const text = normalizeMaybeFileUri(value);
  const path = isAbsolute(text) ? resolve(text) : resolve(root, text);
  assertInsideProject(path, root);
  const ownerRoot = findChengPackageRoot(path);
  if (ownerRoot && ownerRoot !== root) {
    throw new Error(`${label} belongs to a different Cheng project root: ${path} (active=${root}, owner=${ownerRoot})`);
  }
  return path;
}

function assertChengProjectInputPaths(input = {}, root) {
  for (const key of ["file", "source", "rawProfile", "facts", "outDir", "out", "reportOut"]) {
    if (input[key]) assertChengProjectPathBelongsToRoot(input[key], root, key);
  }
}

function finalizeChengProjectRoot(root, input = {}) {
  const normalizedRoot = normalizeChengProjectRoot(root);
  assertChengProjectInputPaths(input, normalizedRoot);
  return normalizedRoot;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function setChengProjectRootHints(candidates = []) {
  chengProjectRootHints = uniqueProjectRoots(candidates);
  return [...chengProjectRootHints];
}

function getChengProjectRootHints() {
  return [...chengProjectRootHints];
}

function resolveRelativeFileProjectRoot(file, roots) {
  const matches = [];
  for (const root of roots) {
    const candidate = resolve(root, file);
    if (!isInsideOrEqual(candidate, root)) continue;
    const candidateRoot = findChengPackageRoot(candidate);
    if (candidateRoot === root) matches.push(root);
  }
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`relative Cheng file is ambiguous across active workspace roots: ${file}`);
  return null;
}

function shouldUseProcessCwdForProjectRoot(processCwdRoot, hintedRoots) {
  if (!processCwdRoot) return false;
  if (hintedRoots.length === 0) return true;
  return hintedRoots.length > 1 && hintedRoots.includes(processCwdRoot);
}

function resolveActiveChengProjectRoot(input = {}) {
  const hintedRoots = uniqueProjectRoots([...asArray(input.workspaceRoots), ...chengProjectRootHints]);
  const processCwd = process.cwd();
  const processCwdRoot = findChengPackageRoot(processCwd);
  const explicitCwd = input.cwd ? normalizeMaybeFileUri(input.cwd) : null;
  const cwd = explicitCwd || (shouldUseProcessCwdForProjectRoot(processCwdRoot, hintedRoots) ? processCwd : null);
  const projectSelectorPath = input.file || input.source || input.rawProfile;
  if (projectSelectorPath) {
    const file = normalizeMaybeFileUri(projectSelectorPath);
    let fileRoot = null;
    if (isAbsolute(file)) {
      fileRoot = findChengPackageRoot(file);
      if (!fileRoot) throw new Error(`Cheng file is not inside a Cheng project (missing cheng-package.toml above it): ${file}`);
    }
    else {
      if (cwd) {
        const cwdRoot = findChengPackageRoot(cwd);
        const candidate = resolve(cwd, file);
        if (cwdRoot && !isInsideOrEqual(candidate, cwdRoot)) {
          throw new Error(`Cheng file is not inside the active Cheng project root: ${file}`);
        }
        fileRoot = findChengPackageRoot(candidate);
      }
      if (!fileRoot) fileRoot = resolveRelativeFileProjectRoot(file, hintedRoots);
      if (!fileRoot && (cwd || hintedRoots.length > 0)) {
        throw new Error(`Cheng file is not inside the active Cheng project roots: ${file}`);
      }
    }
    if (fileRoot) return finalizeChengProjectRoot(fileRoot, input);
  }
  if (cwd) {
    const cwdRoot = findChengPackageRoot(cwd);
    if (cwdRoot) return finalizeChengProjectRoot(cwdRoot, input);
  }
  if (hintedRoots.length === 1) return finalizeChengProjectRoot(hintedRoots[0], input);
  if (hintedRoots.length > 1) {
    if (!explicitCwd && processCwdRoot && hintedRoots.includes(processCwdRoot)) return finalizeChengProjectRoot(processCwdRoot, input);
    throw new Error(`multiple active Cheng project roots; pass cwd, file, or source explicitly: ${hintedRoots.join(", ")}`);
  }
  throw new Error("Cheng project root not found. Open or launch from a Cheng workspace, pass MCP cwd/workspaceFolders, or pass file/source explicitly.");
}

function resolveChengProjectRoot(input = {}) {
  if (input.root) {
    return finalizeChengProjectRoot(normalizeChengProjectRoot(input.root), input);
  }
  let activeRoot = null;
  let activeRootError = null;
  try {
    activeRoot = resolveActiveChengProjectRoot(input);
  } catch (error) {
    activeRootError = error;
  }
  if (activeRoot) return finalizeChengProjectRoot(activeRoot, input);
  throw activeRootError || new Error("Cheng project root not found. Open or launch from a Cheng workspace, pass MCP cwd/workspaceFolders, or pass file/source explicitly.");
}

function resolveInvocationRelativePath(value, root, cwd, label) {
  if (!value || isAbsolute(normalizeMaybeFileUri(value))) return value;
  if (!cwd) return value;
  const cwdRoot = findChengPackageRoot(cwd);
  if (cwdRoot !== root) return value;
  const resolved = resolve(cwd, normalizeMaybeFileUri(value));
  if (!isInsideOrEqual(resolved, root)) {
    throw new Error(`${label} is outside the selected Cheng project root: ${value}`);
  }
  return resolved;
}

function normalizeInvocationProjectPaths(input = {}, root, cwd) {
  if (!cwd) return input;
  const out = {...input};
  for (const key of ["file", "source", "rawProfile", "facts", "outDir", "out", "reportOut"]) {
    if (out[key]) out[key] = resolveInvocationRelativePath(out[key], root, cwd, key);
  }
  return out;
}

function resolveContextChengProjectRoot(input, workspaceRoots, cwd, projectHintFile) {
  const withoutRoot = {...input};
  delete withoutRoot.root;
  return resolveChengProjectRoot({...withoutRoot, file: projectHintFile, ...(cwd ? {cwd} : {}), workspaceRoots});
}

function markChengInvocationContextVerified(input) {
  Object.defineProperty(input, CHENG_INVOCATION_CONTEXT_VERIFIED, {value: true, enumerable: false, configurable: true});
  return input;
}

function withChengInvocationContext(input = {}, context = {}, options = {}) {
  let out = {...input};
  if (input?.[CHENG_INVOCATION_CONTEXT_VERIFIED] && out.root) {
    out.root = finalizeChengProjectRoot(out.root, out);
    return markChengInvocationContextVerified(out);
  }
  const workspaceRoots = [
    ...asArray(input.workspaceRoots),
    ...asArray(context.workspaceRoots),
  ];
  const explicitCwd = input.cwd || context.cwd || null;
  const projectHintFile = out.file || out.source || out.rawProfile;
  let contextRoot = null;
  let contextRootError = null;
  if (!out.root) {
    try {
      contextRoot = resolveContextChengProjectRoot(out, workspaceRoots, explicitCwd, projectHintFile);
    } catch (error) {
      contextRootError = error;
    }
  }
  if (out.root) {
    out.root = normalizeChengProjectRoot(out.root);
  } else if (contextRoot) {
    out.root = contextRoot;
  } else {
    try {
      out.root = resolveChengProjectRoot({...out, file: projectHintFile, ...(explicitCwd ? {cwd: explicitCwd} : {}), workspaceRoots});
    } catch (error) {
      if (options.requireRoot) throw error;
      out._chengProjectRootError = error instanceof Error ? error.message : String(error);
    }
  }
  const processCwd = process.cwd();
  const processCwdRoot = findChengPackageRoot(processCwd);
  const cwd = explicitCwd || (out.root && processCwdRoot === out.root ? processCwd : null);
  if (out.root) {
    out = normalizeInvocationProjectPaths(out, out.root, cwd);
    assertChengProjectInputPaths(out, out.root);
  } else if (contextRootError && options.requireRoot) {
    throw contextRootError;
  }
  if (out.root) markChengInvocationContextVerified(out);
  return out;
}

function resolveProjectPath(value, root = resolveChengProjectRoot()) {
  if (!value) throw new Error("path is required");
  const path = normalizeMaybeFileUri(value);
  return isAbsolute(path) ? resolve(path) : resolve(root, path);
}

function assertInsideProject(path, root) {
  if (!isInsideOrEqual(path, root)) throw new Error(`path is outside Cheng project root: ${path}`);
}

function csgProjectRoot(input = {}) {
  return resolveChengProjectRoot(input);
}

function chengColdCsgDir(root = csgProjectRoot()) {
  return join(root, "conversion-reports", "cheng-csg");
}

function chengColdSummaryPath(root = csgProjectRoot()) {
  return join(chengColdCsgDir(root), "summary.json");
}

function chengColdFactsPath(root = csgProjectRoot()) {
  return join(chengColdCsgDir(root), "current.facts");
}

function resolveCsgFactsPath(input = {}, summary = null) {
  const root = csgProjectRoot(input);
  if (input.facts) {
    throw new Error(`facts path override is disabled; Cheng CSG is fixed to ${chengColdFactsPath(root)}`);
  }
  if (summary?.facts) {
    if (summary.root && normalizeChengProjectRoot(summary.root, "Cheng CSG summary root") !== root) {
      throw new Error(`Cheng CSG summary root mismatch: summary=${summary.root}, selected=${root}`);
    }
    const declared = isAbsolute(summary.facts) ? resolve(summary.facts) : resolve(root, summary.facts);
    assertInsideProject(declared, root);
    if (existsSync(declared)) return declared;
    throw new Error(`Cheng CSG summary facts not found: ${declared}`);
  }
  const cold = chengColdFactsPath(root);
  if (existsSync(cold)) return cold;
  return null;
}

function readChengSummary(input = {}) {
  const root = csgProjectRoot(input);
  const cold = chengColdSummaryPath(root);
  if (existsSync(cold)) return JSON.parse(readFileSync(cold, "utf8"));
  return null;
}

function appendToMapList(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

let csgFactsCache = new Map();

function sha256Hex(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function readU32LE(buffer, offset) {
  if (offset + 4 > buffer.length) throw new Error("truncated u32");
  return buffer.readUInt32LE(offset);
}

function readColdString(buffer, offset) {
  const length = readU32LE(buffer, offset);
  const start = offset + 4;
  const end = start + length;
  if (end > buffer.length) throw new Error("truncated cold string");
  return {value: buffer.toString("utf8", start, end), offset: end};
}

function parseColdReport(path) {
  if (!path || !existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index);
    const value = line.slice(index + 1);
    out[key] = /^-?[0-9]+$/.test(value) ? Number(value) : value;
  }
  return out;
}

function coldLogicalSymbolName(symbol) {
  return String(symbol || "").replace(/\$o[0-9a-f]{16}\$[0-9]+$/i, "");
}

function parseChengColdFacts(root, factsPath, summary = {}) {
  const raw = readFileSync(factsPath);
  const text = raw.toString("utf8");
  if (!text.startsWith("CHENG_CSG\n")) throw new Error(`not a CHENG_CSG facts file: ${factsPath}`);
  const symById = new Map();
  const funcById = new Map();
  const funcByName = new Map();
  const nameToIds = new Map();
  const callsOut = new Map();
  const refsIn = new Map();
  const unsupportedByCode = new Map();
  const modules = new Map();
  let recordCount = 0;
  let target = summary.target || null;
  let entry = null;
  let objectFormat = null;
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index];
    const match = line.match(/^R([0-9a-fA-F]{4})([0-9a-fA-F]{8})([0-9a-fA-F]*)$/);
    if (!match) throw new Error(`invalid CHENG_CSG record line ${index + 1}`);
    const kind = Number.parseInt(match[1], 16);
    const byteCount = Number.parseInt(match[2], 16);
    const payloadHex = match[3];
    if (payloadHex.length !== byteCount * 2) {
      throw new Error(`CHENG_CSG payload size mismatch at line ${index + 1}: kind=${kind} expected=${byteCount} actual=${payloadHex.length / 2}`);
    }
    if (kind < 0 || kind > 9) throw new Error(`unknown CHENG_CSG record kind ${kind} at line ${index + 1}`);
    recordCount++;
    const payload = kind === 1 || kind === 2 || kind === 3 || kind === 4 || kind === 6 || kind === 7 || kind === 9
      ? Buffer.from(payloadHex, "hex")
      : null;
    try {
      if (kind === 1) {
        target = readColdString(payload, 0).value;
      } else if (kind === 2) {
        objectFormat = readColdString(payload, 0).value;
      } else if (kind === 3) {
        entry = readColdString(payload, 0).value;
      } else if (kind === 4) {
        let offset = 0;
        const itemId = readU32LE(payload, offset); offset += 4;
        const wordOffset = readU32LE(payload, offset); offset += 4;
        const wordCount = readU32LE(payload, offset); offset += 4;
        const symbolRead = readColdString(payload, offset); offset = symbolRead.offset;
        const bodyRead = readColdString(payload, offset);
        const id = `cold:function:${itemId}`;
        const symbol = symbolRead.value;
        const name = coldLogicalSymbolName(symbol);
        const fn = {
          id,
          name,
          symbol,
          owner: null,
          returnType: null,
          async: false,
          generator: false,
          exported: true,
          kind: "cheng_cold.function",
          loc: {file: summary.source ? normalizeToSubstratePath(summary.source, root) : normalizeToSubstratePath(factsPath, root), recordLine: index + 1},
          itemId,
          wordOffset,
          wordCount,
          bodyKind: bodyRead.value,
        };
        funcById.set(id, fn);
        appendToMapList(funcByName, fn.name, id);
        appendToMapList(nameToIds, fn.name, id);
        if (fn.symbol !== fn.name) appendToMapList(nameToIds, fn.symbol, id);
      } else if (kind === 6) {
        let offset = 0;
        const sourceItemId = readU32LE(payload, offset); offset += 4;
        const wordOffset = readU32LE(payload, offset); offset += 4;
        const targetRead = readColdString(payload, offset);
        const owner = `cold:function:${sourceItemId}`;
        const targetSymbol = targetRead.value;
        const targetName = coldLogicalSymbolName(targetSymbol);
        const call = {
          kind: "cheng_cold.reloc",
          owner,
          sourceItemId,
          wordOffset,
          calleeText: targetSymbol,
          target: {name: targetName, fqName: targetSymbol},
          loc: {file: summary.source ? normalizeToSubstratePath(summary.source, root) : normalizeToSubstratePath(factsPath, root), recordLine: index + 1},
        };
        appendToMapList(callsOut, owner, call);
        appendToMapList(refsIn, targetName, call);
        if (targetSymbol !== targetName) appendToMapList(refsIn, targetSymbol, call);
      } else if (kind === 9) {
        // Intra-object call/address-ref edge: the writer resolved this call to a
        // function compiled into the same object and baked the branch/ADR
        // immediate directly, so it needed no kind-6 relocation and would
        // otherwise be invisible to the call graph. Informational only —
        // wordOffset is not tracked (no relocation site to point at).
        let offset = 0;
        const sourceItemId = readU32LE(payload, offset); offset += 4;
        const targetRead = readColdString(payload, offset);
        const owner = `cold:function:${sourceItemId}`;
        const targetSymbol = targetRead.value;
        const targetName = coldLogicalSymbolName(targetSymbol);
        const call = {
          kind: "cheng_cold.call_edge",
          owner,
          sourceItemId,
          wordOffset: null,
          calleeText: targetSymbol,
          target: {name: targetName, fqName: targetSymbol},
          loc: {file: summary.source ? normalizeToSubstratePath(summary.source, root) : normalizeToSubstratePath(factsPath, root), recordLine: index + 1},
        };
        appendToMapList(callsOut, owner, call);
        appendToMapList(refsIn, targetName, call);
        if (targetSymbol !== targetName) appendToMapList(refsIn, targetSymbol, call);
      } else if (kind === 7) {
        let offset = 0;
        const itemId = readU32LE(payload, offset); offset += 4;
        const symbolRead = readColdString(payload, offset); offset = symbolRead.offset;
        const id = `cold:data:${itemId}`;
        symById.set(id, {
          id,
          name: symbolRead.value,
          symbolKind: "data",
          declarationKind: "data",
          type: null,
          exported: true,
          loc: {file: summary.source ? normalizeToSubstratePath(summary.source, root) : normalizeToSubstratePath(factsPath, root), recordLine: index + 1},
        });
        appendToMapList(nameToIds, symbolRead.value, id);
      }
    } catch (error) {
      throw new Error(`failed to decode CHENG_CSG record at line ${index + 1}, kind=${kind}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (target || objectFormat || entry) {
    modules.set("cheng-cold", {path: "cheng-cold", target, objectFormat, entry});
  }
  const report = parseColdReport(summary.writerReport || summary.readerReport);
  return {
    schema: "cheng-cold-csg.facts.v1",
    root,
    factsPath,
    source: summary.source || null,
    generatedAt: summary.generatedAt || null,
    factCount: recordCount,
    factsRoot: summary.factsRoot || sha256Hex(raw),
    totals: {
      sourceFiles: summary.source ? 1 : 0,
      functions: funcById.size,
      symbols: symById.size,
      calls: [...callsOut.values()].reduce((sum, list) => sum + list.length, 0),
      records: recordCount,
      bytes: raw.length,
    },
    runtimeClosure: null,
    coreWorkflowUnsupported: null,
    target,
    objectFormat,
    entry,
    report,
    symById,
    funcById,
    funcByName,
    nameToIds,
    callsOut,
    refsIn,
    unsupportedByCode,
    modules,
  };
}

async function parseCsgCoreFacts(root, factsPath, summary = {}) {
  if (!existsSync(CSG_CORE_READER)) throw new Error(`CSG-Core reader not found: ${CSG_CORE_READER}`);
  const {csgcReadFacts} = await import(pathToFileURL(CSG_CORE_READER).href);
  const decoded = csgcReadFacts(readFileSync(factsPath));
  const facts = decoded.facts || [];
  const symById = new Map();
  const funcById = new Map();
  const funcByName = new Map();
  const nameToIds = new Map();
  const callsOut = new Map();
  const refsIn = new Map();
  const unsupportedByCode = new Map();
  const modules = new Map();
  for (const fact of facts) {
    if (fact.kind === "csg.symbol") {
      symById.set(fact.id, {
        id: fact.id,
        name: fact.name,
        symbolKind: fact.symbolKind,
        declarationKind: fact.declarationKind,
        type: fact.type,
        exported: fact.exported,
        loc: fact.loc,
      });
      if (fact.name) appendToMapList(nameToIds, fact.name, fact.id);
    } else if (fact.kind === "csg.function" || fact.kind === "csg.async_function") {
      funcById.set(fact.id, {
        id: fact.id,
        name: fact.name,
        symbol: fact.symbol,
        owner: fact.owner,
        returnType: fact.returnType,
        async: fact.async,
        generator: fact.generator,
        exported: fact.exported,
        kind: fact.kind,
        loc: fact.loc,
      });
      if (fact.name) {
        appendToMapList(funcByName, fact.name, fact.id);
        appendToMapList(nameToIds, fact.name, fact.id);
      }
    } else if (fact.kind === "csg.call") {
      appendToMapList(callsOut, fact.owner != null ? fact.owner : null, fact);
      const callee = fact.target?.name || fact.calleeText;
      if (callee) appendToMapList(refsIn, callee, fact);
    } else if (fact.kind === "csg.unsupported") {
      appendToMapList(unsupportedByCode, fact.code || fact.reason || fact.kind || "unknown", fact);
    } else if (fact.kind === "csg.module") {
      modules.set(fact.path, fact);
    }
  }
  return {
    schema: "csg-core.facts.v1",
    root,
    factsPath,
    source: summary.source || null,
    generatedAt: summary.generatedAt || null,
    factCount: facts.length,
    factsRoot: summary.factsRoot || summary.facts_root,
    totals: summary.totals || summary.counts,
    runtimeClosure: summary.runtimeClosure,
    coreWorkflowUnsupported: summary.coreWorkflowUnsupported,
    symById,
    funcById,
    funcByName,
    nameToIds,
    callsOut,
    refsIn,
    unsupportedByCode,
    modules,
  };
}

async function getChengFacts(input = {}) {
  const root = csgProjectRoot(input);
  const summary = readChengSummary({root, cwd: root}) || {};
  const factsPath = resolveCsgFactsPath({...input, root}, summary);
  if (!factsPath) return null;
  if (!existsSync(factsPath)) return null;
  assertInsideProject(factsPath, root);
  const stat = statSync(factsPath);
  const cacheKey = `${factsPath}:${stat.mtimeMs}:${stat.size}`;
  if (csgFactsCache.has(cacheKey)) return csgFactsCache.get(cacheKey);
  const raw = readFileSync(factsPath);
  const parsed = raw.toString("utf8", 0, Math.min(raw.length, 16)).startsWith("CHENG_CSG\n")
    ? parseChengColdFacts(root, factsPath, summary)
    : await parseCsgCoreFacts(root, factsPath, summary);
  csgFactsCache.clear();
  csgFactsCache.set(cacheKey, parsed);
  return parsed;
}

function lookupByNameInFacts(facts, name) {
  return (facts.nameToIds.get(name) || []).map((id) => {
    const sym = facts.symById.get(id);
    const fn = facts.funcById.get(id);
    const source = fn || sym;
    if (!source) return null;
    return {
      id,
      name: source.name,
      symbol: source.symbol,
      kind: fn ? fn.kind : "csg.symbol",
      symbolKind: sym?.symbolKind,
      returnType: fn?.returnType,
      exported: source.exported,
      loc: source.loc,
    };
  }).filter(Boolean);
}

function callsOfInFacts(facts, functionId) {
  return facts.callsOut.get(functionId) || [];
}

function whoCallsInFacts(facts, name) {
  return facts.refsIn.get(name) || [];
}

function unsupportedBreakdownInFacts(facts) {
  const out = {};
  for (const [code, list] of facts.unsupportedByCode) out[code] = list.length;
  return out;
}

function normalizeToSubstratePath(filePath, root = csgProjectRoot()) {
  const full = String(filePath || "").replace(/\\/g, "/");
  const normalizedRoot = root.replace(/\\/g, "/");
  if (full.startsWith(`${normalizedRoot}/`)) return full.slice(normalizedRoot.length + 1);
  if (full.startsWith("src/") || full.startsWith("vendor/") || full.startsWith("tests/")) return full;
  return full;
}

// facts 陈旧警示: CSG facts 是单一项目级 current.facts(不是按查询文件分片的), 上一次
// roundtrip 用的是哪个 source 就只反映那个 source。查询时若显式给了 file/source 且与
// facts 实际来源不同, 必须显式报警, 不能让 loc 静默错标到别的文件上。
function factsStalenessWarning(facts, targetPathRaw) {
  if (!targetPathRaw || !facts?.source) return null;
  const root = facts.root;
  let targetAbs, factsSourceAbs;
  try {
    targetAbs = resolveProjectPath(targetPathRaw, root);
    factsSourceAbs = resolveProjectPath(facts.source, root);
  } catch {
    return null;
  }
  if (targetAbs === factsSourceAbs) return null;
  const generatedAtText = facts.generatedAt ? ` at ${facts.generatedAt}` : "";
  return `CSG facts were generated from ${normalizeToSubstratePath(factsSourceAbs, root)}${generatedAtText}, not ${normalizeToSubstratePath(targetAbs, root)}; results and file:line locations may not reflect the queried file. Run cheng_csg_roundtrip with source=${normalizeToSubstratePath(targetAbs, root)} to refresh facts.`;
}

function evidenceForSymbolInFacts(facts, name) {
  const declarations = lookupByNameInFacts(facts, name);
  const declarationFiles = new Set(declarations.map((decl) => decl.loc?.file).filter(Boolean));
  const callers = whoCallsInFacts(facts, name);
  const crossModule = callers.filter((call) => call.loc?.file && !declarationFiles.has(call.loc.file));
  const fnDecls = declarations.filter((decl) => decl.kind === "csg.function" || decl.kind === "csg.async_function" || decl.kind === "cheng_cold.function");
  const outbound = fnDecls.length > 0 ? fnDecls.reduce((sum, decl) => sum + callsOfInFacts(facts, decl.id).length, 0) : null;
  return {
    name,
    declarationCount: declarations.length,
    declarationFiles: [...declarationFiles],
    impactRadius: {inBoundCallers: callers.length, outBoundCallees: outbound},
    crossModuleCallers: crossModule.length,
    crossModuleCallerFiles: [...new Set(crossModule.map((call) => call.loc?.file).filter(Boolean))].slice(0, 20),
    factsRoot: facts.factsRoot,
  };
}

function evidenceForFileInFacts(facts, filePath) {
  const normalized = normalizeToSubstratePath(filePath, facts.root);
  const functions = [];
  for (const fn of facts.funcById.values()) {
    if (fn.loc?.file === normalized) functions.push(fn);
  }
  let totalCallers = 0;
  let crossModule = 0;
  const perFunction = [];
  const seen = new Set();
  for (const fn of functions) {
    if (seen.has(fn.name)) continue;
    seen.add(fn.name);
    const callers = whoCallsInFacts(facts, fn.name);
    const cross = callers.filter((call) => call.loc?.file && call.loc.file !== normalized);
    totalCallers += callers.length;
    crossModule += cross.length;
    perFunction.push({name: fn.name, inBoundCallers: callers.length, crossModuleCallers: cross.length});
  }
  perFunction.sort((a, b) => b.crossModuleCallers - a.crossModuleCallers || b.inBoundCallers - a.inBoundCallers);
  return {
    file: normalized,
    functionCount: functions.length,
    totalInBoundCallers: totalCallers,
    crossModuleCallers: crossModule,
    topRisk: perFunction.slice(0, 5),
    factsRoot: facts.factsRoot,
  };
}

function resolveChengPath(input, defaultPath, root = resolveChengProjectRoot()) {
  const value = input || defaultPath;
  const path = isAbsolute(value) ? resolve(value) : resolve(root, value);
  assertInsideProject(path, root);
  return path;
}

// spawnSync 的 timeout/killSignal 只杀直接子进程, 杀不掉子进程 fork 出的孙进程(已实测验证:
// detached grandchild 在 spawnSync timeout 触发后仍存活). Cheng driver 的多进程后端
// (BACKEND_JOBS fork-join) 可能 fork 出这类孙进程, 所以这里改用 spawn + detached:true +
// 手动计时器, 超时/输出溢出时对整个进程组 kill(-pid, SIGKILL), 不留孤儿.
function runChengDriver(driver, args, options = {}) {
  if (!existsSync(driver)) {
    return Promise.resolve({missingDriver: true, driver, exitCode: null, stdout: "", stderr: `cheng driver not found: ${driver}`});
  }
  const cwd = options.cwd || resolveChengProjectRoot(options);
  const maxBuffer = options.maxBuffer || (1 << 30);
  const timeoutMs = chengFusionTimeoutMs(options.timeoutMs || CHENG_FUSION_DRIVER_TIMEOUT_MS_DEFAULT);
  return new Promise((resolvePromise) => {
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let settled = false;
    let timedOut = false;
    let overflow = false;
    let child;
    try {
      child = spawn(driver, args, {
        cwd,
        env: chengDriverSpawnEnv(options.env),
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
    } catch (error) {
      resolvePromise({missingDriver: false, driver, exitCode: null, stdout: "", stderr: error instanceof Error ? error.message : String(error)});
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      killChengProcessGroup(child, "SIGKILL");
    }, timeoutMs);
    const append = (which, chunk) => {
      if (overflow) return;
      if (which === "stdout") stdout = Buffer.concat([stdout, chunk]);
      else stderr = Buffer.concat([stderr, chunk]);
      if (stdout.length + stderr.length > maxBuffer) {
        overflow = true;
        killChengProcessGroup(child, "SIGKILL");
      }
    };
    child.stdout?.on("data", (chunk) => append("stdout", chunk));
    child.stderr?.on("data", (chunk) => append("stderr", chunk));
    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      let stderrText = stderr.toString("utf8");
      if (timedOut) stderrText += `\n[cheng-fusion] timed out after ${timeoutMs}ms; process group killed (SIGKILL)`;
      if (overflow) stderrText += `\n[cheng-fusion] output exceeded maxBuffer (${maxBuffer} bytes); process group killed (SIGKILL)`;
      resolvePromise({missingDriver: false, driver, exitCode, stdout: stdout.toString("utf8"), stderr: stderrText, timedOut});
    };
    child.on("error", (error) => {
      stderr = Buffer.concat([stderr, Buffer.from(`\n${error instanceof Error ? error.message : String(error)}`, "utf8")]);
      finish(null);
    });
    child.on("exit", (code) => finish(code));
  });
}

const CHENG_FUSION_CRASH_TRIAGE_TIMEOUT_MS_DEFAULT = 60000;

// lldb 的 `run` 一行命令自己做类 shell 的空白/引号切分, 实参含空格或引号时需要显式加引号转义,
// 否则会被当成多个独立 argv 传给 debuggee.
function lldbArgQuote(value) {
  const text = String(value);
  if (text.length > 0 && !/[\s"\\]/.test(text)) return text;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// lldb 批处理子进程的共享 spawn 骨架: spawn+detached+手动计时器给 lldb 自己也套上超时/RSS
// 加固(和 runChengDriver 同一套孤儿防护), 按 maxBuffer 截断防止失控输出. runLldbBatch(崩点
// 探测, -k 触发) 和 runLldbOCommands(cheng_corrupt_hunt 的无条件顺序 -o 脚本) 共用这一段,
// 只是各自拼装不同的 lldbArgs.
function spawnLldbSession(lldbArgs, env, options = {}) {
  const maxBuffer = options.maxBuffer || (1 << 26);
  const timeoutMs = chengFusionTimeoutMs(options.timeoutMs || CHENG_FUSION_CRASH_TRIAGE_TIMEOUT_MS_DEFAULT);
  return new Promise((resolvePromise) => {
    let output = Buffer.alloc(0);
    let settled = false;
    let timedOut = false;
    let overflow = false;
    let child;
    try {
      child = spawn("lldb", lldbArgs, {
        cwd: options.cwd || process.cwd(),
        env: chengDriverSpawnEnv(env),
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
    } catch (error) {
      resolvePromise({exitCode: null, output: "", error: error instanceof Error ? error.message : String(error)});
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      killChengProcessGroup(child, "SIGKILL");
    }, timeoutMs);
    const append = (chunk) => {
      if (overflow) return;
      output = Buffer.concat([output, chunk]);
      if (output.length > maxBuffer) {
        overflow = true;
        killChengProcessGroup(child, "SIGKILL");
      }
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      let text = output.toString("utf8");
      if (timedOut) text += `\n[cheng-fusion] lldb session timed out after ${timeoutMs}ms; process group killed (SIGKILL)`;
      if (overflow) text += `\n[cheng-fusion] lldb output exceeded maxBuffer (${maxBuffer} bytes); process group killed (SIGKILL)`;
      resolvePromise({exitCode, output: text, timedOut, overflow});
    };
    child.on("error", (error) => {
      append(Buffer.from(`\n${error instanceof Error ? error.message : String(error)}`, "utf8"));
      finish(null);
    });
    child.on("exit", (code) => finish(code));
  });
}

// 崩点批处理: -o 是无条件顺序执行的命令, -k(--one-line-on-crash) 只在 debuggee 因信号/异常停止时
// 才触发 —— 干净退出时不会跑, 也不会挂起(lldb 自身在命令队列耗尽后退出).
function runLldbBatch(binary, args, env, options = {}) {
  const maxFrames = options.maxFrames || 64;
  const runLine = ["run", ...args.map(lldbArgQuote)].join(" ");
  const lldbArgs = ["-b", "-o", runLine, "-k", `bt ${maxFrames}`, "-k", "register read", "-k", "image list -o -f", "-k", "quit", binary];
  return spawnLldbSession(lldbArgs, env, options);
}

// cheng_corrupt_hunt 用: 一串无条件顺序执行的 -o 命令(不依赖 -k 崩溃触发), binary 仍按 lldb
// 的隐式 target-create 位置参数传入(和 runLldbBatch 一致的约定, splitLldbSessions 已验证过
// 这个隐式创建不会额外产生一段 "(lldb) " 输出块)。
function runLldbOCommands(binary, commands, env, options = {}) {
  const lldbArgs = ["-b"];
  for (const command of commands) lldbArgs.push("-o", command);
  lldbArgs.push(binary);
  return spawnLldbSession(lldbArgs, env, options);
}

function splitLldbSessions(text) {
  const trimmed = text.replace(/^\(lldb\) /, "");
  return trimmed.split(/\n\(lldb\) /).map((raw) => {
    const nl = raw.indexOf("\n");
    return nl < 0 ? {command: raw.trim(), output: ""} : {command: raw.slice(0, nl).trim(), output: raw.slice(nl + 1)};
  });
}

function parseLldbRegisters(output) {
  const registers = {};
  const re = /^\s*(\w+)\s*=\s*(0x[0-9a-fA-F]+)/gm;
  let match;
  while ((match = re.exec(output)) !== null) registers[match[1]] = match[2];
  return registers;
}

function parseLldbFrames(output) {
  const frames = [];
  const re = /frame #(\d+):\s+(0x[0-9a-fA-F]+)\s+([^`\n]+)`([^\n]*)/g;
  let match;
  while ((match = re.exec(output)) !== null) {
    frames.push({index: Number(match[1]), pc: match[2], module: match[3].trim(), lldbSymbol: match[4].trim() || null});
  }
  return frames;
}

function parseLldbImageSlide(output) {
  const match = output.match(/^\[\s*0\]\s+(0x[0-9a-fA-F]+)\s+(\S.*)$/m);
  return match ? {slide: Number(match[1]), imagePath: match[2].trim()} : null;
}

// otool -l 的 __TEXT,__text section addr/size/offset, 用来把运行时 pc 换算成 nm 符号表的
// 坐标系(addr/size), 以及从磁盘文件里原样切出这段 __text 字节(offset, 文件里的字节起点,
// 与 addr 的 vmaddr 坐标系无关 —— object 文件里 offset 是 mach header+load commands 之后
// 的字节偏移, 链接产物里 offset 是页对齐后的字节偏移).
function parseOtoolTextSection(path) {
  if (!existsSync(path)) return null;
  const result = spawnSync("otool", ["-l", path], {encoding: "utf8", timeout: 15000, maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0 || !result.stdout) return null;
  const match = result.stdout.match(/sectname __text\s+segname __TEXT\s+addr (0x[0-9a-fA-F]+)\s+size (0x[0-9a-fA-F]+)\s+offset (\d+)/);
  if (!match) return null;
  return {addr: Number(match[1]), size: Number(match[2]), fileOff: Number(match[3])};
}

// nm -n 的 T(全局)/t(局部/static) 都要收: provider .o 里大量实际函数(如
// cheng_core_runtime_program_support_backend__cheng_write_text_file__L6828)是 local
// symbol, 只认 T 会把它们的地址晒漏成一段无符号区间, 让 nearestPrecedingSymbol 拿一个离得
// 老远的全局符号硬凑一个荒谬的大 offset(实测: 5 万字节偏移量的假symbol命中).
function nmTextSymbols(path) {
  if (!existsSync(path)) return [];
  const result = spawnSync("nm", ["-n", path], {encoding: "utf8", timeout: 15000, maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0 || !result.stdout) return [];
  const symbols = [];
  for (const line of result.stdout.split("\n")) {
    const match = line.match(/^([0-9a-fA-F]{16})\s+[Tt]\s+(\S+)$/);
    if (match) symbols.push({addr: Number(`0x${match[1]}`), name: match[2]});
  }
  symbols.sort((a, b) => a.addr - b.addr);
  return symbols;
}

// binary 同目录下 `<binary>.provider.<name>.o` 兄弟文件(BackendDriverDispatchMinCompileRuntimeProviderObjects
// 的落盘约定). darwin_syscall provider 走内容寻址缓存(artifacts/backend_driver/provider_cache/<hash>.o),
// 不落在这里, 因此这份清单不保证覆盖最终二进制 __text 里的每一段 provider 代码 —— 覆盖不到的区间
// 如实留 provider-region 不猜.
function findProviderObjects(binary) {
  const dir = dirname(binary);
  if (!existsSync(dir)) return [];
  const prefix = `${basename(binary)}.provider.`;
  return readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".o"))
    .sort()
    .map((name) => join(dir, name));
}

function providerModuleName(binary, providerPath) {
  const prefix = `${basename(binary)}.provider.`;
  const name = basename(providerPath);
  return name.startsWith(prefix) && name.endsWith(".o") ? name.slice(prefix.length, -2) : name;
}

// Cheng 的内部 provider linker(macho_provider_linker.cheng)按 objPaths 顺序把每个 provider .o
// 的 __text 原样拼接进最终 exe 的 __text, 但落盘产物里不存在任何记录拼接顺序/基址的边车文件:
// native_link.log 只有 4 个摘要字段没有 object 列表, lldb `image list` 对这种静态拼接的单一
// Mach-O 也只报一个 image(实测 2026-07-11 于 /tmp/f23/GEN2U 的真实崩溃复现, 两条线索都不成立,
// 放弃按假设顺序累加 base 的方案 —— 那个方案曾把一段 provider 代码的 offset 算错整整 9288 字节,
// 拿"最近符号"凑出一个看似合理实则驴唇不对马嘴的 symbol+offset, 逐字节比对才拆穿)。改用内容锚点
// 搜索: provider 自己的 __text 里在多个位置取几种长度的候选窗口, 在最终二进制 __text 里查找
// 该窗口的(可能不止一处的)出现位置反推 base, 再用整个 provider 长度做逐字节校验兜底确认 —— 真正
// 的判据是这个全量校验, 不是"锚点唯一"(实测 core/support 这两个真实 provider 对象里, 128 字节
// 长的窗口只要跨过一个 call/adrp 重定位字就整窗失配, 必须多试几个窗口才能找到没跨中继字的那个)。
// 全量校验阈值定在 15%: 真实 provider 因 call/字面量重定位造成的逐字节差异实测 2.6%~4.9%, 而错误
// 的 base 假设逐字节差异实测 86%+ —— 中间留了巨大安全余量, 不是拍脑袋的容差。全部候选都校验不过
// 就返回 null, 该 provider 的帧照旧落 provider-region, 不瞎猜。
function locateProviderBase(binaryTextBytes, providerTextBytes) {
  if (!binaryTextBytes || !providerTextBytes || providerTextBytes.length === 0) return null;
  const validate = (base) => {
    if (base < 0 || base + providerTextBytes.length > binaryTextBytes.length) return false;
    const candidate = binaryTextBytes.subarray(base, base + providerTextBytes.length);
    const mismatchLimit = Math.max(128, Math.floor(providerTextBytes.length * 0.15));
    let mismatches = 0;
    for (let i = 0; i < candidate.length; i++) {
      if (candidate[i] !== providerTextBytes[i]) {
        mismatches++;
        if (mismatches > mismatchLimit) return false;
      }
    }
    return true;
  };
  const anchorLens = [128, 64, 32].filter((len) => len <= providerTextBytes.length);
  const sampleCount = 8;
  const maxOccurrencesPerAnchor = 50;
  for (const anchorLen of anchorLens) {
    for (let k = 0; k < sampleCount; k++) {
      const span = providerTextBytes.length - anchorLen;
      const anchorOffset = span <= 0 ? 0 : Math.floor((span * k) / (sampleCount - 1));
      const anchor = providerTextBytes.subarray(anchorOffset, anchorOffset + anchorLen);
      let searchFrom = 0;
      for (let attempt = 0; attempt < maxOccurrencesPerAnchor; attempt++) {
        const hit = binaryTextBytes.indexOf(anchor, searchFrom);
        if (hit < 0) break;
        if (validate(hit - anchorOffset)) return hit - anchorOffset;
        searchFrom = hit + 1;
      }
    }
  }
  return null;
}

// stopReason 按 Darwin XNU 的 mach exception -> BSD signal 映射(bsd/uxkern/ux_exception.c)分类:
// EXC_BAD_ACCESS code=1(KERN_INVALID_ADDRESS)->SIGSEGV, 其它 code(如 KERN_PROTECTION_FAILURE)
// ->SIGBUS; EXC_BAD_INSTRUCTION->SIGILL; EXC_ARITHMETIC->SIGFPE; EXC_BREAKPOINT 且崩点模块是
// libsystem_malloc.dylib -> malloc 自身堆完整性检查触发的故意陷阱(malloc-integrity-brk), 不是
// 用户代码断点; abort()/panic() 走 SIGABRT -> panic-exit。
function classifyStopClass(stopReason, frames) {
  if (!stopReason) return null;
  if (/SIGABRT/.test(stopReason)) return "panic-exit";
  const badAccess = stopReason.match(/EXC_BAD_ACCESS\s*\(code=(-?\d+)/);
  if (badAccess) return Number(badAccess[1]) === 1 ? "SIGSEGV" : "SIGBUS";
  if (/EXC_BAD_INSTRUCTION/.test(stopReason)) return "SIGILL";
  if (/EXC_ARITHMETIC/.test(stopReason)) return "SIGFPE";
  if (/EXC_BREAKPOINT/.test(stopReason)) {
    const topModule = frames && frames[0] ? frames[0].module || "" : "";
    return /libsystem_malloc/.test(topModule) ? "malloc-integrity-brk" : "breakpoint-trap";
  }
  return "unknown";
}

function nearestPrecedingSymbol(symbols, offset) {
  let lo = 0, hi = symbols.length - 1, best = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (symbols[mid].addr <= offset) {
      best = symbols[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

// binary __text 字节 + 各 provider 兄弟 .o 的内容锚点定位结果, 提取自 triageChengBinaryCrash,
// cheng_corrupt_hunt 的 pc 符号化复用同一份(不重新扫一遍 provider 目录/重新做锚点搜索).
function buildProviderCandidates(binary, binaryTextBytes) {
  const providerCandidates = [];
  if (!binaryTextBytes) return providerCandidates;
  for (const providerPath of findProviderObjects(binary)) {
    const providerText = parseOtoolTextSection(providerPath);
    if (!providerText) continue;
    let providerBytes;
    try {
      providerBytes = readFileSync(providerPath).subarray(providerText.fileOff, providerText.fileOff + providerText.size);
    } catch {
      continue;
    }
    const base = locateProviderBase(binaryTextBytes, providerBytes);
    if (base === null) continue;
    providerCandidates.push({
      path: providerPath,
      module: providerModuleName(binary, providerPath),
      base,
      size: providerText.size,
      symbols: nmTextSymbols(providerPath),
    });
  }
  return providerCandidates;
}

// 纯地址 -> 符号 的核心判定树(不含 bt 帧的 lldbSymbol/foreign-module 包装), 抽出来给
// cheng_corrupt_hunt 的单点 pc(寄存器读出的崩点/写点)和 triageChengBinaryCrash 的每条 bt 帧共用。
function symbolizeChengPc(pcNumber, ctx) {
  if (!ctx.primaryObjectExists) return {symbol: null, providerUnresolved: true, reason: "primary-object-not-found", primaryObject: ctx.primaryObject};
  if (!ctx.exeText || !ctx.primaryText) return {symbol: null, providerUnresolved: true, reason: "text-section-not-found"};
  const fileOffset = pcNumber - (ctx.slide || 0) - ctx.exeText.addr;
  if (fileOffset < 0 || fileOffset >= ctx.primaryText.size) {
    const hit = ctx.providerCandidates.find((p) => fileOffset >= p.base && fileOffset < p.base + p.size);
    if (hit) {
      const localOffset = fileOffset - hit.base;
      const sym = nearestPrecedingSymbol(hit.symbols, localOffset);
      if (sym) {
        return {symbol: sym.name, offset: localOffset - sym.addr, providerUnresolved: false, providerObject: hit.path, providerModule: hit.module};
      }
      return {symbol: null, providerUnresolved: true, reason: "provider-before-first-symbol", fileOffset, providerObject: hit.path, providerModule: hit.module};
    }
    return {symbol: null, providerUnresolved: true, reason: "provider-region", fileOffset};
  }
  const sym = nearestPrecedingSymbol(ctx.nmSymbols, fileOffset);
  if (!sym) return {symbol: null, providerUnresolved: true, reason: "before-first-symbol", fileOffset};
  return {symbol: sym.name, offset: fileOffset - sym.addr, providerUnresolved: false};
}

// bt 帧包装: 帧自带 lldb 已解析的符号(如落在系统 dylib)直接采用; 帧所属模块不是本 binary 的
// 一律标 foreign-module; 否则委托 symbolizeChengPc 做地址判定。
function symbolizeFrame(frame, ctx) {
  if (frame.lldbSymbol) return {...frame, symbol: frame.lldbSymbol, offset: null, providerUnresolved: false};
  if (frame.module !== ctx.binaryBase) return {...frame, symbol: null, providerUnresolved: true, reason: "foreign-module"};
  const resolved = symbolizeChengPc(Number(frame.pc), ctx);
  return {...frame, ...resolved};
}

// 纯发射 gen2 崩溃(0 行 stderr trace)的实战闭环: 自己起 lldb 跑 binary, 崩点批处理拿 bt/寄存器/
// 崩点指令, 帧按 nm(primary.o) + otool(text section addr/size) + image-list slide 全部符号化;
// 落在 primary.o 自身 __text 范围外的帧(provider/其它被链接 .o 的代码)如实标 provider-unresolved,
// 不假装解析出一个误导性的符号.
async function triageChengBinaryCrash(input) {
  const binary = input.binary;
  if (!existsSync(binary)) return {schema: "cheng_crash_triage_live.v1", error: `binary not found: ${binary}`};
  const args = Array.isArray(input.args) ? input.args : [];
  const primaryObject = input.primaryObject || `${binary}.primary.o`;
  const maxFrames = input.maxFrames || 64;
  const session = await runLldbBatch(binary, args, input.env || {}, {
    maxFrames,
    timeoutMs: input.timeoutSec ? Math.round(input.timeoutSec * 1000) : undefined,
  });
  const text = session.output;
  const exitedMatch = text.match(/exited with status = (-?\d+)/);
  if (exitedMatch && !/stop reason = /.test(text)) {
    return {
      schema: "cheng_crash_triage_live.v1",
      binary, args, primaryObject,
      exited: true,
      exitCode: Number(exitedMatch[1]),
      stopReason: null,
      stopClass: null,
      faultAddress: null,
      crashInsn: null,
      frames: [],
      registers: {},
      timedOut: Boolean(session.timedOut),
      overflow: Boolean(session.overflow),
    };
  }
  const sessions = splitLldbSessions(text);
  const runSession = sessions.find((s) => /^run\b/.test(s.command)) || {output: text};
  const btSession = sessions.find((s) => /^bt\b/.test(s.command));
  const regSession = sessions.find((s) => s.command === "register read");
  const imgSession = sessions.find((s) => /^image list/.test(s.command));
  const stopReasonMatch = text.match(/stop reason = ([^\n]+)/);
  const faultMatch = text.match(/EXC_BAD_ACCESS[^\n]*address=(0x[0-9a-fA-F]+)/);
  const crashInsnMatch = runSession.output.match(/^->\s+(0x[0-9a-fA-F]+)(?:\s+<\+\d+>)?:\s+(.+)$/m);
  const frames = btSession ? parseLldbFrames(btSession.output) : parseLldbFrames(runSession.output);
  const registers = regSession ? parseLldbRegisters(regSession.output) : {};
  const imageInfo = imgSession ? parseLldbImageSlide(imgSession.output) : null;
  const slide = imageInfo ? imageInfo.slide : 0;
  const binaryBase = basename(binary);
  const primaryObjectExists = existsSync(primaryObject);
  const exeText = parseOtoolTextSection(binary);
  const primaryText = primaryObjectExists ? parseOtoolTextSection(primaryObject) : null;
  const nmSymbols = primaryObjectExists ? nmTextSymbols(primaryObject) : [];
  let binaryTextBytes = null;
  if (exeText) {
    try {
      binaryTextBytes = readFileSync(binary).subarray(exeText.fileOff, exeText.fileOff + exeText.size);
    } catch {
      binaryTextBytes = null;
    }
  }
  const providerCandidates = buildProviderCandidates(binary, binaryTextBytes);
  const symbolizeCtx = {binaryBase, primaryObject, primaryObjectExists, exeText, primaryText, nmSymbols, providerCandidates, slide};
  const symbolicated = frames.map((frame) => symbolizeFrame(frame, symbolizeCtx));
  return {
    schema: "cheng_crash_triage_live.v1",
    binary, args, primaryObject,
    exited: false,
    stopReason: stopReasonMatch ? stopReasonMatch[1].trim() : null,
    stopClass: classifyStopClass(stopReasonMatch ? stopReasonMatch[1].trim() : null, frames),
    faultAddress: faultMatch ? faultMatch[1] : null,
    crashInsn: crashInsnMatch ? {pc: crashInsnMatch[1], insn: crashInsnMatch[2].trim()} : null,
    frames: symbolicated,
    registers,
    slide,
    timedOut: Boolean(session.timedOut),
    overflow: Boolean(session.overflow),
  };
}

const CHENG_FUSION_CORRUPT_HUNT_TIMEOUT_MS_DEFAULT = 60000;
const CHENG_FUSION_CORRUPT_HUNT_MAXHITS_DEFAULT = 8;
const CHENG_FUSION_CORRUPT_HUNT_BT_DEPTH = 8;

function toHexAddr(n) {
  return `0x${Math.trunc(n).toString(16)}`;
}

function parseCorruptHuntLiteralAddress(text) {
  const match = String(text || "").trim().match(/^(?:0x)?([0-9a-fA-F]+)$/);
  return match ? Number(`0x${match[1]}`) : null;
}

// lldb 地址表达式对寄存器算术是原生支持的(`$x1+16`), 在 -o 命令里直接写这种表达式让 lldb
// 自己在命令执行的那一刻求值 —— 这是唯一能在单趟批处理里"读一个只有运行时才知道的地址"的
// 办法(批处理命令是启动时就排好的静态列表, 没有分支/回读上一条命令输出再决定下一条参数的能力)。
function corruptHuntRegisterOffsetExpr(register, offset) {
  const n = Number(offset) || 0;
  return n >= 0 ? `$${register}+${n}` : `$${register}-${Math.abs(n)}`;
}

function corruptHuntEnvVarsCommand(env) {
  const merged = {CHENG_PROCESS_MAX_RSS_BYTES: chengFusionRssCapBytes(), ...(env || {})};
  const tokens = Object.entries(merged).map(([key, value]) => lldbArgQuote(`${key}=${value}`));
  return `settings set target.env-vars ${tokens.join(" ")}`;
}

function corruptHuntLaunchCommand(args) {
  const quoted = (args || []).map(lldbArgQuote).join(" ");
  return quoted ? `process launch --stop-at-entry -- ${quoted}` : "process launch --stop-at-entry";
}

// memory read 的一行输出形如 "0x16fdecbf0: 0x6fdeccf0"(地址: 十六进制值), 取冒号后那个值。
function parseLldbMemoryReadValue(output) {
  const match = String(output || "").match(/0x[0-9a-fA-F]+:\s*(0x[0-9a-fA-F]+)/);
  return match ? match[1] : null;
}

// binary/primaryObject 的 otool/nm 静态上下文, stage1 的断点地址解析和 stage1/stage2 的 pc
// 符号化共用同一份(不重复读文件/重复跑 nm)。provider 兄弟 .o 的内容锚点定位复用
// buildProviderCandidates(cheng_crash_triage 同款)。
function buildChengCorruptHuntContext(binary, primaryObject) {
  const exeText = parseOtoolTextSection(binary);
  const primaryObjectExists = Boolean(primaryObject) && existsSync(primaryObject);
  const primaryText = primaryObjectExists ? parseOtoolTextSection(primaryObject) : null;
  const nmSymbols = primaryObjectExists ? nmTextSymbols(primaryObject) : [];
  let binaryTextBytes = null;
  if (exeText) {
    try {
      binaryTextBytes = readFileSync(binary).subarray(exeText.fileOff, exeText.fileOff + exeText.size);
    } catch {
      binaryTextBytes = null;
    }
  }
  const providerCandidates = buildProviderCandidates(binary, binaryTextBytes);
  return {
    binaryBase: basename(binary),
    primaryObject,
    primaryObjectExists,
    exeText,
    primaryText,
    nmSymbols,
    providerCandidates,
    slide: 0,
  };
}

// breakSymbol 模式: nm -n primaryObject 里找该符号的本地(相对 .o 自身 __text 起点)偏移, 按
// system-link-exec 的 primary+provider 拼接约定(primary 对象的 __text 落在最终二进制 __text
// 的文件偏移 0 处, 见 cheng_crash_triage 里 triageChengBinaryCrash 的同一假设)算出最终虚拟地址
// = exeText.addr + 本地偏移。slide 按 0 处理(lldb 批处理默认 target.disable-aslr=true, 已用
// `settings show target.disable-aslr` 实测确认;stage1 之后仍会校验断点是否真被命中,假设不成立
// 会显式报错而不是静默给出一个从未命中的地址)。落在被链接 provider 对象里的符号、或函数体中间的
// 任意 PC(非符号入口), 不在这个便捷路径覆盖范围内, 调用方应自行算出地址后走 breakAddr。
function resolveCorruptHuntBreakAddress(input, ctx) {
  if (input.breakAddr) {
    const literal = parseCorruptHuntLiteralAddress(input.breakAddr);
    if (literal === null) throw new Error(`cheng_corrupt_hunt: breakAddr 不是合法的十六进制地址: ${input.breakAddr}`);
    return literal;
  }
  if (!ctx.primaryObjectExists) throw new Error(`cheng_corrupt_hunt: primaryObject 不存在: ${input.primaryObject}`);
  if (!ctx.exeText) throw new Error(`cheng_corrupt_hunt: 无法用 otool -l 读出 binary 的 __text: ${input.binary}`);
  const hit = ctx.nmSymbols.find((s) => s.name === input.breakSymbol);
  if (!hit) throw new Error(`cheng_corrupt_hunt: breakSymbol '${input.breakSymbol}' 在 nm -n ${input.primaryObject} 里未找到`);
  return ctx.exeText.addr + hit.addr;
}

// 阶段1: 固定地址断点必须在 --stop-at-entry 之后再下(案卷 docs/patches-form34-layerA-writer.md
// 已实证的技巧)。整段是单趟批处理: 用寄存器算术表达式(见 corruptHuntRegisterOffsetExpr)在断点
// 命中的那一刻直接读出 [H] 的初始值, 同时 `register read` 拿到基址寄存器的具体数值, 供 stage2
// 组装字面量地址用(stage2 是全新进程, watchpoint 的目标地址必须是字面量, 不能再用寄存器表达式)。
async function chengCorruptHuntStage1(input, ctx) {
  const breakAddr = resolveCorruptHuntBreakAddress(input, ctx);
  const breakAddrHex = toHexAddr(breakAddr);
  const watchExpr = corruptHuntRegisterOffsetExpr(input.watchRegister, input.watchOffset);
  const registerReadCmd = `register read ${input.watchRegister}`;
  const memReadCmd = `memory read -fx -s${input.watchSize} -c1 -- ${watchExpr}`;
  const commands = [
    corruptHuntEnvVarsCommand(input.env),
    corruptHuntLaunchCommand(input.args),
    `breakpoint set -a ${breakAddrHex}`,
    "continue",
    registerReadCmd,
    memReadCmd,
    `bt ${CHENG_FUSION_CORRUPT_HUNT_BT_DEPTH}`,
    "quit",
  ];
  const session = await runLldbOCommands(input.binary, commands, input.env || {}, {
    timeoutMs: input.timeoutSec ? Math.round(input.timeoutSec * 1000) : undefined,
  });
  const text = session.output;
  const sessions = splitLldbSessions(text);
  const continueSession = sessions.find((s) => s.command === "continue");
  const hitBreakpoint = Boolean(continueSession) && /stop reason = breakpoint/.test(continueSession.output);
  if (!hitBreakpoint) {
    return {
      error: `cheng_corrupt_hunt stage1: 断点 ${breakAddrHex} 从未命中(进程提前退出或地址算错 —— 若走的是 breakSymbol, 检查 ASLR-disabled/base=0 假设是否对这个二进制成立), raw tail: ${takeTrailingText(text, 2000)}`,
      breakAddrHex,
      timedOut: Boolean(session.timedOut),
    };
  }
  const registerSession = sessions.find((s) => s.command === registerReadCmd);
  const registers = registerSession ? parseLldbRegisters(registerSession.output) : {};
  const registerValueHex = registers[input.watchRegister];
  if (!registerValueHex) {
    return {
      error: `cheng_corrupt_hunt stage1: 断点命中但读不到寄存器 ${input.watchRegister} 的值(寄存器名是否对这个架构合法?), raw tail: ${takeTrailingText(text, 2000)}`,
      breakAddrHex,
      timedOut: Boolean(session.timedOut),
    };
  }
  const H = Number(registerValueHex) + (Number(input.watchOffset) || 0);
  const memSession = sessions.find((s) => s.command === memReadCmd);
  const initialValue = memSession ? parseLldbMemoryReadValue(memSession.output) : null;
  const btSession = sessions.find((s) => s.command === `bt ${CHENG_FUSION_CORRUPT_HUNT_BT_DEPTH}`);
  const bt = btSession ? parseLldbFrames(btSession.output).map((frame) => symbolizeFrame(frame, ctx)) : [];
  return {
    breakAddrHex,
    registerValue: registerValueHex,
    H,
    Hhex: toHexAddr(H),
    initialValue,
    bt,
    timedOut: Boolean(session.timedOut),
    overflow: Boolean(session.overflow),
  };
}

const CHENG_CORRUPT_HUNT_CAPABILITY_ERROR_RE = /(watchpoints? are not supported|hardware watchpoints? (are |is )?not supported|could not set variable|error: Watchpoint creation failed|unable to set (hardware )?watchpoint)/i;

// 阶段2: 全新 lldb 进程, 在阶段1 算出的字面量地址 H 上挂 write watchpoint, 无条件顺序排
// maxHits 组 (continue; memory read H; bt N) —— lldb 批处理没有"命中就停, 没命中就继续等"
// 这种条件分支能力, 只能把命令预先排够 maxHits 组, 真实命中数不足时多余的 continue 会看到
// 进程已退出, 照实止步不再往下解析。命中点的 pc/symbol 直接取 bt 第0帧(而不是另跑一次
// register read pc 再套 symbolizeChengPc 自算) —— bt 帧自带 lldb 用二进制自身调试信息做的
// 符号化(frame.lldbSymbol), 比 nm(primaryObject) 更准更全, symbolizeChengPc 只是它落在
// foreign-module/没有 lldbSymbol 时的兜底(symbolizeFrame 已经封装了这个优先级)。
async function chengCorruptHuntStage2(input, ctx, H) {
  const Hhex = toHexAddr(H);
  const maxHits = input.maxHits || CHENG_FUSION_CORRUPT_HUNT_MAXHITS_DEFAULT;
  const memReadCmd = `memory read -fx -s${input.watchSize} -c1 -- ${Hhex}`;
  const btCmd = `bt ${CHENG_FUSION_CORRUPT_HUNT_BT_DEPTH}`;
  const commands = [
    corruptHuntEnvVarsCommand(input.env),
    corruptHuntLaunchCommand(input.args),
    `watchpoint set expression -w write -s ${input.watchSize} -- ${Hhex}`,
  ];
  for (let i = 0; i < maxHits; i++) commands.push("continue", memReadCmd, btCmd);
  commands.push("quit");
  const session = await runLldbOCommands(input.binary, commands, input.env || {}, {
    timeoutMs: input.timeoutSec ? Math.round(input.timeoutSec * 1000) : undefined,
  });
  const text = session.output;
  const capabilityMatch = text.match(CHENG_CORRUPT_HUNT_CAPABILITY_ERROR_RE);
  if (capabilityMatch) {
    return {capabilityError: capabilityMatch[0], hits: [], Hhex, timedOut: Boolean(session.timedOut), raw: takeTrailingText(text, 4000)};
  }
  const sessions = splitLldbSessions(text);
  const continues = sessions.filter((s) => s.command === "continue");
  const memReads = sessions.filter((s) => s.command === memReadCmd);
  const btReads = sessions.filter((s) => s.command === btCmd);
  const hits = [];
  for (let i = 0; i < maxHits; i++) {
    const continueSession = continues[i];
    if (!continueSession) break;
    if (/exited with status/.test(continueSession.output) || /invalid process|process is not currently (running|being debugged)/i.test(continueSession.output)) break;
    const frames = btReads[i] ? parseLldbFrames(btReads[i].output).map((frame) => symbolizeFrame(frame, ctx)) : [];
    const top = frames[0];
    if (!top) break;
    const newValue = memReads[i] ? parseLldbMemoryReadValue(memReads[i].output) : null;
    hits.push({
      hit: i,
      pc: top.pc,
      symbol: top.symbol,
      offset: top.offset,
      providerUnresolved: top.providerUnresolved,
      reason: top.reason,
      providerObject: top.providerObject,
      providerModule: top.providerModule,
      newValue,
      frames,
    });
  }
  return {hits, Hhex, exhausted: hits.length >= maxHits, timedOut: Boolean(session.timedOut), overflow: Boolean(session.overflow)};
}

// cheng_corrupt_hunt: 两阶段 lldb watchpoint 写点定位(F23/F34 层A 案卷同款方法, 见
// docs/patches-form34-layerA-writer.md)。阶段1 在检测点断点读出被害地址 H 的初始值; 阶段2 全新
// 进程在 H 上挂写监视点, 顺着 maxHits 次命中把真正的写入指令(及其调用栈)钉出来 —— 这正是那份案卷
// 里"stp x29,x30,[sp] 落在一个仍存活的祖先局部变量地址上"这类栈帧重叠/跨帧腐蚀问题的取证方法论,
// 工具化成可重复调用的两段式流程。跨 run(阶段1 与阶段2 是两个独立 lldb 进程)的地址稳定性依赖
// lldb 默认 target.disable-aslr=true(已用 `settings show target.disable-aslr` 实测确认), 是
// 调用方前提而非本工具的兜底保证 —— binary/args/env 任一变化都可能改变地址, 调用方需自行保证
// 两阶段用同一份 binary/args/env。
async function chengCorruptHunt(input) {
  if (!existsSync(input.binary)) throw new Error(`cheng_corrupt_hunt: binary not found: ${input.binary}`);
  const hasBreakAddr = typeof input.breakAddr === "string" && input.breakAddr.length > 0;
  const hasBreakSymbol = typeof input.breakSymbol === "string" && input.breakSymbol.length > 0;
  if (hasBreakAddr === hasBreakSymbol) throw new Error("cheng_corrupt_hunt: provide exactly one of breakAddr, or breakSymbol (with primaryObject)");
  if (hasBreakSymbol && !input.primaryObject) throw new Error("cheng_corrupt_hunt: breakSymbol requires primaryObject for nm resolution");
  const primaryObject = input.primaryObject || null;
  const ctx = buildChengCorruptHuntContext(input.binary, primaryObject);
  const stage1 = await chengCorruptHuntStage1(input, ctx);
  if (stage1.error) {
    return {schema: "cheng_corrupt_hunt.v1", binary: input.binary, args: input.args || [], stage1, hits: [], error: stage1.error};
  }
  const stage2 = await chengCorruptHuntStage2(input, ctx, stage1.H);
  return {
    schema: "cheng_corrupt_hunt.v1",
    binary: input.binary,
    args: input.args || [],
    watchRegister: input.watchRegister,
    watchOffset: input.watchOffset,
    watchSize: input.watchSize,
    stage1: {
      breakAddr: stage1.breakAddrHex,
      H: stage1.Hhex,
      initialValue: stage1.initialValue,
      registerValue: stage1.registerValue,
      bt: stage1.bt,
    },
    hits: stage2.hits,
    hitCount: stage2.hits.length,
    exhausted: stage2.exhausted,
    capabilityError: stage2.capabilityError || null,
    timedOut: Boolean(stage1.timedOut || stage2.timedOut),
  };
}

function chengLspResolveBinary() {
  if (process.env.CHENG_LSP_PATH) return process.env.CHENG_LSP_PATH;
  const found = spawnSync("which", ["cheng-lsp"], {encoding: "utf8"});
  const resolvedPath = found.stdout?.trim();
  if (resolvedPath) return resolvedPath;
  return CHENG_LSP_DEFAULT;
}

function pathToUri(filePath) {
  return pathToFileURL(isAbsolute(filePath) ? filePath : resolve(filePath)).href;
}

class JsonRpcProcessClient {
  constructor(command, args, options = {}) {
    this.command = command;
    this.args = args;
    this.options = options;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
    this.publishedDiagnostics = new Map();
    this.dead = false;
  }

  start() {
    this.child = spawn(this.command, this.args, {
      cwd: this.options.cwd || process.cwd(),
      env: chengDriverSpawnEnv(this.options.env),
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    });
    this.child.unref?.();
    this.child.stdin?.unref?.();
    this.child.stdout?.unref?.();
    this.child.stderr?.unref?.();
    this.cleanup = () => this.close();
    process.once("exit", this.cleanup);
    this.stderr = "";
    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk.toString("utf8");
    });
    this.child.stdout.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.processBuffer();
    });
    this.child.on("exit", (code, signal) => {
      this.dead = true;
      const error = new Error(`JSON-RPC process exited: code=${code} signal=${signal} stderr=${takeTrailingText(this.stderr, 1000)}`);
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.pending.clear();
    });
  }

  // 超时孤儿修复: kill 整个进程组(detached 时 child.pid 即 pgid), 不只是杀直接子进程,
  // 覆盖 driver 在 LSP 内部再 fork 出的孙进程情况.
  killTree(signal = "SIGKILL") {
    this.dead = true;
    killChengProcessGroup(this.child, signal);
  }

  processBuffer() {
    for (;;) {
      if (this.buffer.length === 0) return;
      const preview = this.buffer.toString("utf8", 0, Math.min(this.buffer.length, 32));
      if (/^Content-Length:/i.test(preview)) {
        const split = this.buffer.indexOf("\r\n\r\n");
        if (split < 0) return;
        const header = this.buffer.toString("utf8", 0, split);
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) throw new Error(`Bad JSON-RPC header: ${header}`);
        const length = Number(match[1]);
        const start = split + 4;
        if (this.buffer.length < start + length) return;
        const body = this.buffer.toString("utf8", start, start + length);
        this.buffer = this.buffer.subarray(start + length);
        this.handleMessage(JSON.parse(body));
        continue;
      }
      const lineEnd = this.buffer.indexOf("\n");
      if (lineEnd < 0) return;
      const line = this.buffer.toString("utf8", 0, lineEnd).replace(/\r$/, "").trim();
      this.buffer = this.buffer.subarray(lineEnd + 1);
      if (line) this.handleMessage(JSON.parse(line));
    }
  }

  handleMessage(message) {
    if (message.method === "textDocument/publishDiagnostics") {
      const uri = message.params?.uri;
      if (uri) this.publishedDiagnostics.set(uri, message.params?.diagnostics || []);
      return;
    }
    if (message.id !== undefined && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else pending.resolve(message.result);
    }
  }

  sendEnvelope(message) {
    const body = JSON.stringify(message);
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }

  request(method, params, timeoutMs) {
    const id = this.nextId++;
    const message = {jsonrpc: "2.0", id, method, params};
    const effectiveTimeoutMs = chengFusionTimeoutMs(timeoutMs === undefined ? CHENG_FUSION_LSP_TIMEOUT_MS_DEFAULT : timeoutMs);
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        // 超时孤儿修复: 不再只是 reject 掉 promise 留一个卡死的 cheng-lsp 子进程常驻;
        // 立即 kill 整个进程组并把 client 标记为 dead, 让 chengLspEnsureClient 下次换新进程.
        this.killTree("SIGKILL");
        reject(new Error(`${method} timed out after ${effectiveTimeoutMs}ms; killed cheng-lsp process tree`));
      }, effectiveTimeoutMs);
      this.pending.set(id, {resolve: resolvePromise, reject, timer});
      this.sendEnvelope(message);
    });
  }

  notify(method, params) {
    this.sendEnvelope({jsonrpc: "2.0", method, params});
  }

  close() {
    try {
      if (this.cleanup) process.off("exit", this.cleanup);
      this.killTree("SIGTERM");
    } catch {}
  }
}

let chengLspClients = new Map();
let chengLspOpenDocs = new Map();

// chengLspOpenDocs 按 uri 全局共享(不分 client). 换新 client 前必须清掉该 root 下的
// open-doc 记录, 否则新进程会收到 didChange(它从没收过 didOpen)而不是 didOpen.
function purgeChengLspOpenDocsUnderRoot(rootPath) {
  for (const uri of [...chengLspOpenDocs.keys()]) {
    try {
      if (isInsideOrEqual(fileURLToPath(uri), rootPath)) chengLspOpenDocs.delete(uri);
    } catch {}
  }
}

async function chengLspEnsureClient(rootPath = resolveChengProjectRoot()) {
  rootPath = normalizeChengProjectRoot(rootPath);
  const existing = chengLspClients.get(rootPath);
  if (existing) {
    if (!existing.dead) return existing;
    chengLspClients.delete(rootPath);
    purgeChengLspOpenDocsUnderRoot(rootPath);
  }
  const binary = chengLspResolveBinary();
  if (!existsSync(binary)) throw new Error(`cheng-lsp binary not found: ${binary}`);
  const client = new JsonRpcProcessClient(binary, [], {cwd: rootPath});
  client.start();
  const rootUri = pathToUri(rootPath);
  await client.request("initialize", {
    capabilities: {},
    processId: process.pid,
    rootUri,
    workspaceFolders: [{uri: rootUri, name: dirname(rootPath).split("/").pop() || "cheng"}],
  }, 20000);
  client.notify("initialized", {});
  chengLspClients.set(rootPath, client);
  return client;
}

async function chengLspSyncDoc(client, filePath, text) {
  const uri = pathToUri(filePath);
  const tracked = chengLspOpenDocs.get(uri);
  if (!tracked) {
    client.notify("textDocument/didOpen", {textDocument: {uri, languageId: "cheng", version: 1, text}});
    chengLspOpenDocs.set(uri, {version: 1, text});
    return uri;
  }
  if (tracked.text === text) return uri;
  const version = tracked.version + 1;
  client.notify("textDocument/didChange", {textDocument: {uri, version}, contentChanges: [{text}]});
  chengLspOpenDocs.set(uri, {version, text});
  return uri;
}

async function chengLspEnsureDocOpen(client, filePath) {
  return chengLspSyncDoc(client, filePath, readFileSync(filePath, "utf8"));
}

function extractDiagnostics(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.items)) return result.items;
  if (Array.isArray(result.diagnostics)) return result.diagnostics;
  return [];
}

function lineRange(input, text) {
  if (input.endLine !== undefined || input.endCharacter !== undefined) {
    return {
      start: {line: input.line, character: input.character},
      end: {
        line: input.endLine !== undefined ? input.endLine : input.line,
        character: input.endCharacter !== undefined ? input.endCharacter : input.character,
      },
    };
  }
  const currentLine = String(text).split(/\r?\n/)[input.line] || "";
  return {start: {line: input.line, character: 0}, end: {line: input.line, character: currentLine.length}};
}

async function chengLspQuery(input) {
  if (!input.file) throw new Error("file is required");
  const root = resolveChengProjectRoot({root: input.root, file: input.file});
  const filePath = resolveProjectPath(input.file, root);
  assertInsideProject(filePath, root);
  if (!existsSync(filePath)) throw new Error(`file not found: ${filePath}`);
  const client = await chengLspEnsureClient(root);
  const text = readFileSync(filePath, "utf8");
  const uri = await chengLspSyncDoc(client, filePath, text);
  const textDocument = {uri};
  const needsPosition = new Set(["hover", "definition", "references", "typeDefinition", "completion", "signatureHelp", "rename"]);
  if (needsPosition.has(input.kind) && (input.line === undefined || input.character === undefined)) {
    throw new Error(`${input.kind} requires line and character`);
  }
  const position = {line: input.line, character: input.character};
  if (input.kind === "hover") return client.request("textDocument/hover", {textDocument, position});
  if (input.kind === "definition") return client.request("textDocument/definition", {textDocument, position});
  if (input.kind === "references") return client.request("textDocument/references", {textDocument, position, context: {includeDeclaration: true}});
  if (input.kind === "typeDefinition") {
    const typeDefinition = await client.request("textDocument/typeDefinition", {textDocument, position});
    if (typeDefinition !== null && typeDefinition !== undefined) return typeDefinition;
    return client.request("textDocument/definition", {textDocument, position});
  }
  if (input.kind === "completion") return client.request("textDocument/completion", {textDocument, position});
  if (input.kind === "signatureHelp") return client.request("textDocument/signatureHelp", {textDocument, position});
  if (input.kind === "rename") {
    if (!input.newName) throw new Error("rename requires newName");
    return client.request("textDocument/rename", {textDocument, position, newName: input.newName});
  }
  if (input.kind === "documentSymbol") return client.request("textDocument/documentSymbol", {textDocument});
  if (input.kind === "lineMap") return client.request("cheng/lineMap", {textDocument});
  if (input.kind === "workspaceSymbol") {
    if (!input.query) throw new Error("workspaceSymbol requires query");
    for (let i = 0; i < 50; i++) {
      const symbols = await client.request("textDocument/documentSymbol", {textDocument}, 5000).catch(() => []);
      if (Array.isArray(symbols) && symbols.length > 0) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    return client.request("workspace/symbol", {query: input.query});
  }
  if (input.kind === "diagnostics") {
    try {
      return extractDiagnostics(await client.request("textDocument/diagnostic", {textDocument}, 10000));
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
      return client.publishedDiagnostics.get(uri) || [];
    }
  }
  if (input.kind === "codeAction") {
    if (input.line === undefined || input.character === undefined) throw new Error("codeAction requires line and character");
    const range = lineRange(input, text);
    let diagnostics = [];
    try {
      diagnostics = extractDiagnostics(await client.request("textDocument/diagnostic", {textDocument}, 10000));
    } catch {
      diagnostics = client.publishedDiagnostics.get(uri) || [];
    }
    return client.request("textDocument/codeAction", {textDocument, range, context: {diagnostics}});
  }
  throw new Error(`unknown LSP query kind: ${input.kind}`);
}

function parseCrash(stderr) {
  const text = String(stderr || "");
  const candidates = [];
  const maxFrames = 256;
  const maxCandidates = 1024;
  const contextAt = (offset) => {
    const start = text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
    const next = text.indexOf("\n", offset);
    return text.slice(start, next < 0 ? text.length : next).replace(/\r$/, "").trim();
  };
  const add = (offset, priority, frame) => {
    if (candidates.length >= maxCandidates) return;
    const context = contextAt(offset);
    const severity = context.match(/\b(fatal|panic|error|warning|note)\b/i)?.[1]?.toLowerCase() || null;
    candidates.push({offset, priority, frame: {...frame, ...(severity ? {severity} : {}), context: context.slice(0, 240)}});
  };
  let match;
  const runtime = /\bsrc=((?:[A-Za-z]:[\\/])?[^ \t\r\n:]+):([0-9]+)(?:-([0-9]+))?/g;
  while ((match = runtime.exec(text)) !== null) {
    const lineStart = Number(match[2]);
    add(match.index, 0, {file: match[1], lineStart, lineEnd: match[3] ? Number(match[3]) : lineStart, source: "runtime"});
  }
  const debug = /^#([0-9]+)\s+(\S+)(?:\s+at)?\s+((?:[A-Za-z]:[\\/])?[^:\r\n]+?):([0-9]+)(?::([0-9]+))?(?:-([0-9]+))?\s*$/gm;
  while ((match = debug.exec(text)) !== null) {
    const lineStart = Number(match[4]);
    add(match.index, 0, {
      index: Number(match[1]),
      fn: match[2],
      file: match[3],
      lineStart,
      lineEnd: match[6] ? Number(match[6]) : lineStart,
      ...(match[5] ? {column: Number(match[5])} : {}),
      source: "debug",
    });
  }
  const location = /(?:^|[\s("'=])((?:[A-Za-z]:[\\/])?[^:\s()"'=]+\.cheng):([0-9]+)(?::([0-9]+))?(?:-([0-9]+))?/gm;
  while ((match = location.exec(text)) !== null) {
    const fileOffset = match.index + match[0].indexOf(match[1]);
    const context = contextAt(fileOffset);
    const lineStart = Number(match[2]);
    const source = /^\s*-->\s/.test(context) || /\b(?:fatal|error|warning|note)\s*:/i.test(context)
      ? "compiler"
      : /^\s*at\s/.test(context)
        ? "stack"
        : "location";
    add(fileOffset, 1, {
      file: match[1],
      lineStart,
      lineEnd: match[4] ? Number(match[4]) : lineStart,
      ...(match[3] ? {column: Number(match[3])} : {}),
      source,
    });
  }
  candidates.sort((a, b) => a.offset - b.offset || a.priority - b.priority);
  const frames = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const frame = candidate.frame;
    const key = `${frame.file}\0${frame.lineStart}\0${frame.lineEnd}\0${frame.column || 0}\0${frame.context}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (frames.length < maxFrames) frames.push(frame);
  }
  const formatCounts = {};
  for (const frame of frames) formatCounts[frame.source] = (formatCounts[frame.source] || 0) + 1;
  return {
    schema: "cheng_crash_triage.v1",
    frameCount: frames.length,
    frames,
    formatCounts,
    truncated: seen.size > maxFrames,
    inputBytes: Buffer.byteLength(text),
    ...(frames.length === 0 ? {note: "no Cheng source locations found in stderr"} : {}),
  };
}

function parseLineMapReport(text, source) {
  const marker = text.indexOf("cheng_line_map_v1");
  if (marker < 0) throw new Error(`no cheng_line_map_v1 marker in line-map (${text.length} bytes)`);
  const report = text.slice(marker);
  const lines = report.split(/\r?\n/).filter(Boolean);
  const countLine = lines.find((line) => line.startsWith("entry_count="));
  const functions = [];
  for (const line of lines) {
    if (!line.startsWith("entry\t")) continue;
    const columns = line.split("\t");
    const value = (item) => {
      const index = String(item || "").indexOf("=");
      return index >= 0 ? String(item).slice(index + 1) : item || null;
    };
    functions.push({
      primarySymbol: columns[1] || null,
      funcName: columns[2] || null,
      file: columns[3] || null,
      sigLine: columns[4] != null ? Number(columns[4]) : null,
      bodyLine: columns[5] != null ? Number(columns[5]) : null,
      functionName: columns[7] ? value(columns[7]) : columns[2] || null,
      modulePath: columns[8] ? value(columns[8]) : columns[3] || null,
    });
  }
  return {
    schema: "cheng_line_map_v1",
    source,
    entryCount: countLine ? Number(countLine.slice("entry_count=".length)) : null,
    functionCount: functions.length,
    functions,
  };
}

// 巨文件策略: 源文件旁的 `<source>.map` 边车(与编译器自身的 debug line-map 产物同名
// 约定)若存在且比源文件新, 直接读边车解析, 不重新过 LSP 全量解析(那是巨文件慢的根因)。
// 只读不写: 这个工具是 readOnlyHint 的查询工具, 不该往用户项目树里落新文件当副作用。
function readChengLineMapSidecar(source) {
  const sidecar = `${source}.map`;
  if (!existsSync(sidecar)) return null;
  const sourceStat = statSync(source);
  const sidecarStat = statSync(sidecar);
  if (sidecarStat.mtimeMs <= sourceStat.mtimeMs) return null;
  const text = readFileSync(sidecar, "utf8");
  if (!text.includes("cheng_line_map_v1")) return null;
  return {...parseLineMapReport(text, source), source, cacheHit: true, cachePath: sidecar};
}

async function readLineMap(file, input = {}) {
  if (!file) throw new Error("file is required");
  const root = resolveChengProjectRoot({root: input.root, file});
  const source = resolveProjectPath(file, root);
  assertInsideProject(source, root);
  if (existsSync(source)) {
    const candidate = readFileSync(source, "utf8");
    if (candidate.includes("cheng_line_map_v1")) return parseLineMapReport(candidate, source);
  }
  if (!existsSync(source)) throw new Error(`source not found: ${source}`);
  const sidecar = readChengLineMapSidecar(source);
  if (sidecar) return sidecar;
  const report = await chengLspQuery({kind: "lineMap", file: source, root});
  if (report?.schema !== "cheng_line_map_v1" || !Array.isArray(report.functions)) {
    throw new Error("cheng-lsp returned an invalid line-map response");
  }
  return {
    ...report,
    source,
    cacheHit: false,
    functions: report.functions.map((entry) => ({...entry, file: source, modulePath: source})),
  };
}

async function snapshotChengSymbols(sourceRel, input = {}) {
  const root = resolveChengProjectRoot({root: input.root, file: sourceRel});
  if (!existsSync(CHENG_DRIVER)) return null;
  const source = resolveChengPath(sourceRel, CHENG_CANARY, root);
  if (!existsSync(source)) return {error: `source not found: ${source}`, stderr: "", outTail: ""};
  const run = await runChengDriver(CHENG_DRIVER, ["print-symbols", `--root:${root}`, `--in:${source}`, "--target:arm64-apple-darwin", "--emit:obj"], {root, cwd: root});
  const stdout = run.stdout || "";
  if (run.exitCode !== 0) return {error: `exit ${run.exitCode}`, stderr: takeTrailingText(run.stderr, 600), outTail: takeTrailingText(stdout, 600)};
  const pick = (key) => {
    const match = stdout.match(new RegExp(`^${key}=([0-9]+)`, "m"));
    return match ? Number(match[1]) : null;
  };
  const primarySymbols = stdout.match(/^primary_symbols=(.*)$/m);
  const loweringSymbols = stdout.match(/^lowering_symbols=(.*)$/m);
  const primaryUnsupportCount = pick("primary_unsupported_count");
  const hasHeader = stdout.includes("cheng_symbols_v1");
  return {
    schema: hasHeader ? "cheng_symbols_v1" : "unknown",
    root,
    source,
    primaryUnsupportCount,
    primarySymbolCount: pick("primary_symbol_count"),
    loweringSymbolCount: pick("lowering_symbol_count"),
    primarySymbols: primarySymbols ? primarySymbols[1].trim() : null,
    loweringSymbols: loweringSymbols ? loweringSymbols[1].trim() : null,
    byteLength: stdout.length,
    regression: hasHeader && primaryUnsupportCount != null ? primaryUnsupportCount > 0 : null,
  };
}

function profileUnsupportedReason(run) {
  const text = `${run.stdout || ""}\n${run.stderr || ""}`;
  for (const phrase of [
    "profile-report requires full selfhost debug report lowering",
    "profile-run requires full selfhost profiling command lowering",
    "executable profiling is not available in cold backend driver",
  ]) {
    if (text.includes(phrase)) return phrase;
  }
  return null;
}

function profileDriverForReport() {
  return existsSync(CHENG_STAGE3_DRIVER) ? CHENG_STAGE3_DRIVER : CHENG_DRIVER;
}

function profileDriverForRun() {
  return existsSync(CHENG_DRIVER) ? CHENG_DRIVER : CHENG_STAGE3_DRIVER;
}

function profileResult(action, args, run, input = {}) {
  const reason = profileUnsupportedReason(run) || (run.missingDriver ? `cheng driver not found: ${run.driver || ""}` : run.exitCode !== 0 ? `exit ${run.exitCode}` : null);
  const root = input.root || null;
  return {
    schema: "cheng_profile_report_tool.v1",
    action,
    driver: run.driver || "",
    root,
    command: ["cheng", ...args].join(" "),
    exitCode: run.exitCode,
    supported: !run.missingDriver && run.exitCode === 0 && !reason,
    unsupportedReason: reason,
    profileSchema: String(run.stdout || "").includes("cheng_profile_v1") ? "cheng_profile_v1" : null,
    stdout: takeTrailingText(run.stdout),
    stderr: takeTrailingText(run.stderr),
  };
}

// 模板泄漏神谕: Cheng 泛型函数 fn Foo[T](...): T 编译期不按具体类型单态化, 而是共享同一个
// mangled 符号(仅用定义处行号 __L<N> 消歧, 不编码具体 T), 见 PrimarySymbolNameForFunction
// (primary_object_plan.cheng) 里 "lineScoped && signatureLineNumber > 0 -> raw + __L + line"
// 这段真实 mangling 规则。命中 __L<N> 且回源确认签名里裸 T 出现在返回位/形参位的符号即"泄漏候选";
// objdump -r 数其 BL(ARM64_RELOC_BRANCH26/X86_64_RELOC_BRANCH) 调用面, >0 才是被真实执行路径
// 命中的 live_leak(单态化缺失且确有调用点跨类型共享同一份机器码), 否则只是死代码 dead_weight。
const CHENG_TEMPLATE_LEAK_MANGLE_RE = /^(.*)__L([0-9]+)$/;
const CHENG_TEMPLATE_LEAK_EXCLUDE_DIRS = ["artifacts", "node_modules", ".git", "conversion-reports", "scratchpad", "_coldrepro", "test_perf"];
const CHENG_TEMPLATE_LEAK_DECL_RE = /^\s*fn\s+([A-Za-z_]\w*)/;
const CHENG_TEMPLATE_LEAK_HEADER_RE = /^\s*fn\s+([A-Za-z_]\w*)\s*(?:\[([^\]]*)\])?\s*\(([\s\S]*)\)\s*:\s*([\s\S]*?)\s*=\s*$/;

function runProbeTool(command, args, label) {
  const result = spawnSync(command, args, {encoding: "utf8", maxBuffer: 1 << 29, timeout: 60000});
  if (result.error) throw new Error(`${label} failed to start: ${result.error.message}`);
  if (result.signal === "SIGTERM") throw new Error(`${label} timed out after 60000ms: ${command} ${args.join(" ")}`);
  return result;
}

// nm -jUP: 一行一个已定义 symbol, 列 = name type addr size. 只取全局(大写) T(text/code) 且
// 尾部带 __L<行号> mangling 的(即编译器判定为跨 "::" 作用域需要行号消歧的符号)。
function nmDefinedTemplateMangledTextSymbols(objectPath) {
  const result = runProbeTool("nm", ["-jUP", objectPath], "nm");
  if (result.status !== 0) throw new Error(`nm -jUP exited ${result.status}: ${takeTrailingText(result.stderr, 2000)}`);
  const out = [];
  for (const rawLine of result.stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const cols = line.split(/\s+/);
    if (cols.length < 2 || cols[1] !== "T") continue;
    const match = cols[0].match(CHENG_TEMPLATE_LEAK_MANGLE_RE);
    if (!match) continue;
    out.push({symbol: cols[0], base: match[1], line: Number(match[2])});
  }
  return out;
}

// nm -jUP: 一行一个已定义 symbol, 列 = name type addr size, 对 .o 和已链接可执行文件同样适用。
// 只取全局(大写) T(text/code): 局部符号(小写 t, 如 cheng_cold 生成的 .L 标签)不是稳定的跨世代
// 比对单位。
function nmDefinedGlobalTextSymbolNames(objectPath) {
  const result = runProbeTool("nm", ["-jUP", objectPath], "nm");
  if (result.status !== 0) throw new Error(`nm -jUP exited ${result.status}: ${takeTrailingText(result.stderr, 2000)}`);
  const out = [];
  for (const rawLine of result.stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const cols = line.split(/\s+/);
    if (cols.length < 2 || cols[1] !== "T") continue;
    out.push(cols[0]);
  }
  return out;
}

// 符号名前缀聚类: 剥掉 mangling 前导下划线, 取 "std_" 这类小写 snake 前缀, 否则取首个
// CamelCase 词(如 "PrimaryObjectPlan" -> "Primary", "TypedExprEval" -> "Typed"), 否则退化
// 成截取前 10 字符。这不是精确的模块归属, 只用于世代比对里给差分集一个可读的分布摘要。
function chengSymbolPrefixBucket(name) {
  const clean = String(name || "").replace(/^_+/, "");
  if (!clean) return "(empty)";
  const snake = clean.match(/^([a-z][a-z0-9]*_)/);
  if (snake) return snake[1];
  const camel = clean.match(/^([A-Z][a-z0-9]*)/);
  if (camel) return camel[1];
  return clean.slice(0, 10);
}

function chengSymbolPrefixClusters(names) {
  const counts = new Map();
  for (const name of names) {
    const bucket = chengSymbolPrefixBucket(name);
    counts.set(bucket, (counts.get(bucket) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([prefix, count]) => ({prefix, count}));
}

// 双二进制(.o 或可执行文件, 世代 A/B 任意组合)已定义全局 T 符号集差分: onlyInA/onlyInB/common
// 计数 + 各自的名字列表(供调用方精确定位) + 按前缀聚类的分布摘要, 免去手工 nm+sort+diff。
// common 集合在两份世代相近的二进制间通常有数千项且信号价值低, 默认只报计数, 需要全量时传
// includeCommon:true 显式要价。onlyInA/onlyInB 是真正的差分信号, 默认全量返回但受 limit 封顶。
function compareChengBinarySymbols(objectAPath, objectBPath, options = {}) {
  const namesA = nmDefinedGlobalTextSymbolNames(objectAPath);
  const namesB = nmDefinedGlobalTextSymbolNames(objectBPath);
  const setA = new Set(namesA);
  const setB = new Set(namesB);
  const onlyInA = namesA.filter((name) => !setB.has(name)).sort();
  const onlyInB = namesB.filter((name) => !setA.has(name)).sort();
  const commonCount = namesA.reduce((count, name) => count + (setB.has(name) ? 1 : 0), 0);
  const limit = options.limit || 2000;
  return {
    schema: "cheng_symbol_diff_compare.v1",
    objectA: objectAPath,
    objectB: objectBPath,
    countA: namesA.length,
    countB: namesB.length,
    countOnlyInA: onlyInA.length,
    countOnlyInB: onlyInB.length,
    countCommon: commonCount,
    onlyInA: onlyInA.slice(0, limit),
    onlyInB: onlyInB.slice(0, limit),
    onlyInATruncated: onlyInA.length > limit,
    onlyInBTruncated: onlyInB.length > limit,
    common: options.includeCommon ? namesA.filter((name) => setB.has(name)).sort().slice(0, limit) : undefined,
    clustersOnlyInA: chengSymbolPrefixClusters(onlyInA),
    clustersOnlyInB: chengSymbolPrefixClusters(onlyInB),
  };
}

// __L 之前的 base 形如 "<modulePath>__<FuncName>"(见 PrimarySanitizeSymbolPart: "::" 两个冒号各自
// 被替换成 "_", 拼出双下划线作为模块路径/函数名分隔符); 取最后一个 "__" 之后的片段作为函数名,
// 不去正向重建模块路径(避免模块目录命名规则的脆弱反推), 靠函数名+精确行号回源定位。
function chengFunctionNameFromMangledBase(base) {
  const stripped = base.startsWith("_") ? base.slice(1) : base;
  const segments = stripped.split("__");
  return segments[segments.length - 1];
}

// 项目内 "fn <Name>" 声明行的一次性全量索引(单次遍历, 供该次审计里所有候选符号复用查表,
// 而不是每个候选各起一次子进程搜索 —— 后者在本仓 ~4400 个 .cheng 文件规模下经实测会
// 因逐符号重复扫描而拖成分钟级; 一次索引后按 name+line 精确查表是 O(1))。
function buildChengFunctionDeclIndex(root) {
  const pruneArgs = [];
  for (const dir of CHENG_TEMPLATE_LEAK_EXCLUDE_DIRS) {
    if (pruneArgs.length > 0) pruneArgs.push("-o");
    pruneArgs.push("-path", join(root, dir));
  }
  const findArgs = pruneArgs.length > 0
    ? [root, "(", ...pruneArgs, ")", "-prune", "-o", "-name", "*.cheng", "-print"]
    : [root, "-name", "*.cheng", "-print"];
  const found = runProbeTool("find", findArgs, "find");
  if (found.status !== 0) throw new Error(`find exited ${found.status}: ${takeTrailingText(found.stderr, 2000)}`);
  const index = new Map();
  for (const file of found.stdout.split("\n")) {
    if (!file) continue;
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(CHENG_TEMPLATE_LEAK_DECL_RE);
      if (!match) continue;
      const name = match[1];
      if (!index.has(name)) index.set(name, []);
      index.get(name).push({file, line: i + 1});
    }
  }
  return index;
}

function splitChengTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim() !== "" || parts.length > 0) parts.push(current);
  return parts;
}

// 判定该函数头是否泛型(fn Name[T](...)), 且裸类型参数(如 T)是否原样出现在返回类型
// 或某个形参的类型位置(而不仅仅是形参名恰好叫 T) —— 这才是"未绑定裸类型泄漏"的信号:
// 泛型体本身直接以裸 T 出现在 ABI 相关位置, 说明该符号的机器码没有按具体类型特化。
function parseChengGenericLeakSignature(header) {
  const match = header.match(CHENG_TEMPLATE_LEAK_HEADER_RE);
  if (!match) return null;
  const [, , genericsRaw, paramsRaw, returnTypeRaw] = match;
  if (!genericsRaw) return null;
  const generics = genericsRaw.split(",").map((part) => part.trim().split(":")[0].trim()).filter(Boolean);
  if (generics.length === 0) return null;
  const params = splitChengTopLevel(paramsRaw, ",").map((part) => part.trim()).filter(Boolean);
  const paramTypes = params.map((param) => {
    const colon = param.indexOf(":");
    return colon >= 0 ? param.slice(colon + 1).trim() : "";
  });
  const returnType = returnTypeRaw.trim();
  const positions = [];
  for (const generic of generics) {
    const wordRe = new RegExp(`\\b${generic}\\b`);
    if (wordRe.test(returnType)) positions.push({position: "return", param: generic});
    paramTypes.forEach((paramType, index) => {
      if (paramType && wordRe.test(paramType)) positions.push({position: "param", index, param: generic});
    });
  }
  return {generics, returnType, positions};
}

// 多行函数头(签名跨行换行到 "=" 才收尾)兜底拼接, 封顶 8 行不做无限读, 与本仓已见的
// 少量多行 fn 签名风格一致(见 primary_object_plan.cheng 里多形参逐行的 fn 声明)。
function readChengFunctionHeader(filePath, startLine) {
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  let header = "";
  for (let i = startLine - 1; i < lines.length && i < startLine - 1 + 8; i++) {
    header += (header ? " " : "") + lines[i].trim();
    if (/=\s*$/.test(lines[i])) break;
  }
  return header;
}

// objdump -r: 每行 "<offset> <RELOC_TYPE> <target symbol>"。只数分支/调用类重定位
// (ARM64_RELOC_BRANCH26 或 x86_64 等价的 X86_64_RELOC_BRANCH, 用 /BRANCH/ 统一匹配两种目标架构),
// 不数 PAGE21/PAGEOFF12/地址取值类, 这才是真实 BL 调用面(callEdges), 不是所有引用面。
function objdumpBranchCallEdgeCounts(objectPath) {
  const result = runProbeTool("objdump", ["-r", objectPath], "objdump");
  if (result.status !== 0) throw new Error(`objdump -r exited ${result.status}: ${takeTrailingText(result.stderr, 2000)}`);
  const counts = new Map();
  for (const line of result.stdout.split("\n")) {
    const match = line.match(/^\s*[0-9a-fA-F]+\s+\S*BRANCH\S*\s+(\S+)\s*$/);
    if (!match) continue;
    counts.set(match[1], (counts.get(match[1]) || 0) + 1);
  }
  return counts;
}

async function chengTemplateLeakAudit(input = {}) {
  if (!input.objectPath) throw new Error("objectPath is required");
  const root = resolveChengProjectRoot(input);
  const objectPath = isAbsolute(normalizeMaybeFileUri(input.objectPath))
    ? resolve(normalizeMaybeFileUri(input.objectPath))
    : resolve(root, normalizeMaybeFileUri(input.objectPath));
  if (!pathExistsFile(objectPath)) throw new Error(`object file not found: ${objectPath}`);
  const candidates = nmDefinedTemplateMangledTextSymbols(objectPath);
  const declIndex = buildChengFunctionDeclIndex(root);
  let branchCounts = null;
  const leaks = [];
  let sourceNotFoundCount = 0;
  let notGenericCount = 0;
  for (const candidate of candidates) {
    const funcName = chengFunctionNameFromMangledBase(candidate.base);
    const declMatches = (declIndex.get(funcName) || []).filter((decl) => decl.line === candidate.line);
    if (declMatches.length === 0) {
      sourceNotFoundCount++;
      continue;
    }
    const header = readChengFunctionHeader(declMatches[0].file, candidate.line);
    const parsed = parseChengGenericLeakSignature(header);
    if (!parsed || parsed.positions.length === 0) {
      notGenericCount++;
      continue;
    }
    if (!branchCounts) branchCounts = objdumpBranchCallEdgeCounts(objectPath);
    const callEdges = branchCounts.get(candidate.symbol) || 0;
    leaks.push({
      symbol: candidate.symbol,
      sourceFile: normalizeToSubstratePath(declMatches[0].file, root),
      line: candidate.line,
      signature: header,
      genericParams: parsed.generics,
      leakPositions: parsed.positions,
      callEdges,
      verdict: callEdges > 0 ? "live_leak" : "dead_weight",
      ...(declMatches.length > 1 ? {ambiguousSourceMatches: declMatches.map((decl) => normalizeToSubstratePath(decl.file, root))} : {}),
    });
  }
  const liveLeakCount = leaks.filter((leak) => leak.verdict === "live_leak").length;
  return {
    schema: "cheng_template_leak_audit.v1",
    root,
    objectPath,
    scannedMangledSymbolCount: candidates.length,
    sourceNotFoundCount,
    notGenericCount,
    leakCount: leaks.length,
    liveLeakCount,
    invariantHeld: liveLeakCount === 0,
    leaks,
  };
}

function zodToJsonSchema(schema) {
  return zodSchema.toJSONSchema(schema);
}

var initChengToolkitModule = defineModuleInitializer(() => {
  initChengToolkit();
});

export {
  CHENG_ROOT,
  CHENG_TOOLCHAIN_ROOT,
  CHENG_DRIVER,
  CHENG_STAGE3_DRIVER,
  CHENG_FUSION_VENDOR_COLD_DRIVER,
  CHENG_CANARY,
  zodSchema,
  initChengToolkitModule,
  textResult,
  jsonResult,
  takeTrailingText,
  parseZcNotReady,
  parseZcNotReadyLineFull,
  createChengTextTool,
  resolveChengProjectRoot,
  withChengInvocationContext,
  setChengProjectRootHints,
  getChengProjectRootHints,
  resolveProjectPath,
  assertInsideProject,
  csgProjectRoot,
  chengColdCsgDir,
  chengColdSummaryPath,
  chengColdFactsPath,
  resolveCsgFactsPath,
  readChengSummary,
  getChengFacts,
  lookupByNameInFacts,
  callsOfInFacts,
  whoCallsInFacts,
  unsupportedBreakdownInFacts,
  evidenceForSymbolInFacts,
  evidenceForFileInFacts,
  normalizeToSubstratePath,
  factsStalenessWarning,
  runChengDriver,
  chengDriverSpawnEnv,
  chengFusionRssCapBytes,
  resolveChengPath,
  chengLspQuery,
  chengLspEnsureClient,
  chengLspSyncDoc,
  chengLspEnsureDocOpen,
  parseCrash,
  triageChengBinaryCrash,
  chengCorruptHunt,
  readLineMap,
  snapshotChengSymbols,
  compareChengBinarySymbols,
  profileDriverForReport,
  profileDriverForRun,
  profileResult,
  chengTemplateLeakAudit,
  zodToJsonSchema,
};
