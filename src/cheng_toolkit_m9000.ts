// @ts-nocheck
import {accessSync, chmodSync, closeSync, constants, existsSync, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync, writeSync} from "node:fs";
import {spawn, spawnSync} from "node:child_process";
import {basename, dirname, isAbsolute, join, relative, resolve, sep} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {tmpdir} from "node:os";
import {JsonRpcFrameDecoder} from "./json_rpc_frame_decoder.ts";
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
  const value = override || CHENG_FUSION_RSS_CAP_BYTES_DEFAULT;
  if (!/^[1-9]\d*$/.test(value) || BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`CHENG_FUSION_RSS_CAP must be a positive safe integer byte count, got: ${value}`);
  }
  return value;
}

function chengDriverSpawnEnv(extraEnv = {}, unsetEnv = []) {
  const inherited = {...process.env};
  for (const key of unsetEnv) {
    if (typeof key === "string" && key.length > 0) delete inherited[key];
  }
  // The process RSS contract is not an ordinary caller override.  Keep it last so
  // tool input can never silently remove the process-group memory guard.
  return {...inherited, ...extraEnv, CHENG_PROCESS_MAX_RSS_BYTES: chengFusionRssCapBytes()};
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
  try {
    current = realpathSync.native(current);
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }
  if (pathExistsFile(current)) current = dirname(current);
  for (;;) {
    const manifest = join(current, "cheng-package.toml");
    try {
      if (lstatSync(manifest).isFile()) return realpathSync.native(current);
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function normalizeChengProjectRoot(root, label = "Cheng project root") {
  const resolvedRoot = resolve(normalizeMaybeFileUri(root));
  let canonicalRoot;
  try {
    canonicalRoot = realpathSync.native(resolvedRoot);
  } catch {
    throw new Error(`${label} does not exist: ${resolvedRoot}`);
  }
  if (!pathExistsDirectory(canonicalRoot)) throw new Error(`${label} is not a directory: ${canonicalRoot}`);
  const manifest = join(canonicalRoot, "cheng-package.toml");
  let manifestStat = null;
  try {
    manifestStat = lstatSync(manifest);
  } catch {}
  if (!manifestStat?.isFile()) {
    throw new Error(`${label} is not a Cheng project root (missing regular cheng-package.toml): ${canonicalRoot}`);
  }
  return canonicalRoot;
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
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function canonicalExistingAncestor(path) {
  let cursor = resolve(path);
  for (;;) {
    try {
      lstatSync(cursor);
      return realpathSync.native(cursor);
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error;
    }
    const parent = dirname(cursor);
    if (parent === cursor) throw new Error(`no existing ancestor for path: ${path}`);
    cursor = parent;
  }
}

function assertCanonicalPathInsideProject(path, root) {
  if (!isInsideOrEqual(path, root)) throw new Error(`path resolves outside Cheng project root: ${path}`);
}

function assertExistingProjectPath(path, root, label) {
  let canonical;
  try {
    canonical = realpathSync.native(path);
  } catch {
    throw new Error(`${label} does not exist: ${path}`);
  }
  assertCanonicalPathInsideProject(canonical, root);
  return canonical;
}

function assertProspectiveProjectPath(path, root, label) {
  assertInsideProject(path, root);
  let cursor = resolve(path);
  for (;;) {
    let stat = null;
    try {
      stat = lstatSync(cursor);
      if (stat.isSymbolicLink()) {
        throw new Error(`${label} traverses a symbolic link: ${cursor}`);
      }
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error;
    }
    if (stat) {
      const canonicalCursor = realpathSync.native(cursor);
      assertCanonicalPathInsideProject(canonicalCursor, root);
      if (canonicalCursor === root) return path;
    }
    const parent = dirname(cursor);
    if (parent === cursor) {
      throw new Error(`${label} is outside Cheng project root: ${path}`);
    }
    cursor = parent;
  }
}

function assertChengProjectPathBelongsToRoot(value, root, label, mode = "existing") {
  if (!value) return null;
  const canonicalRoot = normalizeChengProjectRoot(root);
  const text = normalizeMaybeFileUri(value);
  const path = isAbsolute(text) ? resolve(text) : resolve(canonicalRoot, text);
  assertInsideProject(path, canonicalRoot);
  const checkedPath = mode === "output"
    ? assertProspectiveProjectPath(path, canonicalRoot, label)
    : assertExistingProjectPath(path, canonicalRoot, label);
  const ownerSearchPath = mode === "output" ? canonicalExistingAncestor(checkedPath) : checkedPath;
  const ownerRoot = findChengPackageRoot(ownerSearchPath);
  if (ownerRoot && ownerRoot !== canonicalRoot) {
    throw new Error(`${label} belongs to a different Cheng project root: ${path} (active=${canonicalRoot}, owner=${ownerRoot})`);
  }
  return path;
}

function assertChengProjectInputPaths(input = {}, root) {
  for (const key of ["file", "source", "rawProfile", "facts"]) {
    if (input[key]) assertChengProjectPathBelongsToRoot(input[key], root, key, "existing");
  }
  for (const key of ["outDir", "out", "reportOut"]) {
    if (input[key]) assertChengProjectPathBelongsToRoot(input[key], root, key, "output");
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
  const invocationRoots = asArray(input.workspaceRoots).filter(Boolean);
  const hintedRoots = invocationRoots.length > 0
    ? uniqueProjectRoots(invocationRoots)
    : uniqueProjectRoots(chengProjectRootHints);
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
        const cwdBase = cwdRoot ? realpathSync.native(cwd) : resolve(cwd);
        const candidate = resolve(cwdBase, file);
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
    if (fileRoot) {
      const contextualRoots = [...hintedRoots];
      if (cwd) {
        const cwdRoot = findChengPackageRoot(cwd);
        if (cwdRoot && hintedRoots.length > 0 && !hintedRoots.includes(cwdRoot)) {
          throw new Error(`cwd belongs to a project outside the active workspace roots: ${cwd} (owner=${cwdRoot})`);
        }
        if (cwdRoot && !contextualRoots.includes(cwdRoot)) contextualRoots.push(cwdRoot);
      }
      if (contextualRoots.length > 0 && !contextualRoots.includes(fileRoot)) {
        throw new Error(`Cheng file belongs to a project outside the active workspace roots: ${file} (owner=${fileRoot})`);
      }
      return finalizeChengProjectRoot(fileRoot, input);
    }
  }
  if (cwd) {
    const cwdRoot = findChengPackageRoot(cwd);
    if (cwdRoot) {
      if (hintedRoots.length > 0 && !hintedRoots.includes(cwdRoot)) {
        throw new Error(`cwd belongs to a project outside the active workspace roots: ${cwd} (owner=${cwdRoot})`);
      }
      return finalizeChengProjectRoot(cwdRoot, input);
    }
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
  const resolved = resolve(realpathSync.native(cwd), normalizeMaybeFileUri(value));
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
  const authorizedRoots = uniqueProjectRoots([
    ...asArray(context.workspaceRoots),
    context.cwd,
  ]);
  if (options.requireActiveProjectContext && authorizedRoots.length === 0) {
    throw new Error("No active Cheng workspace root authorizes this tool call");
  }
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
    if (options.requireActiveProjectContext && !authorizedRoots.includes(out.root)) {
      throw new Error(`Explicit Cheng project root is outside the active workspace roots: ${out.root} (active=${authorizedRoots.join(", ")})`);
    }
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
    if (options.requireActiveProjectContext && !authorizedRoots.includes(out.root)) {
      throw new Error(`Selected Cheng project root is outside the active workspace roots: ${out.root} (active=${authorizedRoots.join(", ")})`);
    }
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
  const resolvedPath = isAbsolute(path) ? resolve(path) : resolve(root, path);
  assertInsideProject(resolvedPath, normalizeChengProjectRoot(root));
  return resolvedPath;
}

function assertInsideProject(path, root) {
  const canonicalRoot = normalizeChengProjectRoot(root);
  const resolvedPath = resolve(path);
  const canonicalPathOrAncestor = canonicalExistingAncestor(resolvedPath);
  assertCanonicalPathInsideProject(canonicalPathOrAncestor, canonicalRoot);
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
  if (existsSync(cold)) {
    throw new Error(`uncommitted Cheng CSG facts found without canonical summary: ${cold}; run cheng_csg_roundtrip to create a verified generation`);
  }
  return null;
}

function readChengSummary(input = {}) {
  const root = csgProjectRoot(input);
  const cold = chengColdSummaryPath(root);
  let stat;
  try {
    stat = lstatSync(cold);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Cheng CSG summary must be a regular non-symlink file: ${cold}`);
  if (stat.size <= 0) throw new Error(`Cheng CSG summary must be non-empty: ${cold}`);
  return JSON.parse(readFileSync(cold, "utf8"));
}

// CSG 查询只接受 roundtrip 已提交的不可变 generation。canonical summary 是一个
// 可替换的指针，不能把它或 current.facts 当作证据；以下读取路径在每次查询都重新
// 验证，缓存只缓存已经验证过的解码结果。
const CHENG_CSG_QUERY_MAX_SUMMARY_BYTES = 1024 * 1024;
const CHENG_CSG_QUERY_MAX_FACTS_BYTES = 256 * 1024 * 1024;
const CHENG_CSG_QUERY_MAX_REPORT_BYTES = 8 * 1024 * 1024;
const CHENG_CSG_QUERY_MAX_OBJECT_BYTES = 512 * 1024 * 1024;
const CHENG_CSG_QUERY_PRODUCER = "cheng-fusion/cheng_csg_roundtrip";
const CHENG_CSG_QUERY_COMMIT_PROTOCOL = "content-addressed-generation+atomic-summary";
const CHENG_CSG_QUERY_SCHEMA = "cheng-cold-csg.summary.v3";
const CHENG_CSG_QUERY_SCHEMA_DESC = "header(0){schema_version:u32,abi_version:u32,pointer_width:u8,endian:u8,producer_version:u32,target_triple:bytes32,entry_symbol:bytes64,schema_hash:u64,plan_hash:u64};target(1){triple:str};object_format(2){format:str};entry(3){symbol:str};function(4){item_id:u32,word_offset:u32,word_count:u32,symbol:str,body_kind:str};word(5){word:u32};reloc(6){source_item_id:u32,word_offset:u32,target_symbol:str};data(7){item_id:u32,symbol:str,align:u32,byte_count:u32,bytes:raw};data_reloc(8){source_item_id:u32,word_offset:u32,reloc_kind:u32,addend:u32,target_symbol:str};call_edge(9){source_item_id:u32,target_symbol:str}";
const CHENG_CSG_QUERY_FNV64_BASIS = 1469598103934665603n;
const CHENG_CSG_QUERY_FNV64_PRIME = 1099511628211n;
const CHENG_CSG_QUERY_SUMMARY_KEYS = ["artifactHashes", "byteSize", "commitProtocol", "current", "facts", "factsRoot", "generatedAt", "generationHash", "generationId", "objectOut", "producer", "readerExitCode", "readerReport", "root", "runtimeClosure", "schema", "source", "target", "totals", "writerExitCode", "writerReport"].sort();
const CHENG_CSG_QUERY_HASH = /^sha256:[0-9a-f]{64}$/;
const CHENG_CSG_QUERY_GENERATION_ID = /^sha256-[0-9a-f]{64}$/;

function sameCsgStableFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function csgFatalUtf8(raw, label, path) {
  try {
    return new TextDecoder("utf-8", {fatal: true}).decode(raw);
  } catch (error) {
    throw new Error(`${label} must be valid UTF-8: ${path} (${error instanceof Error ? error.message : String(error)})`);
  }
}

function readStableCsgArtifact(path, label, maxBytes, allowMissing = false) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error(`invalid ${label} size limit: ${maxBytes}`);
  let pathBefore;
  try {
    pathBefore = lstatSync(path, {bigint: true});
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") return null;
    throw new Error(`${label} is unavailable: ${path} (${error instanceof Error ? error.message : String(error)})`);
  }
  if (pathBefore.isSymbolicLink() || !pathBefore.isFile()) throw new Error(`${label} must be a regular non-symlink file: ${path}`);
  if (pathBefore.size <= 0n) throw new Error(`${label} must be non-empty: ${path}`);
  if (pathBefore.size > BigInt(maxBytes)) throw new Error(`${label} exceeds ${maxBytes} byte limit: ${path} (${pathBefore.size} bytes)`);
  if (!Number.isInteger(constants.O_NOFOLLOW)) throw new Error("O_NOFOLLOW is required for Cheng CSG query verification");

  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    throw new Error(`${label} could not be opened without following links: ${path} (${error instanceof Error ? error.message : String(error)})`);
  }
  try {
    const descriptorBefore = fstatSync(fd, {bigint: true});
    if (!descriptorBefore.isFile() || !sameCsgStableFile(pathBefore, descriptorBefore)) {
      throw new Error(`${label} changed between path validation and open: ${path}`);
    }
    const expectedSize = Number(descriptorBefore.size);
    const chunks = [];
    const hash = createHash("sha256");
    let offset = 0;
    while (offset < expectedSize) {
      const chunk = Buffer.allocUnsafe(Math.min(1024 * 1024, expectedSize - offset));
      const bytesRead = readSync(fd, chunk, 0, chunk.length, offset);
      if (bytesRead <= 0) throw new Error(`${label} became truncated while reading: ${path}`);
      const bytes = bytesRead === chunk.length ? chunk : chunk.subarray(0, bytesRead);
      chunks.push(bytes);
      hash.update(bytes);
      offset += bytesRead;
    }
    const descriptorAfter = fstatSync(fd, {bigint: true});
    let pathAfter;
    try {
      pathAfter = lstatSync(path, {bigint: true});
    } catch (error) {
      throw new Error(`${label} path disappeared while reading: ${path} (${error instanceof Error ? error.message : String(error)})`);
    }
    if (pathAfter.isSymbolicLink() || !pathAfter.isFile() || !sameCsgStableFile(descriptorBefore, descriptorAfter) || !sameCsgStableFile(descriptorAfter, pathAfter)) {
      throw new Error(`${label} changed while reading: ${path}`);
    }
    return {raw: Buffer.concat(chunks, expectedSize), hash: `sha256:${hash.digest("hex")}`, stat: pathAfter};
  } finally {
    closeSync(fd);
  }
}

function requireCanonicalCsgDirectory(path, root, label) {
  const absolute = resolve(path);
  assertInsideProject(absolute, root);
  const relativePath = relative(root, absolute);
  const components = relativePath === "" ? [] : relativePath.split(/[\\/]+/).filter(Boolean);
  let cursor = root;
  const assertDirectory = (directory) => {
    let stat;
    try {
      stat = lstatSync(directory);
    } catch (error) {
      throw new Error(`${label} directory is unavailable: ${directory} (${error instanceof Error ? error.message : String(error)})`);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory() || realpathSync.native(directory) !== directory) {
      throw new Error(`${label} traverses a symbolic link or non-directory: ${directory}`);
    }
  };
  assertDirectory(cursor);
  for (const component of components) {
    cursor = join(cursor, component);
    assertDirectory(cursor);
  }
  return absolute;
}

function requireCanonicalCsgArtifactParent(path, root, label) {
  const absolute = resolve(path);
  assertInsideProject(absolute, root);
  requireCanonicalCsgDirectory(dirname(absolute), root, label);
  return absolute;
}

function csgFNV1a64(raw) {
  let hash = CHENG_CSG_QUERY_FNV64_BASIS;
  for (const byte of raw) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * CHENG_CSG_QUERY_FNV64_PRIME);
  return hash;
}

function readStrictCsgStringForQuery(payload, offset, path, line) {
  if (offset < 0 || offset + 4 > payload.length) throw new Error(`CHENG_CSG string length is out of bounds at line ${line}: ${path}`);
  const length = payload.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + length;
  if (end > payload.length) throw new Error(`CHENG_CSG string payload is out of bounds at line ${line}: ${path}`);
  const value = csgFatalUtf8(payload.subarray(start, end), "CHENG_CSG string", path);
  if (value.length === 0) throw new Error(`CHENG_CSG string must be non-empty at line ${line}: ${path}`);
  return {value, end};
}

function readFixedCsgStringForQuery(payload, start, length, label, path) {
  const bytes = payload.subarray(start, start + length);
  const nul = bytes.indexOf(0);
  const end = nul < 0 ? bytes.length : nul;
  if (nul >= 0 && bytes.subarray(nul).some((byte) => byte !== 0)) throw new Error(`CHENG_CSG header ${label} has non-zero bytes after NUL: ${path}`);
  const value = csgFatalUtf8(bytes.subarray(0, end), `CHENG_CSG header ${label}`, path);
  if (value.length === 0) throw new Error(`CHENG_CSG header ${label} must be non-empty: ${path}`);
  return value;
}

function validateCommittedColdFacts(raw, factsPath, expectedTarget) {
  if (typeof expectedTarget !== "string" || !/^[A-Za-z0-9_.+-]{1,128}$/.test(expectedTarget)) {
    throw new Error(`CSG target triple must be 1..128 canonical ASCII target characters: ${expectedTarget}`);
  }
  const text = csgFatalUtf8(raw, "CSG facts", factsPath);
  if (!text.startsWith("CHENG_CSG\n") || !text.endsWith("\n")) throw new Error(`CSG facts must use exact CHENG_CSG LF line format: ${factsPath}`);
  const lines = text.slice(0, -1).split("\n");
  if (lines[0] !== "CHENG_CSG") throw new Error(`CSG facts header must be exactly CHENG_CSG: ${factsPath}`);
  const records = [];
  const counts = {records: 0, functions: 0, words: 0, relocs: 0, data: 0, dataRelocs: 0, callEdges: 0};
  for (let index = 1; index < lines.length; index++) {
    const match = lines[index].match(/^R([0-9a-f]{4})([0-9a-f]{8})([0-9a-f]*)$/);
    if (!match) throw new Error(`invalid CHENG_CSG record line ${index + 1}: ${factsPath}`);
    const kind = Number.parseInt(match[1], 16);
    const byteCount = Number.parseInt(match[2], 16);
    if (kind < 0 || kind > 9 || match[3].length !== byteCount * 2) throw new Error(`invalid CHENG_CSG record payload at line ${index + 1}: ${factsPath}`);
    records.push({kind, payload: Buffer.from(match[3], "hex"), line: index + 1, text: lines[index]});
    counts.records++;
    if (kind === 4) counts.functions++;
    else if (kind === 5) counts.words++;
    else if (kind === 6) counts.relocs++;
    else if (kind === 7) counts.data++;
    else if (kind === 8) counts.dataRelocs++;
    else if (kind === 9) counts.callEdges++;
  }
  if (records.length === 0 || records[0].kind !== 0) throw new Error(`CHENG_CSG facts must begin with the canonical header record: ${factsPath}`);
  const header = records[0].payload;
  if (header.length !== 126 || header.readUInt32LE(0) !== 1 || header.readUInt32LE(4) !== 1 || header[8] !== 8 || header[9] !== 1 || header.readUInt32LE(10) <= 0) {
    throw new Error(`CHENG_CSG header schema/ABI/pointer-width/endian mismatch: ${factsPath}`);
  }
  const headerTarget = readFixedCsgStringForQuery(header, 14, 32, "target", factsPath);
  if (headerTarget !== expectedTarget.slice(0, 32)) throw new Error(`CHENG_CSG header target mismatch: expected=${expectedTarget.slice(0, 32)} actual=${headerTarget}`);
  if (header.readBigUInt64LE(110) !== csgFNV1a64(Buffer.from(CHENG_CSG_QUERY_SCHEMA_DESC, "utf8"))) throw new Error(`CHENG_CSG schema_hash mismatch: ${factsPath}`);
  const payloadStart = Buffer.byteLength(`CHENG_CSG\n${records[0].text}\n`, "utf8");
  if (header.readBigUInt64LE(118) !== csgFNV1a64(raw.subarray(payloadStart))) throw new Error(`CHENG_CSG plan_hash mismatch: ${factsPath}`);

  const singletonKinds = new Set();
  const singletonValues = new Map();
  const functionItems = new Map();
  const dataItems = new Map();
  const functionSymbols = new Map();
  const dataSymbols = new Map();
  const relocations = [];
  const dataRelocations = [];
  const callEdges = [];
  for (let index = 0; index < records.length; index++) {
    const {kind, payload, line} = records[index];
    if (kind === 0) {
      if (index !== 0) throw new Error(`duplicate CHENG_CSG header record at line ${line}: ${factsPath}`);
      continue;
    }
    let offset = 0;
    const readU32 = (field) => {
      if (offset + 4 > payload.length) throw new Error(`CHENG_CSG ${field} is truncated at line ${line}: ${factsPath}`);
      const value = payload.readUInt32LE(offset);
      offset += 4;
      return value;
    };
    const readString = () => {
      const value = readStrictCsgStringForQuery(payload, offset, factsPath, line);
      offset = value.end;
      return value.value;
    };
    if (kind === 1 || kind === 2 || kind === 3) {
      if (singletonKinds.has(kind)) throw new Error(`duplicate CHENG_CSG singleton record kind ${kind} at line ${line}: ${factsPath}`);
      singletonKinds.add(kind);
      singletonValues.set(kind, readString());
    } else if (kind === 4) {
      const itemId = readU32("function item_id");
      const wordOffset = readU32("function word_offset");
      const wordCount = readU32("function word_count");
      const symbol = readString();
      readString();
      if (functionItems.has(itemId)) throw new Error(`duplicate CHENG_CSG function item_id ${itemId} at line ${line}: ${factsPath}`);
      if (functionSymbols.has(symbol) || dataSymbols.has(symbol)) throw new Error(`duplicate CHENG_CSG function symbol ${symbol} at line ${line}: ${factsPath}`);
      const entry = {itemId, wordOffset, wordCount, symbol, line};
      functionItems.set(itemId, entry);
      functionSymbols.set(symbol, entry);
    } else if (kind === 5) {
      readU32("word");
    } else if (kind === 6) {
      relocations.push({sourceItemId: readU32("reloc source_item_id"), wordOffset: readU32("reloc word_offset"), targetSymbol: readString(), line});
    } else if (kind === 7) {
      const itemId = readU32("data item_id");
      const symbol = readString();
      const align = readU32("data align");
      const byteCount = readU32("data byte_count");
      if (offset + byteCount > payload.length || byteCount === 0 || ![1, 2, 4, 8, 16].includes(align)) throw new Error(`invalid CHENG_CSG data record at line ${line}: ${factsPath}`);
      if (dataItems.has(itemId)) throw new Error(`duplicate CHENG_CSG data item_id ${itemId} at line ${line}: ${factsPath}`);
      if (dataSymbols.has(symbol) || functionSymbols.has(symbol)) throw new Error(`duplicate CHENG_CSG data symbol ${symbol} at line ${line}: ${factsPath}`);
      const entry = {itemId, symbol, line};
      dataItems.set(itemId, entry);
      dataSymbols.set(symbol, entry);
      offset += byteCount;
    } else if (kind === 8) {
      const sourceItemId = readU32("data_reloc source_item_id");
      const wordOffset = readU32("data_reloc word_offset");
      const relocKind = readU32("data_reloc reloc_kind");
      const addend = readU32("data_reloc addend");
      const targetSymbol = readString();
      if (relocKind !== 1 || addend !== 0) throw new Error(`invalid CHENG_CSG data_reloc at line ${line}: ${factsPath}`);
      dataRelocations.push({sourceItemId, wordOffset, targetSymbol, line});
    } else if (kind === 9) {
      callEdges.push({sourceItemId: readU32("call_edge source_item_id"), targetSymbol: readString(), line});
    }
    if (offset !== payload.length) throw new Error(`CHENG_CSG record has trailing or malformed payload at line ${line}: ${factsPath}`);
  }
  for (const kind of [1, 2, 3]) if (!singletonKinds.has(kind)) throw new Error(`CHENG_CSG required singleton record kind ${kind} is missing: ${factsPath}`);
  if (singletonValues.get(1) !== expectedTarget) throw new Error(`CHENG_CSG target record mismatch: expected=${expectedTarget} actual=${singletonValues.get(1)}`);
  const expectedEntry = Buffer.alloc(64);
  Buffer.from(singletonValues.get(3), "utf8").copy(expectedEntry, 0, 0, 64);
  if (!header.subarray(46, 110).equals(expectedEntry)) throw new Error(`CHENG_CSG entry record/header identification bytes mismatch: ${factsPath}`);
  if (counts.functions <= 0 || !functionSymbols.has(singletonValues.get(3))) throw new Error(`CHENG_CSG entry symbol does not identify a function: ${singletonValues.get(3)} (${factsPath})`);
  for (const fn of functionItems.values()) {
    if (fn.wordOffset > counts.words || fn.wordCount > counts.words - fn.wordOffset) throw new Error(`CHENG_CSG function item_id ${fn.itemId} word range exceeds word records at line ${fn.line}: ${factsPath}`);
  }
  const requireFunctionSource = (reference, kind) => {
    const source = functionItems.get(reference.sourceItemId);
    if (!source) throw new Error(`CHENG_CSG ${kind} has dangling source_item_id ${reference.sourceItemId} at line ${reference.line}: ${factsPath}`);
    return source;
  };
  for (const reloc of relocations) {
    const source = requireFunctionSource(reloc, "reloc");
    if (reloc.wordOffset < source.wordOffset || reloc.wordOffset >= source.wordOffset + source.wordCount) throw new Error(`CHENG_CSG reloc word_offset is outside source function item_id ${source.itemId} at line ${reloc.line}: ${factsPath}`);
  }
  for (const reloc of dataRelocations) {
    const source = requireFunctionSource(reloc, "data_reloc");
    if (reloc.wordOffset < source.wordOffset || reloc.wordOffset + 1 >= source.wordOffset + source.wordCount) throw new Error(`CHENG_CSG data_reloc word_offset pair is outside source function item_id ${source.itemId} at line ${reloc.line}: ${factsPath}`);
    if (!functionSymbols.has(reloc.targetSymbol) && !dataSymbols.has(reloc.targetSymbol)) throw new Error(`CHENG_CSG data_reloc target_symbol does not identify a defined symbol at line ${reloc.line}: ${factsPath}`);
  }
  for (const edge of callEdges) {
    requireFunctionSource(edge, "call_edge");
    if (!functionSymbols.has(edge.targetSymbol)) throw new Error(`CHENG_CSG call_edge target_symbol does not identify a function at line ${edge.line}: ${factsPath}`);
  }
  return {counts, target: singletonValues.get(1), objectFormat: singletonValues.get(2), entry: singletonValues.get(3)};
}

function validateCsgReportForQuery(raw, path, label, factsCounts) {
  const text = csgFatalUtf8(raw, label, path);
  if (text.includes("\r") || !text.endsWith("\n")) throw new Error(`${label} must use canonical LF-terminated key=value lines: ${path}`);
  const values = {};
  for (const [index, line] of text.slice(0, -1).split("\n").entries()) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_]*)=(.*)$/);
    if (!match) throw new Error(`${label} has malformed key=value line ${index + 1}: ${path}`);
    if (Object.hasOwn(values, match[1])) throw new Error(`${label} has duplicate key ${match[1]}: ${path}`);
    values[match[1]] = match[2];
  }
  for (const [field, count] of [["facts_record_count", "records"], ["facts_function_count", "functions"], ["facts_word_count", "words"], ["facts_reloc_count", "relocs"], ["facts_data_count", "data"], ["facts_data_reloc_count", "dataRelocs"]]) {
    const value = values[field];
    if (!/^(0|[1-9][0-9]*)$/.test(value || "")) throw new Error(`${label} ${field} must be a canonical non-negative integer: ${path}`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed !== factsCounts[count]) throw new Error(`${label} ${field} mismatch: ${path}`);
  }
  return values;
}

function csgGenerationHashForQuery(root, source, target, artifactHashes) {
  return sha256Hex(Buffer.from(JSON.stringify({root, source, target, artifactHashes}), "utf8"));
}

function sameCsgArtifactHashes(left, right) {
  return ["facts", "writerReport", "readerReport", "object"].every((key) => left?.[key] === right?.[key] && CHENG_CSG_QUERY_HASH.test(String(left?.[key] || "")));
}

function exactCsgGenerationObjectName(source) {
  return `${basename(source).replace(/[^A-Za-z0-9_.-]/g, "_")}.o`;
}

function assertExactCsgKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(keys.slice().sort())) {
    throw new Error(`${label} fields are not canonical`);
  }
}

function parseVerifiedCsgSummary(root) {
  const summaryPath = chengColdSummaryPath(root);
  const evidence = readStableCsgArtifact(summaryPath, "canonical CSG summary", CHENG_CSG_QUERY_MAX_SUMMARY_BYTES, true);
  if (!evidence) return null;
  requireCanonicalCsgArtifactParent(summaryPath, root, "canonical CSG summary");
  const text = csgFatalUtf8(evidence.raw, "canonical CSG summary", summaryPath);
  if (!text.endsWith("\n")) throw new Error(`canonical CSG summary must end with LF: ${summaryPath}`);
  let summary;
  try {
    summary = JSON.parse(text);
  } catch (error) {
    throw new Error(`canonical CSG summary is invalid JSON: ${summaryPath} (${error instanceof Error ? error.message : String(error)})`);
  }
  if (JSON.stringify(summary, null, 2) + "\n" !== text) throw new Error(`canonical CSG summary is not canonical JSON: ${summaryPath}`);
  assertExactCsgKeys(summary, CHENG_CSG_QUERY_SUMMARY_KEYS, `canonical CSG summary ${summaryPath}`);
  if (summary.schema !== CHENG_CSG_QUERY_SCHEMA || summary.producer !== CHENG_CSG_QUERY_PRODUCER || summary.commitProtocol !== CHENG_CSG_QUERY_COMMIT_PROTOCOL) {
    throw new Error(`canonical CSG summary has an untrusted schema, producer, or commit protocol: ${summaryPath}`);
  }
  if (summary.root !== root || typeof summary.source !== "string" || typeof summary.target !== "string" || !/^[A-Za-z0-9_.+-]{1,128}$/.test(summary.target)) {
    throw new Error(`canonical CSG summary root/source/target is invalid: ${summaryPath}`);
  }
  const source = resolve(summary.source);
  if (source !== summary.source || !source.endsWith(".cheng")) throw new Error(`canonical CSG summary source must be an absolute .cheng path: ${summaryPath}`);
  assertInsideProject(source, root);
  const sourceStat = lstatSync(source);
  if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) throw new Error(`canonical CSG summary source must remain a regular non-symlink file: ${source}`);
  if (!CHENG_CSG_QUERY_GENERATION_ID.test(summary.generationId) || !CHENG_CSG_QUERY_HASH.test(summary.generationHash)) {
    throw new Error(`canonical CSG summary generation identifiers or artifact hashes are invalid: ${summaryPath}`);
  }
  assertExactCsgKeys(summary.artifactHashes, ["facts", "writerReport", "readerReport", "object"], `canonical CSG summary artifact hashes ${summaryPath}`);
  if (!sameCsgArtifactHashes(summary.artifactHashes, summary.artifactHashes)) throw new Error(`canonical CSG summary artifact hashes are invalid: ${summaryPath}`);
  if (summary.generationId !== `sha256-${summary.generationHash.slice("sha256:".length)}` || summary.generationHash !== csgGenerationHashForQuery(root, source, summary.target, summary.artifactHashes)) {
    throw new Error(`canonical CSG summary generation hash mismatch: ${summaryPath}`);
  }
  if (summary.factsRoot !== summary.artifactHashes.facts || !Number.isSafeInteger(summary.byteSize) || summary.byteSize <= 0 || summary.runtimeClosure !== null || summary.writerExitCode !== 0 || summary.readerExitCode !== 0) {
    throw new Error(`canonical CSG summary process or facts metadata is invalid: ${summaryPath}`);
  }
  if (typeof summary.generatedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(summary.generatedAt) || !Number.isFinite(Date.parse(summary.generatedAt))) {
    throw new Error(`canonical CSG summary generatedAt is invalid: ${summaryPath}`);
  }
  return {summary, evidence, summaryPath, source};
}

function verifyCommittedCsgGeneration(root) {
  const canonical = parseVerifiedCsgSummary(root);
  if (!canonical) return null;
  const {summary, evidence: canonicalEvidence, summaryPath, source} = canonical;
  const factsPath = requireCanonicalCsgArtifactParent(summary.facts, root, "CSG generation facts");
  if (factsPath !== summary.facts || basename(factsPath) !== "current.facts") throw new Error(`canonical CSG summary facts path is not canonical: ${summaryPath}`);
  const generationDir = dirname(factsPath);
  const generationRoot = dirname(generationDir);
  const outDir = dirname(generationRoot);
  if (basename(generationDir) !== summary.generationId || basename(generationRoot) !== ".cheng-csg-generations") throw new Error(`canonical CSG summary generation path is invalid: ${summaryPath}`);
  requireCanonicalCsgDirectory(generationDir, root, "CSG immutable generation");
  const objectName = exactCsgGenerationObjectName(source);
  const paths = {
    facts: factsPath,
    writerReport: join(generationDir, "current.writer.report.txt"),
    readerReport: join(generationDir, "current.reader.report.txt"),
    objectOut: join(generationDir, objectName),
    summary: join(generationDir, "summary.json"),
  };
  if (summary.writerReport !== paths.writerReport || summary.readerReport !== paths.readerReport || summary.objectOut !== paths.objectOut) {
    throw new Error(`canonical CSG summary declares artifact paths outside its generation: ${summaryPath}`);
  }
  const expectedCurrent = {
    facts: join(outDir, "current.facts"),
    writerReport: join(outDir, "current.writer.report.txt"),
    readerReport: join(outDir, "current.reader.report.txt"),
    objectOut: join(outDir, objectName),
  };
  assertExactCsgKeys(summary.current, ["facts", "writerReport", "readerReport", "objectOut"], `canonical CSG summary current ${summaryPath}`);
  if (JSON.stringify(summary.current) !== JSON.stringify(expectedCurrent)) throw new Error(`canonical CSG summary current projection paths are invalid: ${summaryPath}`);
  const names = readdirSync(generationDir).sort();
  const expectedNames = ["current.facts", "current.reader.report.txt", "current.writer.report.txt", objectName, "summary.json"].sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) throw new Error(`CSG immutable generation has unexpected directory entries: ${generationDir}`);
  const generationSummary = readStableCsgArtifact(paths.summary, "CSG immutable generation summary", CHENG_CSG_QUERY_MAX_SUMMARY_BYTES);
  if (!generationSummary.raw.equals(canonicalEvidence.raw)) throw new Error(`canonical CSG summary does not exactly identify the immutable generation: ${summaryPath}`);
  const artifacts = {
    facts: readStableCsgArtifact(paths.facts, "CSG facts", CHENG_CSG_QUERY_MAX_FACTS_BYTES),
    writerReport: readStableCsgArtifact(paths.writerReport, "CSG writer report", CHENG_CSG_QUERY_MAX_REPORT_BYTES),
    readerReport: readStableCsgArtifact(paths.readerReport, "CSG reader report", CHENG_CSG_QUERY_MAX_REPORT_BYTES),
    object: readStableCsgArtifact(paths.objectOut, "CSG reader object", CHENG_CSG_QUERY_MAX_OBJECT_BYTES),
  };
  const actualHashes = {facts: artifacts.facts.hash, writerReport: artifacts.writerReport.hash, readerReport: artifacts.readerReport.hash, object: artifacts.object.hash};
  for (const key of ["facts", "writerReport", "readerReport", "object"]) {
    if (actualHashes[key] !== summary.artifactHashes[key]) {
      throw new Error(`CSG ${key === "facts" ? "facts" : key} hash mismatch: declared=${summary.artifactHashes[key]} actual=${actualHashes[key]} path=${paths[key === "object" ? "objectOut" : key]}`);
    }
  }
  const factsEvidence = validateCommittedColdFacts(artifacts.facts.raw, paths.facts, summary.target);
  const writerReport = validateCsgReportForQuery(artifacts.writerReport.raw, paths.writerReport, "CSG writer report", factsEvidence.counts);
  validateCsgReportForQuery(artifacts.readerReport.raw, paths.readerReport, "CSG reader report", factsEvidence.counts);
  const expectedTotals = {
    sourceFiles: 1,
    functions: factsEvidence.counts.functions,
    words: factsEvidence.counts.words,
    relocs: factsEvidence.counts.relocs,
    data: factsEvidence.counts.data,
    dataRelocs: factsEvidence.counts.dataRelocs,
    callEdges: factsEvidence.counts.callEdges,
    symbols: factsEvidence.counts.functions + factsEvidence.counts.data,
    calls: factsEvidence.counts.relocs + factsEvidence.counts.dataRelocs + factsEvidence.counts.callEdges,
    records: factsEvidence.counts.records,
    bytes: artifacts.facts.raw.length,
  };
  assertExactCsgKeys(summary.totals, Object.keys(expectedTotals), `canonical CSG summary totals ${summaryPath}`);
  if (JSON.stringify(summary.totals) !== JSON.stringify(expectedTotals) || summary.byteSize !== artifacts.facts.raw.length) throw new Error(`canonical CSG summary totals mismatch: ${summaryPath}`);
  for (const [label, artifact] of [["facts", artifacts.facts], ["writer report", artifacts.writerReport], ["reader report", artifacts.readerReport], ["object", artifacts.object], ["summary", generationSummary]]) {
    if ((artifact.stat.mode & 0o222n) !== 0n) throw new Error(`CSG immutable generation ${label} is writable: ${generationDir}`);
  }
  // Re-read the pointer and every artifact after validation.  A cache entry is only
  // produced from one stable generation, never from a path that changed mid-query.
  const finalCanonical = readStableCsgArtifact(chengColdSummaryPath(root), "canonical CSG summary", CHENG_CSG_QUERY_MAX_SUMMARY_BYTES);
  if (finalCanonical.hash !== canonicalEvidence.hash || !finalCanonical.raw.equals(canonicalEvidence.raw)) throw new Error(`canonical CSG summary changed during verification: ${summaryPath}`);
  const finalGenerationSummary = readStableCsgArtifact(paths.summary, "CSG immutable generation summary final verification", CHENG_CSG_QUERY_MAX_SUMMARY_BYTES);
  if (finalGenerationSummary.hash !== generationSummary.hash || (finalGenerationSummary.stat.mode & 0o222n) !== 0n) throw new Error(`CSG immutable generation summary changed during verification: ${paths.summary}`);
  if (JSON.stringify(readdirSync(generationDir).sort()) !== JSON.stringify(expectedNames)) throw new Error(`CSG immutable generation directory changed during verification: ${generationDir}`);
  for (const [key, path] of Object.entries({facts: paths.facts, writerReport: paths.writerReport, readerReport: paths.readerReport, object: paths.objectOut})) {
    const maxBytes = key === "facts" ? CHENG_CSG_QUERY_MAX_FACTS_BYTES : key === "object" ? CHENG_CSG_QUERY_MAX_OBJECT_BYTES : CHENG_CSG_QUERY_MAX_REPORT_BYTES;
    const finalArtifact = readStableCsgArtifact(path, `CSG ${key} final verification`, maxBytes);
    if (finalArtifact.hash !== artifacts[key].hash || (finalArtifact.stat.mode & 0o222n) !== 0n) throw new Error(`CSG generation ${key} changed during verification: ${path}`);
  }
  return {summary, summaryHash: canonicalEvidence.hash, paths, factsRaw: artifacts.facts.raw, writerReport};
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

function parseChengColdFacts(root, factsPath, summary = {}, rawOverride = null, verifiedReport = null) {
  const raw = rawOverride || readFileSync(factsPath);
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
  const report = verifiedReport || parseColdReport(summary.writerReport || summary.readerReport);
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

async function parseCsgCoreFacts(root, factsPath, summary = {}, rawOverride = null) {
  if (!existsSync(CSG_CORE_READER)) throw new Error(`CSG-Core reader not found: ${CSG_CORE_READER}`);
  const {csgcReadFacts} = await import(pathToFileURL(CSG_CORE_READER).href);
  const decoded = csgcReadFacts(rawOverride || readFileSync(factsPath));
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
  if (input.facts) throw new Error(`facts path override is disabled; Cheng CSG is fixed to ${chengColdFactsPath(root)}`);
  const verified = verifyCommittedCsgGeneration(root);
  if (!verified) {
    const current = chengColdFactsPath(root);
    let currentStat = null;
    try {
      currentStat = lstatSync(current);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (currentStat) throw new Error(`uncommitted Cheng CSG facts found without canonical summary: ${current}; run cheng_csg_roundtrip to create a verified generation`);
    return null;
  }
  const {summary, paths, factsRaw, summaryHash, writerReport} = verified;
  const actualFactsRoot = sha256Hex(factsRaw);
  const cacheKey = `${summaryHash}:${summary.generationHash}:${paths.facts}:${actualFactsRoot}`;
  if (csgFactsCache.has(cacheKey)) return csgFactsCache.get(cacheKey);
  const parsed = parseChengColdFacts(root, paths.facts, summary, factsRaw, writerReport);
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
function withChengDriverRawOutput(result, stdoutBuffer, stderrBuffer) {
  // Text remains the stable public surface for existing callers. Non-enumerable buffers preserve
  // exact process bytes for golden contracts without inflating spread/serialized tool results.
  Object.defineProperties(result, {
    stdoutBuffer: {value: stdoutBuffer, enumerable: false},
    stderrBuffer: {value: stderrBuffer, enumerable: false},
  });
  return result;
}

function runChengDriver(driver, args, options = {}) {
  if (!existsSync(driver)) {
    const stderr = Buffer.from(`cheng driver not found: ${driver}`, "utf8");
    return Promise.resolve(withChengDriverRawOutput(
      {missingDriver: true, driver, exitCode: null, stdout: "", stderr: stderr.toString("utf8"), timedOut: false, overflow: false},
      Buffer.alloc(0),
      stderr,
    ));
  }
  const cwd = options.cwd || resolveChengProjectRoot(options);
  const maxBuffer = options.maxBuffer || (1 << 30);
  const timeoutMs = chengFusionTimeoutMs(options.timeoutMs || CHENG_FUSION_DRIVER_TIMEOUT_MS_DEFAULT);
  return new Promise((resolvePromise) => {
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutLength = 0;
    let stderrLength = 0;
    let settled = false;
    let timedOut = false;
    let overflow = false;
    let child;
    try {
      child = spawn(driver, args, {
        cwd,
        env: chengDriverSpawnEnv(options.env, options.unsetEnv),
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
    } catch (error) {
      const stderr = Buffer.from(error instanceof Error ? error.message : String(error), "utf8");
      resolvePromise(withChengDriverRawOutput(
        {missingDriver: false, driver, exitCode: null, stdout: "", stderr: stderr.toString("utf8"), timedOut: false, overflow: false},
        Buffer.alloc(0),
        stderr,
      ));
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      killChengProcessGroup(child, "SIGKILL");
    }, timeoutMs);
    const append = (which, chunk) => {
      if (overflow) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (stdoutLength + stderrLength + bytes.length > maxBuffer) {
        overflow = true;
        killChengProcessGroup(child, "SIGKILL");
        return;
      }
      if (which === "stdout") {
        stdoutChunks.push(bytes);
        stdoutLength += bytes.length;
      } else {
        stderrChunks.push(bytes);
        stderrLength += bytes.length;
      }
    };
    child.stdout?.on("data", (chunk) => append("stdout", chunk));
    child.stderr?.on("data", (chunk) => append("stderr", chunk));
    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks, stdoutLength);
      let stderr = Buffer.concat(stderrChunks, stderrLength);
      let stderrText = stderr.toString("utf8");
      if (timedOut) stderrText += `\n[cheng-fusion] timed out after ${timeoutMs}ms; process group killed (SIGKILL)`;
      if (overflow) stderrText += `\n[cheng-fusion] output exceeded maxBuffer (${maxBuffer} bytes); process group killed (SIGKILL)`;
      resolvePromise(withChengDriverRawOutput(
        {missingDriver: false, driver, exitCode: timedOut || overflow ? null : exitCode, stdout: stdout.toString("utf8"), stderr: stderrText, timedOut, overflow},
        stdout,
        stderr,
      ));
    };
    child.on("error", (error) => {
      append("stderr", Buffer.from(`\n${error instanceof Error ? error.message : String(error)}`, "utf8"));
    });
    child.on("close", (code) => finish(code));
  });
}

const CHENG_FUSION_CRASH_TRIAGE_TIMEOUT_MS_DEFAULT = 60000;

// lldb 的 `run` 一行命令自己做类 shell 的空白/引号切分, 实参含空格或引号时需要显式加引号转义,
// 否则会被当成多个独立 argv 传给 debuggee.
function lldbArgQuote(value) {
  const text = String(value);
  if (/[\0\r\n]/.test(text)) throw new Error("lldb argument contains a forbidden NUL/line break");
  if (text.length > 0 && !/[\s"\\]/.test(text)) return text;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const CHENG_FUSION_RESERVED_DEBUGGEE_ENV = new Set(["CHENG_PROCESS_MAX_RSS_BYTES"]);

function validateLldbDebuggeeEnv(env) {
  if (env === undefined) return [];
  if (!env || typeof env !== "object" || Array.isArray(env)) throw new Error("LLDB debuggee env must be an object of string pairs");
  const entries = Object.entries(env);
  for (const [key, value] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`LLDB debuggee env has an invalid variable name: ${key}`);
    if (typeof value !== "string" || /[\0\r\n]/.test(value)) throw new Error(`LLDB debuggee env ${key} must be a string without NUL or line breaks`);
    if (CHENG_FUSION_RESERVED_DEBUGGEE_ENV.has(key)) throw new Error(`LLDB debuggee env may not override reserved ${key}`);
  }
  return entries.sort(([left], [right]) => left.localeCompare(right));
}

// The controller keeps its own inherited environment. User input is translated only into
// LLDB's target environment, and the process RSS cap is appended last as a non-overridable
// debuggee invariant.
function lldbTargetEnvVarsCommand(env) {
  const entries = validateLldbDebuggeeEnv(env);
  const tokens = [...entries, ["CHENG_PROCESS_MAX_RSS_BYTES", chengFusionRssCapBytes()]]
    .map(([key, value]) => lldbArgQuote(`${key}=${value}`));
  return `settings set target.env-vars ${tokens.join(" ")}`;
}

function assertLldbAslrDisabled(output, stage) {
  if (!/target\.disable-aslr[^\r\n]*=\s*true\b/i.test(String(output || ""))) {
    throw new Error(`${stage}: LLDB did not prove target.disable-aslr=true: ${takeTrailingText(output, 2000)}`);
  }
}

// lldb 批处理子进程的共享 spawn 骨架: spawn+detached+手动计时器给 lldb 自己也套上超时/RSS
// 加固(和 runChengDriver 同一套孤儿防护), 按 maxBuffer 截断防止失控输出. runLldbBatch(崩点
// 探测, -k 触发) 和 runLldbOCommands(cheng_corrupt_hunt 的无条件顺序 -o 脚本) 共用这一段,
// 只是各自拼装不同的 lldbArgs.
function spawnLldbSession(lldbArgs, options = {}) {
  const maxBuffer = options.maxBuffer || (1 << 26);
  const timeoutMs = chengFusionTimeoutMs(options.timeoutMs || CHENG_FUSION_CRASH_TRIAGE_TIMEOUT_MS_DEFAULT);
  return new Promise((resolvePromise) => {
    const outputChunks = [];
    let outputLength = 0;
    let settled = false;
    let timedOut = false;
    let overflow = false;
    let child;
    try {
      child = spawn("lldb", lldbArgs, {
        cwd: options.cwd || process.cwd(),
        env: chengDriverSpawnEnv(),
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
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (outputLength + bytes.length > maxBuffer) {
        overflow = true;
        killChengProcessGroup(child, "SIGKILL");
        return;
      }
      outputChunks.push(bytes);
      outputLength += bytes.length;
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const output = Buffer.concat(outputChunks, outputLength);
      let text = output.toString("utf8");
      if (timedOut) text += `\n[cheng-fusion] lldb session timed out after ${timeoutMs}ms; process group killed (SIGKILL)`;
      if (overflow) text += `\n[cheng-fusion] lldb output exceeded maxBuffer (${maxBuffer} bytes); process group killed (SIGKILL)`;
      resolvePromise({exitCode: timedOut || overflow ? null : exitCode, output: text, timedOut, overflow});
    };
    child.on("error", (error) => {
      append(Buffer.from(`\n${error instanceof Error ? error.message : String(error)}`, "utf8"));
    });
    child.on("close", (code) => finish(code));
  });
}

// 崩点批处理: -o 是无条件顺序执行的命令, -k(--one-line-on-crash) 只在 debuggee 因信号/异常停止时
// 才触发 —— 干净退出时不会跑, 也不会挂起(lldb 自身在命令队列耗尽后退出).
function runLldbBatch(binary, args, env, options = {}) {
  const maxFrames = options.maxFrames || 64;
  const runLine = ["run", ...args.map(lldbArgQuote)].join(" ");
  const lldbArgs = [
    "--no-lldbinit", "--no-use-colors", "-b",
    "-o", "settings set target.disable-aslr true",
    "-o", "settings show target.disable-aslr",
    "-o", lldbTargetEnvVarsCommand(env),
    "-o", runLine,
    "-k", `bt ${maxFrames}`, "-k", "register read", "-k", "image list -o -f", "-k", "quit", binary,
  ];
  return spawnLldbSession(lldbArgs, options);
}

// cheng_corrupt_hunt 用: 一串无条件顺序执行的 -o 命令(不依赖 -k 崩溃触发), binary 仍按 lldb
// 的隐式 target-create 位置参数传入(和 runLldbBatch 一致的约定, splitLldbSessions 已验证过
// 这个隐式创建不会额外产生一段 "(lldb) " 输出块)。
function runLldbOCommands(binary, commands, env, options = {}) {
  // `env` is intentionally not passed to the LLDB controller process. Stage commands
  // must use lldbTargetEnvVarsCommand before launch.
  validateLldbDebuggeeEnv(env);
  const lldbArgs = ["--no-lldbinit", "--no-use-colors", "-b"];
  for (const command of commands) lldbArgs.push("-o", command);
  lldbArgs.push(binary);
  return spawnLldbSession(lldbArgs, options);
}

// corrupt-hunt stage2 cannot pre-schedule a fixed number of `continue/memory/bt`
// commands: once the debuggee exits, every remaining command is an LLDB error and
// stale stop text can be mistaken for a new event. Commands executed while the
// target is stopped use a private Python-print delimiter. `continue` is different:
// writing its delimiter in the same stdin payload lets LLDB forward those bytes to
// the running debuggee. It therefore sends only `continue\n`, then waits for the
// complete process stop/exit event before sending anything else. In synchronous
// non-TTY mode LLDB does not emit a fresh prompt after `continue`; the final
// `Target N: (...) stopped.` line is the stop-event completion boundary.
function createInteractiveLldbSession(binary, options = {}) {
  const maxBuffer = options.maxBuffer || (1 << 26);
  const timeoutMs = chengFusionTimeoutMs(options.timeoutMs || CHENG_FUSION_CRASH_TRIAGE_TIMEOUT_MS_DEFAULT);
  let child;
  try {
    child = spawn("lldb", ["--no-lldbinit", "--no-use-colors", binary], {
      cwd: options.cwd || process.cwd(),
      env: chengDriverSpawnEnv(),
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    });
  } catch (error) {
    throw new Error(`failed to spawn lldb: ${error instanceof Error ? error.message : String(error)}`);
  }

  const outputChunks = [];
  let outputLength = 0;
  let idleBuffer = Buffer.alloc(0);
  let waiter = null;
  let commandSequence = 0;
  let timedOut = false;
  let overflow = false;
  let spawnError = null;
  let closed = false;
  let closeCode = null;
  let resolveClose;
  const closePromise = new Promise((resolvePromise) => { resolveClose = resolvePromise; });

  const rejectWaiter = (error) => {
    if (!waiter) return;
    const current = waiter;
    waiter = null;
    current.reject(error);
  };
  const inspectWaiter = () => {
    if (!waiter) return;
    const text = waiter.buffer.toString("utf8");
    let match;
    if (waiter.kind === "command") {
      const markerPattern = new RegExp(`(?:^|\\r?\\n)${waiter.marker}\\r?\\n`);
      match = markerPattern.exec(text);
      if (!match) return;
    } else {
      const stopReason = /stop reason = [^\r\n]+\r?\n/i.exec(text);
      let stopComplete = null;
      if (stopReason) {
        const afterReason = stopReason.index + stopReason[0].length;
        const targetStopped = /^Target\s+\d+:\s+.*\bstopped\.\r?\n/gmi.exec(text.slice(afterReason));
        if (targetStopped) {
          const end = afterReason + targetStopped.index + targetStopped[0].length;
          stopComplete = {start: stopReason.index, end};
        }
      }
      const terminalMatches = [
        stopComplete,
        /^Process\s+[1-9]\d*\s+exited with[^\r\n]*\r?\n/gmi.exec(text),
        /(?:^|\r?\n)error:\s*[^\r\n]*\r?\n/i.exec(text),
      ].filter(Boolean).map((candidate) => candidate.start === undefined
        ? {start: candidate.index, end: candidate.index + candidate[0].length}
        : candidate).sort((left, right) => left.start - right.start);
      if (terminalMatches.length === 0) return;
      match = {index: terminalMatches[0].end, 0: ""};
    }
    const current = waiter;
    waiter = null;
    idleBuffer = Buffer.from(text.slice(match.index + match[0].length), "utf8");
    current.resolve(text.slice(0, match.index));
  };
  const append = (chunk) => {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (overflow) return;
    if (outputLength + bytes.length > maxBuffer) {
      overflow = true;
      killChengProcessGroup(child, "SIGKILL");
      rejectWaiter(new Error(`lldb output exceeded maxBuffer (${maxBuffer} bytes)`));
      return;
    }
    outputChunks.push(bytes);
    outputLength += bytes.length;
    if (waiter) {
      waiter.buffer = Buffer.concat([waiter.buffer, bytes]);
      inspectWaiter();
    } else {
      idleBuffer = Buffer.concat([idleBuffer, bytes]);
    }
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  child.on("error", (error) => {
    spawnError = error instanceof Error ? error.message : String(error);
    append(Buffer.from(`\n${spawnError}`, "utf8"));
    rejectWaiter(new Error(`lldb process error: ${spawnError}`));
  });
  child.on("close", (code) => {
    if (closed) return;
    closed = true;
    closeCode = code;
    clearTimeout(timer);
    rejectWaiter(new Error(`lldb exited before completing command (exitCode=${code})`));
    resolveClose();
  });
  const timer = setTimeout(() => {
    timedOut = true;
    killChengProcessGroup(child, "SIGKILL");
    rejectWaiter(new Error(`lldb session timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  async function execute(command) {
    if (closed) throw new Error(`lldb already exited (exitCode=${closeCode})`);
    if (waiter) throw new Error("lldb command protocol violation: concurrent commands");
    const marker = `__CHENG_FUSION_LLDB_COMMAND_${commandSequence++}__`;
    return new Promise((resolvePromise, rejectPromise) => {
      waiter = {kind: "command", marker, buffer: idleBuffer, resolve: resolvePromise, reject: rejectPromise};
      idleBuffer = Buffer.alloc(0);
      const payload = `${command}\nscript print(${JSON.stringify(marker)})\n`;
      child.stdin.write(payload, (error) => {
        if (!error) return;
        rejectWaiter(new Error(`failed to write lldb command: ${error.message}`));
        killChengProcessGroup(child, "SIGKILL");
      });
      inspectWaiter();
    });
  }

  async function continueUntilStop() {
    if (closed) throw new Error(`lldb already exited (exitCode=${closeCode})`);
    if (waiter) throw new Error("lldb command protocol violation: concurrent commands");
    return new Promise((resolvePromise, rejectPromise) => {
      waiter = {kind: "process-event", buffer: idleBuffer, resolve: resolvePromise, reject: rejectPromise};
      idleBuffer = Buffer.alloc(0);
      child.stdin.write("continue\n", (error) => {
        if (!error) return;
        rejectWaiter(new Error(`failed to write lldb continue command: ${error.message}`));
        killChengProcessGroup(child, "SIGKILL");
      });
      inspectWaiter();
    });
  }

  async function close() {
    if (!closed) {
      try {
        child.stdin.write("quit\n");
        child.stdin.end();
      } catch {
        killChengProcessGroup(child, "SIGKILL");
      }
    }
    await closePromise;
    const output = Buffer.concat(outputChunks, outputLength).toString("utf8");
    return {
      exitCode: timedOut || overflow || spawnError ? null : closeCode,
      output,
      timedOut,
      overflow,
      error: spawnError,
    };
  }

  return {execute, continueUntilStop, close};
}

function assertCorruptHuntLldbSuccess(session, stage) {
  const tail = takeTrailingText(session.output || session.error || "", 2000);
  if (session.timedOut) throw new Error(`cheng_corrupt_hunt ${stage}: lldb timed out; session state is unknown: ${tail}`);
  if (session.overflow) throw new Error(`cheng_corrupt_hunt ${stage}: lldb output overflow; session is incomplete: ${tail}`);
  if (!Number.isInteger(session.exitCode)) throw new Error(`cheng_corrupt_hunt ${stage}: lldb produced no integer exitCode: ${tail}`);
  if (session.exitCode !== 0) throw new Error(`cheng_corrupt_hunt ${stage}: lldb exited ${session.exitCode}: ${tail}`);
}

function assertNoLldbCommandError(output, stage, command) {
  const errorMatch = String(output || "").match(/(?:^|\n)error:\s*([^\r\n]*)/i);
  if (errorMatch) throw new Error(`cheng_corrupt_hunt ${stage}: LLDB command '${command}' failed: ${errorMatch[1]}`);
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

// T/t 都作为精确区间边界收集；所有权只允许同址唯一全局 T。局部 t 可能只是函数内标签，
// 不能靠 nm 行序把它冒充函数 owner。
function nmTextSymbols(path) {
  if (!existsSync(path)) return [];
  const result = spawnSync("nm", ["-n", path], {encoding: "utf8", timeout: 15000, maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0 || !result.stdout) return [];
  const symbols = [];
  for (const line of result.stdout.split("\n")) {
    const match = line.match(/^([0-9a-fA-F]{16})\s+([Tt])\s+(\S+)$/);
    if (match) symbols.push({addr: Number(`0x${match[1]}`), kind: match[2], name: match[3]});
  }
  symbols.sort((a, b) => a.addr - b.addr);
  return symbols;
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

function nearestPrecedingSymbolGroup(symbols, offset) {
  let lo = 0, hi = symbols.length - 1, bestAddress = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (symbols[mid].addr <= offset) {
      bestAddress = symbols[mid].addr;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return bestAddress === null ? [] : symbols.filter((symbol) => symbol.addr === bestAddress);
}

// 纯地址 -> 符号 的核心判定树(不含 bt 帧的 lldbSymbol/foreign-module 包装), 抽出来给
// cheng_corrupt_hunt 的单点 pc(寄存器读出的崩点/写点)和 triageChengBinaryCrash 的每条 bt 帧共用。
function symbolizeChengPc(pcNumber, ctx) {
  if (!ctx.primaryObjectExists) return {symbol: null, providerUnresolved: true, reason: "primary-object-not-found", primaryObject: ctx.primaryObject};
  if (!ctx.exeText || !ctx.primaryText) return {symbol: null, providerUnresolved: true, reason: "text-section-not-found"};
  const fileOffset = pcNumber - (ctx.slide || 0) - ctx.exeText.addr;
  if (fileOffset < 0 || fileOffset >= ctx.primaryText.size) {
    return {symbol: null, providerUnresolved: true, reason: "provider-region", fileOffset};
  }
  const objectAddress = ctx.primaryText.addr + fileOffset;
  const symbolGroup = nearestPrecedingSymbolGroup(ctx.nmSymbols, objectAddress);
  if (symbolGroup.length === 0) return {symbol: null, providerUnresolved: true, reason: "before-first-symbol", fileOffset};
  const symbolAddress = symbolGroup[0].addr;
  if (symbolAddress < ctx.primaryText.addr || symbolAddress >= ctx.primaryText.addr + ctx.primaryText.size) {
    return {symbol: null, providerUnresolved: true, reason: "symbol-outside-primary-text", fileOffset};
  }
  const globalNames = [...new Set(symbolGroup.filter((symbol) => symbol.kind === "T").map((symbol) => symbol.name))].sort();
  if (globalNames.length > 1) {
    return {symbol: null, providerUnresolved: true, reason: "ambiguous-primary-symbol", fileOffset, candidates: globalNames};
  }
  if (globalNames.length === 0) {
    const localNames = [...new Set(symbolGroup.map((symbol) => symbol.name))].sort();
    return {symbol: null, providerUnresolved: true, reason: "local-primary-symbol-boundary", fileOffset, candidates: localNames};
  }
  return {symbol: globalNames[0], offset: objectAddress - symbolAddress, providerUnresolved: false};
}

// bt 帧包装: 帧自带 lldb 已解析的符号(如落在系统 dylib)直接采用; 帧所属模块不是本 binary 的
// 一律标 foreign-module; 否则委托 symbolizeChengPc 做地址判定。
function symbolizeFrame(frame, ctx) {
  if (frame.lldbSymbol) return {...frame, symbol: frame.lldbSymbol, offset: null, providerUnresolved: false};
  if (frame.module !== ctx.binaryBase) return {...frame, symbol: null, providerUnresolved: true, reason: "foreign-module"};
  const resolved = symbolizeChengPc(Number(frame.pc), ctx);
  return {...frame, ...resolved};
}

const CHENG_FUSION_CRASH_TRIAGE_INPUT_FILE_MAX_BYTES = 1024 * 1024 * 1024;
const CHENG_FUSION_CRASH_TRIAGE_INPUT_TOTAL_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const CHENG_FUSION_CRASH_TRIAGE_SNAPSHOT_PREFIX = "cheng-fusion-crash-triage-";

function crashTriageStableStatKey(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mode, stat.uid, stat.gid, stat.nlink, stat.mtimeNs, stat.ctimeNs]
    .map((value) => String(value)).join(":");
}

function stableFileStatKey(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mode, stat.mtimeNs, stat.ctimeNs].map((value) => String(value)).join(":");
}

function createCrashTriageSnapshotRoot() {
  const root = mkdtempSync(join(tmpdir(), CHENG_FUSION_CRASH_TRIAGE_SNAPSHOT_PREFIX));
  chmodSync(root, 0o700);
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (rootStat.mode & 0o777) !== 0o700) {
    throw new Error(`cheng_crash_triage failed to create a private snapshot directory: ${root}`);
  }
  return root;
}

// Open the caller-owned input once with O_NOFOLLOW, stream exactly that generation into
// a private O_EXCL file, and reject any metadata/path-generation change observed across
// the copy. All downstream processes receive only destinationPath.
function snapshotCrashTriageInput(sourcePath, reportedPath, destinationPath, label, mode, total) {
  let pathBefore;
  try {
    pathBefore = lstatSync(sourcePath, {bigint: true});
  } catch (error) {
    throw new Error(`${label} not found: ${reportedPath} (${error instanceof Error ? error.message : String(error)})`);
  }
  if (pathBefore.isSymbolicLink() || !pathBefore.isFile() || pathBefore.size <= 0n) {
    throw new Error(`${label} must be a non-empty regular non-symlink file: ${reportedPath}`);
  }
  const size = Number(pathBefore.size);
  if (!Number.isSafeInteger(size) || size > CHENG_FUSION_CRASH_TRIAGE_INPUT_FILE_MAX_BYTES) {
    throw new Error(`${label} exceeds the ${CHENG_FUSION_CRASH_TRIAGE_INPUT_FILE_MAX_BYTES}-byte input limit: ${reportedPath} (${pathBefore.size} bytes)`);
  }
  if (total.bytes + size > CHENG_FUSION_CRASH_TRIAGE_INPUT_TOTAL_MAX_BYTES) {
    throw new Error(`cheng_crash_triage inputs exceed the ${CHENG_FUSION_CRASH_TRIAGE_INPUT_TOTAL_MAX_BYTES}-byte total limit`);
  }
  if (mode === 0o700) {
    try {
      accessSync(sourcePath, constants.X_OK);
    } catch {
      throw new Error(`${label} is not executable: ${reportedPath}`);
    }
  }
  if (typeof constants.O_NOFOLLOW !== "number") {
    throw new Error("cheng_crash_triage requires O_NOFOLLOW support for live input snapshots");
  }

  const cloexec = typeof constants.O_CLOEXEC === "number" ? constants.O_CLOEXEC : 0;
  let sourceFd = null;
  let destinationFd = null;
  let sourceBefore;
  let sourceAfter;
  let pathAfter;
  let copied = 0;
  const hash = createHash("sha256");
  try {
    sourceFd = openSync(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW | cloexec);
    sourceBefore = fstatSync(sourceFd, {bigint: true});
    if (!sourceBefore.isFile() || sourceBefore.size <= 0n
        || sourceBefore.dev !== pathBefore.dev || sourceBefore.ino !== pathBefore.ino
        || crashTriageStableStatKey(sourceBefore) !== crashTriageStableStatKey(pathBefore)) {
      throw new Error(`${label} changed while being opened: ${reportedPath}`);
    }

    destinationFd = openSync(destinationPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | cloexec,
      mode);
    fchmodSync(destinationFd, mode);
    const buffer = Buffer.allocUnsafe(Math.min(1024 * 1024, size));
    while (copied < size) {
      const count = readSync(sourceFd, buffer, 0, Math.min(buffer.length, size - copied), copied);
      if (count <= 0) throw new Error(`${label} ended before its declared size while being copied: ${reportedPath}`);
      hash.update(buffer.subarray(0, count));
      let written = 0;
      while (written < count) {
        const n = writeSync(destinationFd, buffer, written, count - written);
        if (n <= 0) throw new Error(`${label} snapshot write made no progress: ${reportedPath}`);
        written += n;
      }
      copied += count;
    }
    sourceAfter = fstatSync(sourceFd, {bigint: true});
    try {
      pathAfter = lstatSync(sourcePath, {bigint: true});
    } catch (error) {
      throw new Error(`${label} path changed while being copied: ${reportedPath} (${error instanceof Error ? error.message : String(error)})`);
    }
    if (copied !== size
        || crashTriageStableStatKey(sourceBefore) !== crashTriageStableStatKey(sourceAfter)
        || crashTriageStableStatKey(sourceAfter) !== crashTriageStableStatKey(pathAfter)) {
      throw new Error(`${label} changed while being copied: ${reportedPath}`);
    }
    fsyncSync(destinationFd);
    const destinationStat = fstatSync(destinationFd, {bigint: true});
    if (!destinationStat.isFile() || destinationStat.size !== sourceAfter.size
        || (destinationStat.mode & 0o777n) !== BigInt(mode)) {
      throw new Error(`${label} snapshot verification failed: ${reportedPath}`);
    }
  } finally {
    if (destinationFd !== null) closeSync(destinationFd);
    if (sourceFd !== null) closeSync(sourceFd);
  }
  total.bytes += copied;
  return {
    sourcePath: reportedPath,
    destinationPath,
    mode,
    size: copied,
    sha256: `sha256:${hash.digest("hex")}`,
  };
}

function verifyCrashTriageSnapshot(snapshot, label) {
  const pathBefore = lstatSync(snapshot.destinationPath, {bigint: true});
  if (pathBefore.isSymbolicLink() || !pathBefore.isFile() || pathBefore.size !== BigInt(snapshot.size)
      || (pathBefore.mode & 0o777n) !== BigInt(snapshot.mode)) {
    throw new Error(`${label} private snapshot metadata changed after publication`);
  }
  const cloexec = typeof constants.O_CLOEXEC === "number" ? constants.O_CLOEXEC : 0;
  const fd = openSync(snapshot.destinationPath, constants.O_RDONLY | constants.O_NOFOLLOW | cloexec);
  const hash = createHash("sha256");
  let copied = 0;
  let fdBefore;
  let fdAfter;
  try {
    fdBefore = fstatSync(fd, {bigint: true});
    if (crashTriageStableStatKey(fdBefore) !== crashTriageStableStatKey(pathBefore)) {
      throw new Error(`${label} private snapshot generation changed while being opened`);
    }
    const buffer = Buffer.allocUnsafe(Math.min(1024 * 1024, snapshot.size));
    while (copied < snapshot.size) {
      const count = readSync(fd, buffer, 0, Math.min(buffer.length, snapshot.size - copied), copied);
      if (count <= 0) throw new Error(`${label} private snapshot ended before its declared size`);
      hash.update(buffer.subarray(0, count));
      copied += count;
    }
    fdAfter = fstatSync(fd, {bigint: true});
  } finally {
    closeSync(fd);
  }
  const pathAfter = lstatSync(snapshot.destinationPath, {bigint: true});
  const actualHash = `sha256:${hash.digest("hex")}`;
  if (copied !== snapshot.size
      || crashTriageStableStatKey(fdBefore) !== crashTriageStableStatKey(fdAfter)
      || crashTriageStableStatKey(fdAfter) !== crashTriageStableStatKey(pathAfter)
      || actualHash !== snapshot.sha256) {
    throw new Error(`${label} private snapshot bytes changed after publication: expected ${snapshot.sha256}, got ${actualHash}`);
  }
}

function publicCrashTriageInputEvidence(snapshot) {
  return snapshot ? {path: snapshot.sourcePath, size: snapshot.size, sha256: snapshot.sha256} : null;
}

// 纯发射 gen2 崩溃(0 行 stderr trace)的实战闭环: 先冻结 binary/primary.o 的稳定字节,
// 再让 lldb/otool/nm 只消费私有快照。对外始终报告调用者的原路径和内容证据。
async function triageChengBinaryCrash(input) {
  const binary = String(input.binary || "");
  if (!isAbsolute(binary)) throw new Error(`cheng_crash_triage binary must be an absolute path: ${binary}`);
  const binarySource = resolve(binary);
  const primaryWasExplicit = Object.prototype.hasOwnProperty.call(input, "primaryObject");
  const primaryObject = primaryWasExplicit ? String(input.primaryObject || "") : `${binary}.primary.o`;
  if (!isAbsolute(primaryObject)) throw new Error(`cheng_crash_triage primaryObject must be an absolute path: ${primaryObject}`);
  const primarySource = resolve(primaryObject);
  const args = Array.isArray(input.args) ? input.args : [];
  const maxFrames = input.maxFrames || 64;
  let snapshotRoot = null;
  try {
    snapshotRoot = createCrashTriageSnapshotRoot();
    const binaryDir = join(snapshotRoot, "binary");
    const primaryDir = join(snapshotRoot, "primary");
    mkdirSync(binaryDir, {mode: 0o700});
    mkdirSync(primaryDir, {mode: 0o700});
    chmodSync(binaryDir, 0o700);
    chmodSync(primaryDir, 0o700);
    const total = {bytes: 0};
    const binarySnapshot = snapshotCrashTriageInput(
      binarySource, binary, join(binaryDir, basename(binarySource)),
      "cheng_crash_triage binary", 0o700, total,
    );
    let primarySnapshot = null;
    if (primaryWasExplicit) {
      primarySnapshot = snapshotCrashTriageInput(
        primarySource, primaryObject, join(primaryDir, basename(primarySource)),
        "cheng_crash_triage primaryObject", 0o600, total,
      );
    } else {
      let defaultPrimaryExists = false;
      try {
        lstatSync(primarySource);
        defaultPrimaryExists = true;
      } catch (error) {
        if (!error || error.code !== "ENOENT") {
          throw new Error(`cheng_crash_triage cannot inspect default primaryObject ${primaryObject}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (defaultPrimaryExists) {
        primarySnapshot = snapshotCrashTriageInput(
          primarySource, primaryObject, join(primaryDir, basename(primarySource)),
          "cheng_crash_triage primaryObject", 0o600, total,
        );
      }
    }
    const inputEvidence = {
      binary: publicCrashTriageInputEvidence(binarySnapshot),
      primaryObject: publicCrashTriageInputEvidence(primarySnapshot),
    };

    const session = await runLldbBatch(binarySnapshot.destinationPath, args, input.env || {}, {
      maxFrames,
      timeoutMs: input.timeoutSec ? Math.round(input.timeoutSec * 1000) : undefined,
      maxBuffer: input.maxOutputBytes,
    });
    const text = session.output;
    assertLldbAslrDisabled(text, "cheng_crash_triage live lldb");
    if (session.timedOut) {
      throw new Error(`cheng_crash_triage live lldb timed out; crash state is unknown: ${takeTrailingText(text, 2000)}`);
    }
    if (session.overflow) {
      throw new Error(`cheng_crash_triage live lldb output overflow; crash state is incomplete: ${takeTrailingText(text, 2000)}`);
    }
    if (!Number.isInteger(session.exitCode)) {
      throw new Error(`cheng_crash_triage live lldb produced no exit code: ${takeTrailingText(text, 2000)}`);
    }
    if (session.exitCode !== 0) {
      throw new Error(`cheng_crash_triage live lldb exited ${session.exitCode}: ${takeTrailingText(text, 2000)}`);
    }
    verifyCrashTriageSnapshot(binarySnapshot, "cheng_crash_triage binary");
    if (primarySnapshot) verifyCrashTriageSnapshot(primarySnapshot, "cheng_crash_triage primaryObject");
    const exitedMatch = text.match(/exited with status = (-?\d+)/);
    const hasStopReason = /stop reason = /.test(text);
    if (!exitedMatch && !hasStopReason) {
      throw new Error(`cheng_crash_triage live lldb completed without a debuggee exit or stop reason: ${takeTrailingText(text, 2000)}`);
    }
    if (exitedMatch && !hasStopReason) {
      return {
        schema: "cheng_crash_triage_live.v1",
        binary, args, primaryObject, inputEvidence,
        exited: true,
        exitCode: Number(exitedMatch[1]),
        stopReason: null,
        stopClass: null,
        faultAddress: null,
        crashInsn: null,
        frames: [],
        registers: {},
        lldbExitCode: session.exitCode,
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
    const primaryObjectExists = Boolean(primarySnapshot);
    const exeText = parseOtoolTextSection(binarySnapshot.destinationPath);
    const primaryText = primarySnapshot ? parseOtoolTextSection(primarySnapshot.destinationPath) : null;
    const nmSymbols = primarySnapshot ? nmTextSymbols(primarySnapshot.destinationPath) : [];
    verifyCrashTriageSnapshot(binarySnapshot, "cheng_crash_triage binary");
    if (primarySnapshot) verifyCrashTriageSnapshot(primarySnapshot, "cheng_crash_triage primaryObject");
    const symbolizeCtx = {binaryBase: basename(binary), primaryObject, primaryObjectExists, exeText, primaryText, nmSymbols, slide};
    const symbolicated = frames.map((frame) => symbolizeFrame(frame, symbolizeCtx));
    return {
      schema: "cheng_crash_triage_live.v1",
      binary, args, primaryObject, inputEvidence,
      exited: false,
      stopReason: stopReasonMatch ? stopReasonMatch[1].trim() : null,
      stopClass: classifyStopClass(stopReasonMatch ? stopReasonMatch[1].trim() : null, frames),
      faultAddress: faultMatch ? faultMatch[1] : null,
      crashInsn: crashInsnMatch ? {pc: crashInsnMatch[1], insn: crashInsnMatch[2].trim()} : null,
      frames: symbolicated,
      registers,
      slide,
      lldbExitCode: session.exitCode,
      timedOut: Boolean(session.timedOut),
      overflow: Boolean(session.overflow),
    };
  } finally {
    if (snapshotRoot) rmSync(snapshotRoot, {recursive: true, force: true});
  }
}

const CHENG_FUSION_CORRUPT_HUNT_TIMEOUT_MS_DEFAULT = 60000;
const CHENG_FUSION_CORRUPT_HUNT_MAXHITS_DEFAULT = 8;
const CHENG_FUSION_CORRUPT_HUNT_BT_DEPTH = 8;

function toHexAddr(n) {
  return `0x${(typeof n === "bigint" ? n : BigInt(Math.trunc(n))).toString(16)}`;
}

function parseCorruptHuntLiteralAddress(text) {
  const match = String(text || "").trim().match(/^(?:0x)?([0-9a-fA-F]+)$/);
  return match ? BigInt(`0x${match[1]}`) : null;
}

// lldb 地址表达式对寄存器算术是原生支持的(`$x1+16`), 在 -o 命令里直接写这种表达式让 lldb
// 自己在命令执行的那一刻求值 —— 这是唯一能在单趟批处理里"读一个只有运行时才知道的地址"的
// 办法(批处理命令是启动时就排好的静态列表, 没有分支/回读上一条命令输出再决定下一条参数的能力)。
function corruptHuntRegisterOffsetExpr(register, offset) {
  const n = Number(offset) || 0;
  return n >= 0 ? `$${register}+${n}` : `$${register}-${Math.abs(n)}`;
}

function corruptHuntEnvVarsCommand(env) {
  return lldbTargetEnvVarsCommand(env);
}

function corruptHuntLaunchCommand(args) {
  const quoted = (args || []).map(lldbArgQuote).join(" ");
  return quoted
    ? `process launch --stop-at-entry --no-stdio -- ${quoted}`
    : "process launch --stop-at-entry --no-stdio";
}

// memory read 的一行输出形如 "0x16fdecbf0: 0x6fdeccf0"。地址和值必须作为一个不可拆的
// 记录解析，调用方再验证地址就是本轮 H；不能只抽 value 后与另一轮 stop 拼接。
function parseLldbMemoryReadRecord(output) {
  const matches = [...String(output || "").matchAll(/^\s*(0x[0-9a-fA-F]+):\s*(0x[0-9a-fA-F]+)\s*$/gm)];
  if (matches.length !== 1) return null;
  return {address: toHexAddr(BigInt(matches[0][1])), value: matches[0][2]};
}

// binary/primaryObject 的 otool/nm 静态上下文, stage1 的断点地址解析和 stage1/stage2 的 pc
// 符号化共用同一份(不重复读文件/重复跑 nm)。没有 linker 产出的精确 provider 映射时，
// primary 之外的地址保持 providerUnresolved，绝不靠内容相似度猜测对象基址。
function buildChengCorruptHuntContext(binary, primaryObject) {
  const exeText = parseOtoolTextSection(binary);
  const primaryObjectExists = Boolean(primaryObject) && existsSync(primaryObject);
  const primaryText = primaryObjectExists ? parseOtoolTextSection(primaryObject) : null;
  const nmSymbols = primaryObjectExists ? nmTextSymbols(primaryObject) : [];
  return {
    binaryBase: basename(binary),
    primaryObject,
    primaryObjectExists,
    exeText,
    primaryText,
    nmSymbols,
    slide: 0,
  };
}

// breakSymbol 模式: nm -n primaryObject 里的符号值与该对象 __text.addr 同属 section 地址坐标，
// 必须先相减得到对象内偏移，再按 primary+provider 拼接约定映射到最终二进制 __text 起点：
// exeText.addr + (symbol.addr - primaryText.addr)。slide 按 0 处理(lldb 批处理默认
// target.disable-aslr=true, 已用
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
  if (!ctx.primaryText) throw new Error(`cheng_corrupt_hunt: 无法用 otool -l 读出 primaryObject 的 __text: ${input.primaryObject}`);
  const symbolHits = ctx.nmSymbols.filter((symbol) => symbol.name === input.breakSymbol);
  if (symbolHits.length === 0) throw new Error(`cheng_corrupt_hunt: breakSymbol '${input.breakSymbol}' 在 nm -n ${input.primaryObject} 里未找到`);
  if (symbolHits.length !== 1) throw new Error(`cheng_corrupt_hunt: breakSymbol '${input.breakSymbol}' 在 nm -n ${input.primaryObject} 里不唯一`);
  const hit = symbolHits[0];
  if (hit.addr < ctx.primaryText.addr || hit.addr >= ctx.primaryText.addr + ctx.primaryText.size) {
    throw new Error(`cheng_corrupt_hunt: breakSymbol '${input.breakSymbol}' 不在 primaryObject __TEXT,__text 区间内`);
  }
  return ctx.exeText.addr + (hit.addr - ctx.primaryText.addr);
}

// 阶段1: 固定地址断点必须在 --stop-at-entry 之后再下(案卷 docs/patches-form34-layerA-writer.md
// 已实证的技巧)。整段是单趟批处理: 用寄存器算术表达式(见 corruptHuntRegisterOffsetExpr)在断点
// 命中的那一刻直接读出 [H] 的初始值, 同时 `register read` 拿到基址寄存器的具体数值, 供 stage2
// 组装字面量地址用(stage2 是全新进程, watchpoint 的目标地址必须是字面量, 不能再用寄存器表达式)。
async function chengCorruptHuntStage1(input, ctx) {
  const breakAddr = resolveCorruptHuntBreakAddress(input, ctx);
  const breakAddrHex = toHexAddr(breakAddr);
  const breakpointSkip = input.breakpointSkip ?? 0;
  const watchExpr = corruptHuntRegisterOffsetExpr(input.watchRegister, input.watchOffset);
  const registerReadCmd = `register read ${input.watchRegister}`;
  const memReadCmd = `memory read -fx -s${input.watchSize} -c1 -- ${watchExpr}`;
  const breakpointModifyCmd = `breakpoint modify -i ${breakpointSkip}`;
  const breakpointListCmd = "breakpoint list";
  const aslrSetCommand = "settings set target.disable-aslr true";
  const aslrShowCommand = "settings show target.disable-aslr";
  const commands = [
    "settings set interpreter.prompt-on-quit false",
    aslrSetCommand,
    aslrShowCommand,
    corruptHuntEnvVarsCommand(input.env),
    corruptHuntLaunchCommand(input.args),
    `breakpoint set -a ${breakAddrHex}`,
    breakpointModifyCmd,
    "continue",
    breakpointListCmd,
    registerReadCmd,
    memReadCmd,
    `bt ${CHENG_FUSION_CORRUPT_HUNT_BT_DEPTH}`,
    "quit",
  ];
  const session = await runLldbOCommands(input.binary, commands, input.env, {
    timeoutMs: input.timeoutSec ? Math.round(input.timeoutSec * 1000) : undefined,
    maxBuffer: input.maxOutputBytes,
  });
  const text = session.output;
  const sessions = splitLldbSessions(text);
  assertCorruptHuntLldbSuccess(session, "stage1");
  const aslrShowSession = sessions.find((s) => s.command === aslrShowCommand);
  assertLldbAslrDisabled(aslrShowSession?.output, "cheng_corrupt_hunt stage1");
  const breakpointCommand = `breakpoint set -a ${breakAddrHex}`;
  const breakpointSession = sessions.find((s) => s.command === breakpointCommand);
  const breakpointIdMatch = breakpointSession?.output.match(/\bBreakpoint\s+(\d+)\s*:/);
  if (!breakpointIdMatch) {
    return {
      error: `cheng_corrupt_hunt stage1: 无法从 lldb 输出确认目标断点编号，拒绝按 continue 序号猜测命中: ${takeTrailingText(text, 2000)}`,
      breakAddrHex,
      breakpointSkip,
      observedBreakpointHits: 0,
      timedOut: Boolean(session.timedOut),
    };
  }
  const breakpointId = Number(breakpointIdMatch[1]);
  const modifySession = sessions.find((s) => s.command === breakpointModifyCmd);
  if (!modifySession || /(^|\n)error:/i.test(modifySession.output)) {
    return {
      error: `cheng_corrupt_hunt stage1: 无法给目标断点 ${breakpointId} 设置 ignore-count=${breakpointSkip}: ${takeTrailingText(modifySession?.output || text, 2000)}`,
      breakAddrHex,
      breakpointId,
      breakpointSkip,
      timedOut: false,
    };
  }
  const breakpointListSession = sessions.find((s) => s.command === breakpointListCmd);
  const hitCountMatch = breakpointListSession?.output.match(new RegExp(`^${breakpointId}:.*?hit count = (\\d+)`, "m"));
  const observedBreakpointHits = hitCountMatch ? Number(hitCountMatch[1]) : null;
  const continueSession = sessions.find((s) => s.command === "continue");
  const targetBreakpointPattern = new RegExp(`stop reason = breakpoint ${breakpointId}(?:\\.|\\b)`, "i");
  const hitBreakpoint = Boolean(continueSession) && targetBreakpointPattern.test(continueSession.output);
  if (!hitBreakpoint) {
    const stopReason = continueSession?.output.match(/stop reason = ([^\n]+)/i)?.[1]?.trim() || "目标进程未停住";
    return {
      error: `cheng_corrupt_hunt stage1: 只接受目标断点 ${breakpointId}(${breakAddrHex}) 在 ignore-count=${breakpointSkip} 后的命中，实得 stop reason=${stopReason}${observedBreakpointHits === null ? "" : `，目标断点实际命中 ${observedBreakpointHits} 次`}(进程提前退出、命中不足、信号或其他断点均不能冒充目标命中), raw tail: ${takeTrailingText(text, 2000)}`,
      breakAddrHex,
      breakpointId,
      breakpointSkip,
      observedBreakpointHits,
      timedOut: Boolean(session.timedOut),
    };
  }
  if (observedBreakpointHits === null || observedBreakpointHits !== breakpointSkip + 1) {
    return {
      error: `cheng_corrupt_hunt stage1: 目标断点 ${breakpointId} 已停住，但无法证明它是第 ${breakpointSkip + 1} 次命中(hit count=${observedBreakpointHits === null ? "unavailable" : observedBreakpointHits})，拒绝继续取证`,
      breakAddrHex,
      breakpointId,
      breakpointSkip,
      observedBreakpointHits,
      timedOut: false,
    };
  }
  const registerSession = sessions.find((s) => s.command === registerReadCmd);
  const registers = registerSession ? parseLldbRegisters(registerSession.output) : {};
  const registerValueHex = registers[input.watchRegister];
  if (!registerValueHex) {
    return {
      error: `cheng_corrupt_hunt stage1: 断点命中但读不到寄存器 ${input.watchRegister} 的值(寄存器名是否对这个架构合法?), raw tail: ${takeTrailingText(text, 2000)}`,
      breakAddrHex,
      breakpointId,
      breakpointSkip,
      observedBreakpointHits,
      timedOut: Boolean(session.timedOut),
    };
  }
  const H = BigInt(registerValueHex) + BigInt(input.watchOffset);
  if (H < 0n) {
    return {
      error: `cheng_corrupt_hunt stage1: ${input.watchRegister}+watchOffset 得到负地址 ${H.toString()}，拒绝读取`,
      breakAddrHex,
      breakpointId,
      breakpointSkip,
      observedBreakpointHits,
      timedOut: false,
    };
  }
  const memSession = sessions.find((s) => s.command === memReadCmd);
  const initialRead = memSession ? parseLldbMemoryReadRecord(memSession.output) : null;
  if (!initialRead || initialRead.address !== toHexAddr(H)) {
    return {
      error: `cheng_corrupt_hunt stage1: 目标断点 ${breakpointId} 命中，但 memory read ${toHexAddr(H)} ${initialRead ? `返回了其他地址 ${initialRead.address}` : "失败"}，不能把未配对值带入 stage2: ${takeTrailingText(memSession?.output || text, 2000)}`,
      breakAddrHex,
      breakpointId,
      breakpointSkip,
      observedBreakpointHits,
      registerValue: registerValueHex,
      Hhex: toHexAddr(H),
      timedOut: false,
    };
  }
  const btSession = sessions.find((s) => s.command === `bt ${CHENG_FUSION_CORRUPT_HUNT_BT_DEPTH}`);
  const bt = btSession ? parseLldbFrames(btSession.output).map((frame) => symbolizeFrame(frame, ctx)) : [];
  return {
    breakAddrHex,
    breakpointId,
    breakpointSkip,
    observedBreakpointHits,
    registerValue: registerValueHex,
    H,
    Hhex: toHexAddr(H),
    initialValue: initialRead.value,
    bt,
    lldbExitCode: session.exitCode,
    timedOut: Boolean(session.timedOut),
    overflow: Boolean(session.overflow),
  };
}

const CHENG_CORRUPT_HUNT_CAPABILITY_ERROR_RE = /(watchpoints? are not supported|hardware watchpoints? (are |is )?not supported|could not set variable|error: Watchpoint creation failed|unable to set (hardware )?watchpoint)/i;

// 阶段2: 全新 lldb 进程, 在阶段1 算出的字面量地址 H 上挂 write watchpoint。每一组
// (continue; memory read H; bt N) 必须严格对应同一个目标 watchpoint stop: 先从创建输出解析
// watchpoint id，再按原始命令顺序配对三段 session。信号、其他断点和读内存失败全部终止取证，
// 不能通过分别过滤 continue/memory/bt 后按数组下标拼接来伪造一次命中。
async function chengCorruptHuntStage2(input, ctx, H) {
  const Hhex = toHexAddr(H);
  const maxHits = input.maxHits || CHENG_FUSION_CORRUPT_HUNT_MAXHITS_DEFAULT;
  const memReadCmd = `memory read -fx -s${input.watchSize} -c1 -- ${Hhex}`;
  const btCmd = `bt ${CHENG_FUSION_CORRUPT_HUNT_BT_DEPTH}`;
  const watchpointCommand = `watchpoint set expression -w write -s ${input.watchSize} -- ${Hhex}`;
  const controller = createInteractiveLldbSession(input.binary, {
    timeoutMs: input.timeoutSec ? Math.round(input.timeoutSec * 1000) : undefined,
    maxBuffer: input.maxOutputBytes,
  });
  const hits = [];
  let watchpointId = null;
  let launchedPid = null;
  let processExit = null;
  let stageError = null;
  try {
    const promptOutput = await controller.execute("settings set interpreter.prompt-on-quit false");
    assertNoLldbCommandError(promptOutput, "stage2", "settings set interpreter.prompt-on-quit false");

    const inputPathCommand = "settings set target.input-path /dev/null";
    const inputPathOutput = await controller.execute(inputPathCommand);
    assertNoLldbCommandError(inputPathOutput, "stage2", inputPathCommand);

    const syncCommand = "script lldb.debugger.SetAsync(False); print('__CHENG_FUSION_LLDB_ASYNC__=' + str(lldb.debugger.GetAsync()))";
    const syncOutput = await controller.execute(syncCommand);
    assertNoLldbCommandError(syncOutput, "stage2", syncCommand);
    const syncProof = [...syncOutput.matchAll(/^__CHENG_FUSION_LLDB_ASYNC__=False\s*\r?$/gm)];
    if (syncProof.length !== 1) {
      throw new Error(`cheng_corrupt_hunt stage2: 无法证明 LLDB synchronous mode 已启用: ${takeTrailingText(syncOutput, 2000)}`);
    }

    const aslrSetCommand = "settings set target.disable-aslr true";
    const aslrSetOutput = await controller.execute(aslrSetCommand);
    assertNoLldbCommandError(aslrSetOutput, "stage2", aslrSetCommand);
    const aslrShowCommand = "settings show target.disable-aslr";
    const aslrShowOutput = await controller.execute(aslrShowCommand);
    assertNoLldbCommandError(aslrShowOutput, "stage2", aslrShowCommand);
    assertLldbAslrDisabled(aslrShowOutput, "cheng_corrupt_hunt stage2");

    const envCommand = corruptHuntEnvVarsCommand(input.env);
    const envOutput = await controller.execute(envCommand);
    assertNoLldbCommandError(envOutput, "stage2", envCommand);

    const launchCommand = corruptHuntLaunchCommand(input.args);
    const launchOutput = await controller.execute(launchCommand);
    assertNoLldbCommandError(launchOutput, "stage2", launchCommand);
    const launchMatches = [...launchOutput.matchAll(/^Process\s+([1-9]\d*)\s+launched:\s+.+$/gm)];
    if (launchMatches.length !== 1) {
      throw new Error(`cheng_corrupt_hunt stage2: 无法确认唯一 debuggee launch: ${takeTrailingText(launchOutput, 2000)}`);
    }
    launchedPid = Number(launchMatches[0][1]);

    const watchpointOutput = await controller.execute(watchpointCommand);
    const capabilityMatch = watchpointOutput.match(CHENG_CORRUPT_HUNT_CAPABILITY_ERROR_RE);
    if (capabilityMatch) throw new Error(`cheng_corrupt_hunt stage2: 无法创建硬件 watchpoint: ${capabilityMatch[0]}`);
    assertNoLldbCommandError(watchpointOutput, "stage2", watchpointCommand);
    const watchpointMatches = [...watchpointOutput.matchAll(/\bWatchpoint\s+(\d+)\s*:/gi)];
    if (watchpointMatches.length !== 1) {
      throw new Error(`cheng_corrupt_hunt stage2: 无法确认唯一目标 watchpoint 编号: ${takeTrailingText(watchpointOutput, 2000)}`);
    }
    watchpointId = Number(watchpointMatches[0][1]);
    const targetWatchpointReason = new RegExp(`^watchpoint ${watchpointId}(?:\\.|$)`, "i");

    for (let i = 0; i < maxHits; i++) {
      const continueOutput = await controller.continueUntilStop();
      assertNoLldbCommandError(continueOutput, "stage2", "continue");
      const exitMatches = [...continueOutput.matchAll(/^Process\s+([1-9]\d*)\s+exited with\s+(?:status\s*=\s*|code\s*=?\s*)(-?\d+)(?:\s+\(0x[0-9a-fA-F]+\))?\s*\r?$/gm)];
      const stopReasons = [...continueOutput.matchAll(/stop reason = ([^\r\n]+)/gi)].map((match) => match[1].trim());
      if (exitMatches.length === 1 && stopReasons.length === 0) {
        const exitPid = Number(exitMatches[0][1]);
        if (exitPid !== launchedPid) {
          throw new Error(`cheng_corrupt_hunt stage2: exit pid ${exitPid} 与 launch pid ${launchedPid} 不一致`);
        }
        processExit = {pid: exitPid, status: Number(exitMatches[0][2])};
        break;
      }
      if (exitMatches.length !== 0 || stopReasons.length !== 1 || !targetWatchpointReason.test(stopReasons[0])) {
        throw new Error(`cheng_corrupt_hunt stage2: 第 ${i + 1} 轮只接受目标 watchpoint ${watchpointId} 或精确的 Process ${launchedPid} exited with status/code，实得 stop=${stopReasons.join(" | ") || "none"}: ${takeTrailingText(continueOutput, 2000)}`);
      }

      const memoryOutput = await controller.execute(memReadCmd);
      assertNoLldbCommandError(memoryOutput, "stage2", memReadCmd);
      const memoryRead = parseLldbMemoryReadRecord(memoryOutput);
      if (!memoryRead || memoryRead.address !== Hhex) {
        throw new Error(`cheng_corrupt_hunt stage2: watchpoint ${watchpointId} 第 ${i + 1} 次命中后的 memory read 未唯一返回 ${Hhex}: ${takeTrailingText(memoryOutput, 2000)}`);
      }

      const btOutput = await controller.execute(btCmd);
      assertNoLldbCommandError(btOutput, "stage2", btCmd);
      const frames = parseLldbFrames(btOutput).map((frame) => symbolizeFrame(frame, ctx));
      const top = frames[0];
      if (!top) throw new Error(`cheng_corrupt_hunt stage2: watchpoint ${watchpointId} 第 ${i + 1} 次命中后 backtrace 为空`);
      hits.push({
        hit: hits.length,
        pc: top.pc,
        symbol: top.symbol,
        offset: top.offset,
        providerUnresolved: top.providerUnresolved,
        reason: top.reason,
        providerObject: top.providerObject,
        providerModule: top.providerModule,
        address: memoryRead.address,
        newValue: memoryRead.value,
        frames,
      });
    }
    if (hits.length === 0) {
      throw new Error(`cheng_corrupt_hunt stage2: 进程退出前未观察到目标 watchpoint ${watchpointId} 的任何命中`);
    }
  } catch (error) {
    stageError = error instanceof Error ? error : new Error(String(error));
  }

  const session = await controller.close();
  assertCorruptHuntLldbSuccess(session, "stage2");
  if (stageError) throw stageError;
  return {
    watchpointId,
    hits,
    Hhex,
    processExit,
    exhausted: hits.length >= maxHits,
    lldbExitCode: session.exitCode,
    timedOut: false,
    overflow: false,
  };
}

// cheng_corrupt_hunt: 两阶段 lldb watchpoint 写点定位。调用者输入在启动第一个
// debugger 前一次性复制到私有目录；后续的 lldb/otool/nm 只接触冻结副本。原路径在
// 运行中可以变化，但不能反过来改写本次取证的二进制证据。
async function chengCorruptHunt(input) {
  validateLldbDebuggeeEnv(input.env);
  const originalBinary = String(input.binary || "");
  const originalPrimaryObject = input.primaryObject === undefined ? null : String(input.primaryObject || "");
  if (!isAbsolute(originalBinary)) throw new Error(`cheng_corrupt_hunt binary must be an absolute path: ${originalBinary}`);
  if (originalPrimaryObject !== null && !isAbsolute(originalPrimaryObject)) {
    throw new Error(`cheng_corrupt_hunt primaryObject must be an absolute path: ${originalPrimaryObject}`);
  }
  const hasBreakAddr = typeof input.breakAddr === "string" && input.breakAddr.length > 0;
  const hasBreakSymbol = typeof input.breakSymbol === "string" && input.breakSymbol.length > 0;
  if (hasBreakAddr === hasBreakSymbol) throw new Error("cheng_corrupt_hunt: provide exactly one of breakAddr, or breakSymbol (with primaryObject)");
  if (hasBreakSymbol && !originalPrimaryObject) throw new Error("cheng_corrupt_hunt: breakSymbol requires primaryObject for nm resolution");
  let snapshotRoot = null;
  try {
    snapshotRoot = createCrashTriageSnapshotRoot();
    const binaryDir = join(snapshotRoot, "binary");
    const primaryDir = join(snapshotRoot, "primary");
    mkdirSync(binaryDir, {mode: 0o700});
    mkdirSync(primaryDir, {mode: 0o700});
    chmodSync(binaryDir, 0o700);
    chmodSync(primaryDir, 0o700);
    const total = {bytes: 0};
    const binarySource = resolve(originalBinary);
    const binarySnapshot = snapshotCrashTriageInput(
      binarySource, binarySource, join(binaryDir, basename(binarySource)),
      "cheng_corrupt_hunt binary", 0o700, total,
    );
    const primarySnapshot = originalPrimaryObject === null ? null : snapshotCrashTriageInput(
      resolve(originalPrimaryObject), resolve(originalPrimaryObject), join(primaryDir, basename(resolve(originalPrimaryObject))),
      "cheng_corrupt_hunt primaryObject", 0o600, total,
    );
    const frozenInput = {
      ...input,
      binary: binarySnapshot.destinationPath,
      ...(primarySnapshot ? {primaryObject: primarySnapshot.destinationPath} : {}),
    };
    const ctx = buildChengCorruptHuntContext(frozenInput.binary, frozenInput.primaryObject || null);
    const stage1 = await chengCorruptHuntStage1(frozenInput, ctx);
    if (stage1.error) throw new Error(stage1.error);
    verifyCrashTriageSnapshot(binarySnapshot, "cheng_corrupt_hunt binary");
    if (primarySnapshot) verifyCrashTriageSnapshot(primarySnapshot, "cheng_corrupt_hunt primaryObject");
    let stage2;
    try {
      stage2 = await chengCorruptHuntStage2(frozenInput, ctx, stage1.H);
    } finally {
      verifyCrashTriageSnapshot(binarySnapshot, "cheng_corrupt_hunt binary");
      if (primarySnapshot) verifyCrashTriageSnapshot(primarySnapshot, "cheng_corrupt_hunt primaryObject");
    }
    return {
      schema: "cheng_corrupt_hunt.v1",
      binary: binarySource,
      args: input.args || [],
      inputEvidence: {binary: publicCrashTriageInputEvidence(binarySnapshot), primaryObject: publicCrashTriageInputEvidence(primarySnapshot)},
      watchRegister: input.watchRegister,
      watchOffset: input.watchOffset,
      watchSize: input.watchSize,
      breakpointSkip: input.breakpointSkip ?? 0,
      stage1: {
        breakAddr: stage1.breakAddrHex,
        breakpointId: stage1.breakpointId,
        breakpointSkip: stage1.breakpointSkip,
        observedBreakpointHits: stage1.observedBreakpointHits,
        H: stage1.Hhex,
        initialValue: stage1.initialValue,
        registerValue: stage1.registerValue,
        bt: stage1.bt,
        lldbExitCode: stage1.lldbExitCode,
      },
      watchpointId: stage2.watchpointId ?? null,
      hits: stage2.hits,
      hitCount: stage2.hits.length,
      exhausted: stage2.exhausted,
      processExit: stage2.processExit,
      lldbExitCode: stage2.lldbExitCode,
      timedOut: Boolean(stage1.timedOut || stage2.timedOut),
    };
  } finally {
    if (snapshotRoot) rmSync(snapshotRoot, {recursive: true, force: true});
  }
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
    this.decoder = new JsonRpcFrameDecoder({framing: "content-length", label: `cheng-lsp ${command}`});
    this.publishedDiagnostics = new Map();
    this.dead = false;
    this.generation = 0;
    this.rootPath = null;
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
      this.stderr = takeTrailingText(this.stderr + chunk.toString("utf8"), 64 * 1024);
    });
    this.child.stdout.on("data", (chunk) => {
      if (this.dead) return;
      try {
        this.decoder.push(chunk, (message) => this.handleMessage(message));
      } catch (error) {
        this.fail(error, "SIGKILL");
      }
    });
    this.child.on("error", (error) => this.fail(error));
    this.child.stdin.on("error", (error) => this.fail(error, "SIGKILL"));
    this.child.on("exit", (code, signal) => {
      const error = new Error(`JSON-RPC process exited: code=${code} signal=${signal} stderr=${takeTrailingText(this.stderr, 1000)}`);
      this.fail(error);
    });
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  fail(error, killSignal = null) {
    if (this.cleanup) {
      process.off("exit", this.cleanup);
      this.cleanup = null;
    }
    if (this.dead) return;
    const failure = error instanceof Error ? error : new Error(String(error));
    this.dead = true;
    this.decoder.clear();
    if (killSignal) killChengProcessGroup(this.child, killSignal);
    this.rejectPending(failure);
    this.onDead?.(this, failure);
  }

  // 超时孤儿修复: kill 整个进程组(detached 时 child.pid 即 pgid), 不只是杀直接子进程,
  // 覆盖 driver 在 LSP 内部再 fork 出的孙进程情况.
  killTree(signal = "SIGKILL") {
    this.fail(new Error(`JSON-RPC process tree killed with ${signal}`), signal);
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
    if (this.dead || !this.child?.stdin?.writable) throw new Error(`cannot write to dead JSON-RPC process: ${this.command}`);
    const body = JSON.stringify(message);
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }

  request(method, params, timeoutMs) {
    if (this.dead) return Promise.reject(new Error(`cannot request from dead JSON-RPC process: ${this.command}`));
    const id = this.nextId++;
    const message = {jsonrpc: "2.0", id, method, params};
    const effectiveTimeoutMs = chengFusionTimeoutMs(timeoutMs === undefined ? CHENG_FUSION_LSP_TIMEOUT_MS_DEFAULT : timeoutMs);
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        // 超时孤儿修复: 不再只是 reject 掉 promise 留一个卡死的 cheng-lsp 子进程常驻;
        // 立即 kill 整个进程组并把 client 标记为 dead, 让 chengLspEnsureClient 下次换新进程.
        this.fail(new Error(`${method} timed out after ${effectiveTimeoutMs}ms; killed cheng-lsp process tree`), "SIGKILL");
      }, effectiveTimeoutMs);
      this.pending.set(id, {resolve: resolvePromise, reject, timer});
      try {
        this.sendEnvelope(message);
      } catch (error) {
        this.fail(error, "SIGKILL");
      }
    });
  }

  notify(method, params) {
    this.sendEnvelope({jsonrpc: "2.0", method, params});
  }

  close() {
    // JsonRpcProcessClient has no asynchronous close contract. Use an immediate group SIGKILL so
    // initialize failures, protocol failures and service shutdown cannot leave a resistant child
    // or grandchild behind after close() returns.
    this.fail(new Error(`JSON-RPC client closed: ${this.command}`), "SIGKILL");
  }
}

let chengLspClients = new Map();
let chengLspClientFlights = new Map();
let chengLspNextGeneration = 1;
let chengLspOpenDocs = new WeakMap();

function forgetChengLspClient(rootPath, client) {
  if (chengLspClients.get(rootPath) === client) chengLspClients.delete(rootPath);
  chengLspOpenDocs.delete(client);
}

async function chengLspEnsureClient(rootPath = resolveChengProjectRoot()) {
  rootPath = normalizeChengProjectRoot(rootPath);
  const existing = chengLspClients.get(rootPath);
  if (existing) {
    if (!existing.dead) return existing;
    forgetChengLspClient(rootPath, existing);
  }
  const inFlight = chengLspClientFlights.get(rootPath);
  if (inFlight) return inFlight;

  const flight = (async () => {
    const binary = chengLspResolveBinary();
    if (!existsSync(binary)) throw new Error(`cheng-lsp binary not found: ${binary}`);
    if (!Number.isSafeInteger(chengLspNextGeneration)) throw new Error("cheng-lsp client generation counter exhausted");
    const generation = chengLspNextGeneration++;
    const client = new JsonRpcProcessClient(binary, [], {cwd: rootPath});
    client.rootPath = rootPath;
    client.generation = generation;
    client.onDead = () => forgetChengLspClient(rootPath, client);
    try {
      client.start();
      const rootUri = pathToUri(rootPath);
      await client.request("initialize", {
        capabilities: {},
        processId: process.pid,
        rootUri,
        workspaceFolders: [{uri: rootUri, name: basename(rootPath) || "cheng"}],
      }, 20000);
      client.notify("initialized", {});
      if (client.dead) throw new Error(`cheng-lsp exited during initialize: ${binary}`);
      chengLspClients.set(rootPath, client);
      return client;
    } catch (error) {
      client.close();
      throw error;
    }
  })();
  chengLspClientFlights.set(rootPath, flight);
  try {
    return await flight;
  } finally {
    if (chengLspClientFlights.get(rootPath) === flight) chengLspClientFlights.delete(rootPath);
  }
}

async function chengLspSyncDoc(client, filePath, text) {
  if (!client || client.dead || !Number.isSafeInteger(client.generation) || client.generation <= 0) {
    throw new Error("chengLspSyncDoc requires a live initialized cheng-lsp client generation");
  }
  const uri = pathToUri(filePath);
  let openDocs = chengLspOpenDocs.get(client);
  if (!openDocs) {
    openDocs = new Map();
    chengLspOpenDocs.set(client, openDocs);
  }
  const tracked = openDocs.get(uri);
  if (!tracked || tracked.generation !== client.generation) {
    client.notify("textDocument/didOpen", {textDocument: {uri, languageId: "cheng", version: 1, text}});
    openDocs.set(uri, {generation: client.generation, version: 1, text});
    return uri;
  }
  if (tracked.text === text) return uri;
  const version = tracked.version + 1;
  client.notify("textDocument/didChange", {textDocument: {uri, version}, contentChanges: [{text}]});
  openDocs.set(uri, {generation: client.generation, version, text});
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

const CHENG_SYMBOLS_TARGET = "arm64-apple-darwin";
const CHENG_SYMBOLS_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

function parseCanonicalUnsignedInteger(value, field) {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`cheng_symbols_v1 ${field} must be a canonical unsigned integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`cheng_symbols_v1 ${field} exceeds Number.MAX_SAFE_INTEGER`);
  }
  return parsed;
}

function validateCountedSymbolList(value, count, field) {
  if (count === 0) {
    if (value !== "-") throw new Error(`cheng_symbols_v1 ${field} must be '-' when its count is zero`);
    return;
  }
  if (value === "-" || value.length === 0) {
    throw new Error(`cheng_symbols_v1 ${field} must contain ${count} symbols`);
  }
  const symbols = value.split(",");
  if (symbols.some((symbol) => symbol.length === 0) || symbols.length !== count) {
    throw new Error(`cheng_symbols_v1 ${field} count mismatch: expected ${count}, got ${symbols.length}`);
  }
}

function parseChengSymbolsReport(buffer, expected = {}) {
  if (!Buffer.isBuffer(buffer)) throw new Error("cheng_symbols_v1 stdout bytes are unavailable");
  let text;
  try {
    text = new TextDecoder("utf-8", {fatal: true}).decode(buffer);
  } catch {
    throw new Error("cheng_symbols_v1 output is not valid UTF-8");
  }
  if (!text.endsWith("\n")) throw new Error("cheng_symbols_v1 output must end with exactly one complete line");
  const lines = text.split("\n");
  lines.pop();
  if (lines[0] !== "cheng_symbols_v1") throw new Error("cheng_symbols_v1 exact header is missing");

  // The backend driver currently emits one separator line while stage3/cold emit none. These are
  // the two formal producer layouts; multiple separators and every other extra line are rejected.
  let offset = 1;
  if (lines[offset] === "") offset++;
  const fields = [
    "entry",
    "target",
    "source_path",
    "lowering_symbol_count",
    "lowering_symbols",
    "primary_symbol_count",
    "primary_symbols",
    "primary_unsupported_count",
  ];
  if (lines.length - offset !== fields.length) {
    throw new Error(`cheng_symbols_v1 must contain exactly ${fields.length} ordered fields`);
  }
  const values = {};
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    const prefix = `${field}=`;
    const line = lines[offset + index];
    if (!line.startsWith(prefix)) {
      throw new Error(`cheng_symbols_v1 expected ordered field ${field}`);
    }
    values[field] = line.slice(prefix.length);
  }

  if (values.entry !== expected.source || values.source_path !== expected.source) {
    throw new Error("cheng_symbols_v1 entry/source_path does not match the requested source");
  }
  if (values.target !== expected.target) {
    throw new Error(`cheng_symbols_v1 target mismatch: expected ${expected.target}`);
  }
  const loweringSymbolCount = parseCanonicalUnsignedInteger(values.lowering_symbol_count, "lowering_symbol_count");
  const primarySymbolCount = parseCanonicalUnsignedInteger(values.primary_symbol_count, "primary_symbol_count");
  const primaryUnsupportCount = parseCanonicalUnsignedInteger(values.primary_unsupported_count, "primary_unsupported_count");
  validateCountedSymbolList(values.lowering_symbols, loweringSymbolCount, "lowering_symbols");
  validateCountedSymbolList(values.primary_symbols, primarySymbolCount, "primary_symbols");
  if (primaryUnsupportCount > loweringSymbolCount) {
    throw new Error("cheng_symbols_v1 primary_unsupported_count exceeds lowering_symbol_count");
  }
  return {
    schema: "cheng_symbols_v1",
    primaryUnsupportCount,
    primarySymbolCount,
    loweringSymbolCount,
    primarySymbols: values.primary_symbols,
    loweringSymbols: values.lowering_symbols,
    byteLength: buffer.length,
    regression: primaryUnsupportCount > 0,
  };
}

async function snapshotChengSymbols(sourceRel, input = {}) {
  const root = resolveChengProjectRoot({root: input.root, file: sourceRel});
  const source = resolveChengPath(sourceRel, CHENG_CANARY, root);
  if (/[\r\n]/.test(source)) throw new Error("symbol snapshot source path cannot contain a line break");
  let sourceBefore;
  try {
    sourceBefore = lstatSync(source, {bigint: true});
  } catch (error) {
    throw new Error(`symbol snapshot source not found: ${source} (${error instanceof Error ? error.message : String(error)})`);
  }
  if (sourceBefore.isSymbolicLink() || !sourceBefore.isFile()) {
    throw new Error(`symbol snapshot source must be a regular non-symlink file: ${source}`);
  }
  const run = await runChengDriver(
    CHENG_DRIVER,
    ["print-symbols", `--root:${root}`, `--in:${source}`, `--target:${CHENG_SYMBOLS_TARGET}`, "--emit:obj"],
    {root, cwd: root, maxBuffer: CHENG_SYMBOLS_MAX_OUTPUT_BYTES},
  );
  if (run.missingDriver) throw new Error(`cheng driver not found: ${CHENG_DRIVER}`);
  if (run.timedOut) throw new Error("cheng print-symbols timed out");
  if (run.overflow) throw new Error(`cheng print-symbols output exceeded ${CHENG_SYMBOLS_MAX_OUTPUT_BYTES} bytes`);
  if (!Number.isInteger(run.exitCode)) throw new Error("cheng print-symbols produced no exit code");
  if (run.exitCode !== 0) {
    throw new Error(`cheng print-symbols exited ${run.exitCode}: ${takeTrailingText(run.stderr, 600)}`);
  }
  let sourceAfter;
  try {
    sourceAfter = lstatSync(source, {bigint: true});
  } catch {
    throw new Error(`symbol snapshot source disappeared while print-symbols was running: ${source}`);
  }
  if (sourceAfter.isSymbolicLink() || !sourceAfter.isFile() || stableFileStatKey(sourceBefore) !== stableFileStatKey(sourceAfter)) {
    throw new Error(`symbol snapshot source changed while print-symbols was running: ${source}`);
  }
  return {
    ...parseChengSymbolsReport(run.stdoutBuffer, {source, target: CHENG_SYMBOLS_TARGET}),
    root,
    source,
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

const PROFILE_PROTOCOL_UTF8_DECODER = new TextDecoder("utf-8", {fatal: true});
class ProfileProtocolUtf8Error extends Error {}

function profileSchemaFromOutputs(...values) {
  let found = false;
  for (const value of values) {
    if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
      throw new Error("profile protocol evidence must be raw process/file bytes");
    }
    let text;
    try {
      text = PROFILE_PROTOCOL_UTF8_DECODER.decode(value);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      throw new ProfileProtocolUtf8Error("profile protocol evidence is not valid UTF-8");
    }
    const lines = text.split(/\r?\n/);
    if (lines.some((line) => line === "cheng_profile_v1")) found = true;
  }
  return found ? "cheng_profile_v1" : null;
}

function profileResult(action, args, run, input = {}) {
  const outputInvalidUtf8 = Boolean(input.profileOutputInvalidUtf8);
  let processInvalidUtf8 = false;
  let profileSchema = null;
  try {
    profileSchema = profileSchemaFromOutputs(run.stdoutBuffer, run.stderrBuffer);
    if (!outputInvalidUtf8 && input.profileOutputBuffer !== undefined) {
      profileSchema ||= profileSchemaFromOutputs(input.profileOutputBuffer);
    }
    if (outputInvalidUtf8) profileSchema = null;
  } catch (error) {
    if (!(error instanceof ProfileProtocolUtf8Error)) throw error;
    processInvalidUtf8 = true;
    profileSchema = null;
  }
  const processOk = !run.missingDriver && !run.timedOut && !run.overflow && Number.isInteger(run.exitCode);
  const outputRequired = Boolean(input.profileOutputPath);
  const outputMaterialized = outputRequired ? input.profileOutputMaterialized === true : null;
  const outputOverflow = outputRequired && input.profileOutputOverflow === true;
  const reason = profileUnsupportedReason(run)
    || (run.missingDriver ? `cheng driver not found: ${run.driver || ""}`
      : run.timedOut ? "profile process timed out"
        : run.overflow ? "profile process output overflow"
          : !Number.isInteger(run.exitCode) ? "profile process produced no exit code"
            : run.exitCode !== 0 ? `exit ${run.exitCode}`
              : processInvalidUtf8 ? "profile process output is not valid UTF-8"
                : outputRequired && !outputMaterialized ? "profile-report returned rc=0 without a fresh non-empty regular output"
                  : outputOverflow ? "profile-report output exceeds maxOutputBytes"
                    : outputInvalidUtf8 ? "profile-report output is not valid UTF-8"
                      : !profileSchema ? "profile output missing exact cheng_profile_v1 schema marker line"
                        : null);
  const root = input.root || null;
  return {
    schema: "cheng_profile_report_tool.v1",
    action,
    driver: run.driver || "",
    root,
    command: ["cheng", ...args].join(" "),
    exitCode: run.exitCode,
    status: processOk && run.exitCode === 0 && !reason ? "completed" : "CFAIL",
    supported: processOk && run.exitCode === 0 && !reason,
    unsupportedReason: reason,
    profileSchema,
    timedOut: Boolean(run.timedOut),
    overflow: Boolean(run.overflow),
    output: outputRequired ? {
      path: input.profileOutputPath,
      materialized: outputMaterialized,
      bytes: Number.isInteger(input.profileOutputBytes) ? input.profileOutputBytes : null,
      overflow: outputOverflow,
      validUtf8: outputMaterialized && !outputOverflow ? !outputInvalidUtf8 : null,
      published: input.profileOutputPublished === true,
    } : null,
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

const MACHO_FILE_TYPE_NAMES = new Map([
  [1, "MH_OBJECT"],
  [2, "MH_EXECUTE"],
  [3, "MH_FVMLIB"],
  [4, "MH_CORE"],
  [5, "MH_PRELOAD"],
  [6, "MH_DYLIB"],
  [7, "MH_DYLINKER"],
  [8, "MH_BUNDLE"],
  [9, "MH_DYLIB_STUB"],
  [10, "MH_DSYM"],
  [11, "MH_KEXT_BUNDLE"],
  [12, "MH_FILESET"],
  [13, "MH_GPU_EXECUTE"],
]);

const MACHO_FAT_MAGICS = new Set([
  0xcafebabe,
  0xbebafeca,
  0xcafebabf,
  0xbfbafeca,
]);

// Caller relocation addresses are section-relative only in a thin MH_OBJECT. Reading the Mach-O
// header directly makes this invariant independent of otool's presentation and rejects universal
// binaries before nm can silently merge per-architecture symbol tables.
function requireThinMachOObject(objectPath) {
  const fd = openSync(objectPath, "r");
  const header = Buffer.alloc(16);
  let bytesRead;
  try {
    bytesRead = readSync(fd, header, 0, header.length, 0);
  } finally {
    closeSync(fd);
  }
  if (bytesRead < header.length) {
    throw new Error(`cheng_symbol_diff caller attribution requires a thin MH_OBJECT; file is too short for a Mach-O header: ${objectPath}`);
  }

  const magic = header.readUInt32BE(0);
  if (MACHO_FAT_MAGICS.has(magic)) {
    throw new Error(`cheng_symbol_diff caller attribution requires a thin MH_OBJECT; fat Mach-O is not supported: ${objectPath}`);
  }

  let fileType;
  if (magic === 0xfeedface || magic === 0xfeedfacf) {
    fileType = header.readUInt32BE(12);
  } else if (magic === 0xcefaedfe || magic === 0xcffaedfe) {
    fileType = header.readUInt32LE(12);
  } else {
    throw new Error(`cheng_symbol_diff caller attribution requires a thin MH_OBJECT; not a Mach-O file: ${objectPath}`);
  }
  if (fileType !== 1) {
    const name = MACHO_FILE_TYPE_NAMES.get(fileType) || `unknown filetype ${fileType}`;
    throw new Error(`cheng_symbol_diff caller attribution requires a thin MH_OBJECT; found ${name}: ${objectPath}`);
  }
  return {fileType: "MH_OBJECT"};
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

// Darwin nm -nP gives one stable, machine-readable row per symbol:
//   name type value size
// LLVM nm reports Mach-O sizes as zero, so text function ranges must be derived from sorted text
// symbol starts and the exact __TEXT,__text section end rather than from the unusable size column.
function nmMachOSymbolFacts(objectPath) {
  const result = runProbeTool("nm", ["-nP", objectPath], "nm");
  if (result.status !== 0) throw new Error(`nm -nP exited ${result.status}: ${takeTrailingText(result.stderr, 2000)}`);
  const undefinedNames = new Set();
  const definedGlobalTextNames = [];
  const textSymbols = [];
  for (const rawLine of result.stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const cols = line.split(/\s+/);
    if (cols.length < 2) continue;
    const [name, type] = cols;
    if (type === "U") {
      undefinedNames.add(name);
      continue;
    }
    if (type !== "T" && type !== "t") continue;
    if (cols.length < 3 || !/^[0-9a-fA-F]+$/.test(cols[2])) continue;
    if (type === "T") definedGlobalTextNames.push(name);
    textSymbols.push({name, type, address: BigInt(`0x${cols[2]}`)});
  }
  textSymbols.sort((a, b) => a.address < b.address ? -1 : a.address > b.address ? 1 : a.name.localeCompare(b.name));
  return {definedGlobalTextNames, undefinedNames: [...undefinedNames].sort(), textSymbols};
}

function machOTextSection(objectPath) {
  const result = runProbeTool("otool", ["-l", objectPath], "otool -l");
  if (result.status !== 0) throw new Error(`otool -l exited ${result.status}: ${takeTrailingText(result.stderr, 2000)}`);
  let inSection = false;
  let sectname = null;
  let segname = null;
  let address = null;
  let size = null;
  for (const rawLine of result.stdout.split("\n")) {
    const line = rawLine.trim();
    if (line === "Section") {
      inSection = true;
      sectname = null;
      segname = null;
      address = null;
      size = null;
      continue;
    }
    if (!inSection) continue;
    let match = line.match(/^sectname\s+(\S+)$/);
    if (match) {
      sectname = match[1];
      continue;
    }
    match = line.match(/^segname\s+(\S+)$/);
    if (match) {
      segname = match[1];
      continue;
    }
    match = line.match(/^addr\s+0x([0-9a-fA-F]+)$/);
    if (match) {
      address = BigInt(`0x${match[1]}`);
      continue;
    }
    match = line.match(/^size\s+0x([0-9a-fA-F]+)$/);
    if (!match) continue;
    size = BigInt(`0x${match[1]}`);
    if (sectname === "__text" && segname === "__TEXT" && address !== null) {
      return {segment: segname, section: sectname, address, size, end: address + size};
    }
  }
  throw new Error(`otool -l did not report a __TEXT,__text section: ${objectPath}`);
}

const MACHO_DIRECT_CALL_RELOCATION_TYPES = new Set([
  "BR26",
  "BRANCH",
  "ARM64_RELOC_BRANCH26",
  "X86_64_RELOC_BRANCH",
]);

// otool -rv prints both Darwin spellings used by the supported architectures:
// arm64 uses BR26, x86_64 uses BRANCH. The relocation address is section-relative in MH_OBJECT,
// so retain it verbatim and also compute the section-address-adjusted site used for range lookup.
function machODirectUndefinedCallRelocations(objectPath, undefinedNames, textSection) {
  const result = runProbeTool("otool", ["-rv", objectPath], "otool -rv");
  if (result.status !== 0) throw new Error(`otool -rv exited ${result.status}: ${takeTrailingText(result.stderr, 2000)}`);
  const undefinedSet = new Set(undefinedNames);
  const calls = [];
  let segment = null;
  let section = null;
  for (const rawLine of result.stdout.split("\n")) {
    const line = rawLine.trim();
    const header = line.match(/^Relocation information \(([^,]+),([^\)]+)\)\s+\d+ entries$/);
    if (header) {
      segment = header[1];
      section = header[2];
      continue;
    }
    if (segment !== textSection.segment || section !== textSection.section) continue;
    const cols = line.split(/\s+/);
    if (cols.length < 7 || !/^[0-9a-fA-F]+$/.test(cols[0])) continue;
    const relocationType = cols[4];
    if (cols[3] !== "True" || !MACHO_DIRECT_CALL_RELOCATION_TYPES.has(relocationType)) continue;
    const symbol = cols.slice(6).join(" ");
    if (!undefinedSet.has(symbol)) continue;
    const relocationAddress = BigInt(`0x${cols[0]}`);
    calls.push({
      symbol,
      segment,
      section,
      relocationAddress,
      siteAddress: textSection.address + relocationAddress,
      relocationType,
    });
  }
  return calls;
}

// Every global T and local t start is a real range boundary. Ownership is stricter: only one global
// T at that exact start may own the range. A local/static t can terminate the preceding function's
// range, but can never become an owner or inherit ownership from the preceding global function.
function machOTextFunctionRanges(textSymbols, textSection) {
  const groups = [];
  for (const symbol of textSymbols) {
    if (symbol.address < textSection.address || symbol.address >= textSection.end) continue;
    const last = groups[groups.length - 1];
    if (last && last.start === symbol.address) last.symbols.push(symbol);
    else groups.push({start: symbol.address, symbols: [symbol]});
  }
  return groups.map((group, index) => {
    const candidates = group.symbols.filter((symbol) => symbol.type === "T");
    const end = index + 1 < groups.length ? groups[index + 1].start : textSection.end;
    return {
      start: group.start,
      end,
      owner: candidates.length === 1 ? candidates[0].name : "unresolved-owner",
    };
  });
}

function formatMachOAddress(value) {
  return `0x${value.toString(16).padStart(16, "0")}`;
}

function findMachOTextFunctionRange(ranges, address) {
  let low = 0;
  let high = ranges.length - 1;
  let preceding = null;
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const candidate = ranges[middle];
    if (candidate.start <= address) {
      preceding = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return preceding && address < preceding.end ? preceding : null;
}

function attributeUndefinedCallRelocations(objectPath, nmFacts) {
  const textSection = machOTextSection(objectPath);
  const ranges = machOTextFunctionRanges(nmFacts.textSymbols, textSection);
  const calls = machODirectUndefinedCallRelocations(objectPath, nmFacts.undefinedNames, textSection);
  return calls.map((call) => {
    const range = findMachOTextFunctionRange(ranges, call.siteAddress);
    const resolved = Boolean(range && range.owner !== "unresolved-owner");
    return {
      symbol: call.symbol,
      owner: resolved ? range.owner : "unresolved-owner",
      ownerResolved: resolved,
      section: `${call.segment},${call.section}`,
      relocationAddress: formatMachOAddress(call.relocationAddress),
      siteAddress: formatMachOAddress(call.siteAddress),
      relocationType: call.relocationType,
      functionStart: resolved ? formatMachOAddress(range.start) : null,
      functionEndExclusive: resolved ? formatMachOAddress(range.end) : null,
    };
  }).sort((a, b) => a.symbol.localeCompare(b.symbol) || a.siteAddress.localeCompare(b.siteAddress));
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

// 两个 thin Mach-O MH_OBJECT(.o, 世代 A/B 任意组合)的符号集差分:
// - 原有已定义全局 T: onlyInA/onlyInB/common + 前缀聚类保持不变;
// - 未定义 U: undefinedOnlyInA/undefinedOnlyInB/undefinedCommon;
// - 每个真实直接调用 relocation: 用 section-relative relocation 地址落进 nm text 符号的半开区间。
// common 集合默认只报计数, includeCommon:true 才返回名字。所有 onlyIn 名字列表受 limit 封顶。
function compareChengBinarySymbols(objectAPath, objectBPath, options = {}) {
  requireThinMachOObject(objectAPath);
  requireThinMachOObject(objectBPath);
  const nmFactsA = nmMachOSymbolFacts(objectAPath);
  const nmFactsB = nmMachOSymbolFacts(objectBPath);
  const namesA = nmFactsA.definedGlobalTextNames;
  const namesB = nmFactsB.definedGlobalTextNames;
  const setA = new Set(namesA);
  const setB = new Set(namesB);
  const onlyInA = namesA.filter((name) => !setB.has(name)).sort();
  const onlyInB = namesB.filter((name) => !setA.has(name)).sort();
  const commonCount = namesA.reduce((count, name) => count + (setB.has(name) ? 1 : 0), 0);
  const undefinedSetA = new Set(nmFactsA.undefinedNames);
  const undefinedSetB = new Set(nmFactsB.undefinedNames);
  const undefinedOnlyInA = nmFactsA.undefinedNames.filter((name) => !undefinedSetB.has(name));
  const undefinedOnlyInB = nmFactsB.undefinedNames.filter((name) => !undefinedSetA.has(name));
  const undefinedCommon = nmFactsA.undefinedNames.filter((name) => undefinedSetB.has(name));
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
    countUndefinedA: nmFactsA.undefinedNames.length,
    countUndefinedB: nmFactsB.undefinedNames.length,
    countUndefinedOnlyInA: undefinedOnlyInA.length,
    countUndefinedOnlyInB: undefinedOnlyInB.length,
    countUndefinedCommon: undefinedCommon.length,
    undefinedA: nmFactsA.undefinedNames.slice(0, limit),
    undefinedB: nmFactsB.undefinedNames.slice(0, limit),
    undefinedATruncated: nmFactsA.undefinedNames.length > limit,
    undefinedBTruncated: nmFactsB.undefinedNames.length > limit,
    undefinedOnlyInA: undefinedOnlyInA.slice(0, limit),
    undefinedOnlyInB: undefinedOnlyInB.slice(0, limit),
    undefinedOnlyInATruncated: undefinedOnlyInA.length > limit,
    undefinedOnlyInBTruncated: undefinedOnlyInB.length > limit,
    undefinedCommon: options.includeCommon ? undefinedCommon.slice(0, limit) : undefined,
    undefinedCallersA: attributeUndefinedCallRelocations(objectAPath, nmFactsA),
    undefinedCallersB: attributeUndefinedCallRelocations(objectBPath, nmFactsB),
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
  JsonRpcProcessClient,
  chengLspEnsureClient,
  chengLspSyncDoc,
  chengLspEnsureDocOpen,
  parseCrash,
  classifyStopClass,
  triageChengBinaryCrash,
  chengCorruptHunt,
  readLineMap,
  snapshotChengSymbols,
  compareChengBinarySymbols,
  profileDriverForReport,
  profileDriverForRun,
  profileSchemaFromOutputs,
  profileResult,
  chengTemplateLeakAudit,
  zodToJsonSchema,
};
