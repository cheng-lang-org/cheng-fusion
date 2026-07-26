// @ts-nocheck
// cheng_driver_frontier_probe: "当前源码的 Cheng driver 到底能不能建出来, 建不出来的确切前沿签名是什么"
// 这一问的正典 ~53s 探针。2026-07-25 根线手跑了 5 遍同一个循环: 重编冷种 → system-link-exec →
// 肉眼 tail stderr 认签名; 每遍都要重新决定"种子要不要重编"(答案永远是: bootstrap/cheng_cold.c
// 的递归本地 include 闭包变了就必须重编, 否则测的是上一个世代的编译器)。这里把那个循环钉成一条工具:
//   种子身份 = bootstrap/cheng_cold.c 递归本地 include 闭包的内容 sha256(不是 mtime, 不是"我记得刚编过"),
//   种子文件名 = seed.<sha256 前16位>, 所以源一变哈希就变, 自动落到重编分支。
// 冷种编译口径与 cheng-lang 自己的 tools/build_backend_driver_clt.sh 一致: /usr/bin/cc -std=c11 -O2。
// 不重试, 不降级: cc 失败直接带真 stderr 抛; driver 失败照实报 rc + 前沿签名。
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import {createHash} from "node:crypto";
import {tmpdir} from "node:os";
import {dirname, isAbsolute, join, relative, resolve, sep} from "node:path";
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool, jsonResult, resolveChengPath, resolveChengProjectRoot, runChengDriver, takeTrailingText, initChengToolkitModule, zodSchema} from "./cheng_toolkit_m9000.ts";

var chengDriverFrontierProbeInputSchema, ChengDriverFrontierProbeTool;

const DRIVER_FRONTIER_PROBE_SCHEMA = "cheng_driver_frontier_probe";
const DRIVER_FRONTIER_DEFAULT_WORK_DIR = "/Users/lbcheng/cheng-patches/driver-frontier-probe";
const DRIVER_FRONTIER_DEFAULT_ENTRY = "src/core/tooling/backend_driver_dispatch_min.cheng";
const DRIVER_FRONTIER_DEFAULT_TARGET = "arm64-apple-darwin";
const DRIVER_FRONTIER_DEFAULT_TIMEOUT_SEC = 600;
const DRIVER_FRONTIER_COLD_SOURCE = "bootstrap/cheng_cold.c";
const DRIVER_FRONTIER_C_COMPILER = "/usr/bin/cc";
const DRIVER_FRONTIER_C_FLAGS = ["-std=c11", "-O2"];
const DRIVER_FRONTIER_SIGNATURE_MARKER = "cheng_cold:";
const DRIVER_FRONTIER_SIGNATURE_MAX_LINES = 8;
const DRIVER_FRONTIER_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const DRIVER_FRONTIER_MAX_SOURCE_BYTES = 256 * 1024 * 1024;
// bootstrap/cheng_cold.c 自己在 CHENG_PROCESS_MAX_RSS_BYTES 未设时 setenv 成 8589934592;
// fusion 的默认 1GiB 帽会让整编在中途被假 OOM 杀掉, 于是这里显式用冷种自身的同一个数。
const DRIVER_FRONTIER_RSS_CAP_BYTES = 8589934592;

function frontierProbeElapsedSec(startMs) {
  return Math.round((Date.now() - startMs)) / 1000;
}

function frontierProbeVolatileDirectories() {
  return [...new Set(["/tmp", "/private/tmp", resolve(tmpdir())])];
}

function frontierProbePathIsInside(path, directory) {
  return path === directory || path.startsWith(directory.endsWith(sep) ? directory : directory + sep);
}

// workDir 是这条探针的全部持久状态(种子 + exe + report), 必须是调用方自己的持久目录:
// 落 /tmp 会被系统清掉 → 每次都重编种子(~50s 白烧), 且事后没有可复查的前沿证据。
function resolveFrontierProbeWorkDir(value, root) {
  const text = String(value || DRIVER_FRONTIER_DEFAULT_WORK_DIR);
  if (!isAbsolute(text)) throw new Error(`workDir must be an absolute caller-owned persistent directory: ${text}`);
  const workDir = resolve(text);
  for (const volatileDirectory of frontierProbeVolatileDirectories()) {
    if (frontierProbePathIsInside(workDir, volatileDirectory)) {
      throw new Error(`workDir must be a caller-owned persistent directory, not a volatile temp directory (${volatileDirectory}): ${workDir}`);
    }
  }
  if (frontierProbePathIsInside(workDir, root)) {
    throw new Error(`workDir must be outside the Cheng source tree so the probe never writes into it: ${workDir} (root=${root})`);
  }
  return workDir;
}

function frontierProbeSignature(stderr) {
  const lines = String(stderr || "").split("\n").filter((line) => line.includes(DRIVER_FRONTIER_SIGNATURE_MARKER));
  return lines.slice(-DRIVER_FRONTIER_SIGNATURE_MAX_LINES);
}

function frontierProbeColdSourceClosure(root, coldSource) {
  const canonicalRoot = realpathSync(root);
  const rootPrefix = canonicalRoot.endsWith(sep) ? canonicalRoot : canonicalRoot + sep;
  const pending = [realpathSync(coldSource)];
  const visited = new Map();
  while (pending.length > 0) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    if (path !== canonicalRoot && !path.startsWith(rootPrefix)) {
      throw new Error(`cold compiler local include escapes Cheng root: ${path}`);
    }
    const bytes = readFileSync(path);
    const projectPath = relative(canonicalRoot, path);
    if (!projectPath || projectPath === ".." || projectPath.startsWith(`..${sep}`) || isAbsolute(projectPath)) {
      throw new Error(`cold compiler local include has no canonical project path: ${path}`);
    }
    visited.set(path, {
      path: projectPath.split(sep).join("/"),
      byteLength: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    const text = bytes.toString("utf8");
    const includePattern = /^\s*#\s*include\s*"([^"\r\n]+)"/gm;
    for (const match of text.matchAll(includePattern)) {
      const includePath = resolve(dirname(path), match[1]);
      if (!existsSync(includePath) || !statSync(includePath).isFile()) {
        throw new Error(`cold compiler local include is missing: ${projectPath} -> ${match[1]}`);
      }
      pending.push(realpathSync(includePath));
    }
  }
  const entries = [...visited.values()].sort((left, right) => left.path.localeCompare(right.path));
  const closureHash = createHash("sha256");
  closureHash.update("cheng.driver_frontier.seed_source_closure.v1\0");
  for (const entry of entries) {
    closureHash.update(entry.path);
    closureHash.update("\0");
    closureHash.update(String(entry.byteLength));
    closureHash.update("\0");
    closureHash.update(entry.sha256);
    closureHash.update("\0");
  }
  return {entries, sha256: closureHash.digest("hex")};
}

function frontierProbeCompareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function frontierProbeSameFileIdentity(left, right) {
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs;
}

// 闭包身份只消费内容 SHA-256；这里的 inode/time 只用于发现单次读取中的 TOCTOU，
// 绝不进入闭包哈希，也不允许用 mtime 冒充源码身份。
function frontierProbeStableSourceSnapshot(path, label) {
  if (!Number.isInteger(constants.O_NOFOLLOW)) throw new Error("O_NOFOLLOW is required for exact Cheng source snapshots");
  const before = lstatSync(path, {bigint: true});
  if (before.isSymbolicLink() || !before.isFile()) throw new Error(`${label} must be a regular non-symlink file: ${path}`);
  if (before.size > BigInt(DRIVER_FRONTIER_MAX_SOURCE_BYTES)) {
    throw new Error(`${label} exceeds ${DRIVER_FRONTIER_MAX_SOURCE_BYTES} bytes: ${path}`);
  }
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd, {bigint: true});
    if (!opened.isFile() || !frontierProbeSameFileIdentity(before, opened)) {
      throw new Error(`${label} changed before open: ${path}`);
    }
    const byteLength = Number(opened.size);
    const bytes = Buffer.allocUnsafe(byteLength);
    let offset = 0;
    while (offset < byteLength) {
      const count = readSync(fd, bytes, offset, Math.min(1024 * 1024, byteLength - offset), offset);
      if (count <= 0) throw new Error(`${label} truncated while reading: ${path}`);
      offset += count;
    }
    const afterFd = fstatSync(fd, {bigint: true});
    const afterPath = lstatSync(path, {bigint: true});
    if (afterPath.isSymbolicLink() || !afterPath.isFile() ||
        !frontierProbeSameFileIdentity(opened, afterFd) ||
        !frontierProbeSameFileIdentity(afterFd, afterPath)) {
      throw new Error(`${label} changed while reading: ${path}`);
    }
    return {
      bytes,
      byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } finally {
    closeSync(fd);
  }
}

function frontierProbeChengImports(projectPath, bytes) {
  let text;
  try {
    text = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
  } catch {
    throw new Error(`entry source closure contains invalid UTF-8: ${projectPath}`);
  }
  const imports = [];
  const single = /^import ([A-Za-z_][A-Za-z0-9_./]*)(?: as [A-Za-z_][A-Za-z0-9_]*)?$/;
  const grouped = /^import ([A-Za-z_][A-Za-z0-9_./]*)\/\[([^\]]+)\]$/;
  for (const [index, rawLine] of text.split("\n").entries()) {
    const line = rawLine.split("#", 1)[0].trim();
    if (!line.startsWith("import ")) continue;
    const group = line.match(grouped);
    if (group) {
      const members = group[2].split(",").map((value) => value.trim());
      if (members.length === 0 || members.some((value) => !/^[A-Za-z_][A-Za-z0-9_./]*$/.test(value))) {
        throw new Error(`unsupported group import in entry source closure: ${projectPath}:${index + 1}`);
      }
      for (const member of members) imports.push(`${group[1]}/${member}`);
      continue;
    }
    const match = line.match(single);
    if (!match) throw new Error(`unsupported import surface in entry source closure: ${projectPath}:${index + 1}`);
    imports.push(match[1]);
  }
  return imports;
}

function frontierProbeSourceModuleIndex(root) {
  const canonicalRoot = realpathSync(root);
  const sourceRoot = join(canonicalRoot, "src");
  const sourceRootStat = lstatSync(sourceRoot);
  if (sourceRootStat.isSymbolicLink() || !sourceRootStat.isDirectory() || realpathSync(sourceRoot) !== sourceRoot) {
    throw new Error(`Cheng source root must be a canonical non-symlink directory: ${sourceRoot}`);
  }
  const canonicalToPath = new Map();
  const aliases = new Map();
  const bindAlias = (alias, canonical) => {
    const prior = aliases.get(alias);
    if (prior !== undefined && prior !== canonical) {
      throw new Error(`ambiguous Cheng source module alias: ${alias} -> ${prior},${canonical}`);
    }
    aliases.set(alias, canonical);
  };
  const pending = [sourceRoot];
  while (pending.length > 0) {
    const directory = pending.pop();
    const children = readdirSync(directory, {withFileTypes: true})
      .sort((left, right) => frontierProbeCompareText(left.name, right.name));
    for (let index = children.length - 1; index >= 0; index--) {
      const child = children[index];
      const path = join(directory, child.name);
      if (child.isSymbolicLink()) throw new Error(`Cheng source tree contains a symlink: ${path}`);
      if (child.isDirectory()) {
        pending.push(path);
        continue;
      }
      if (!child.isFile() || !child.name.endsWith(".cheng")) continue;
      const projectPath = relative(canonicalRoot, path).split(sep).join("/");
      const canonical = projectPath.slice("src/".length, -".cheng".length);
      if (canonicalToPath.has(canonical)) throw new Error(`duplicate Cheng source module: ${canonical}`);
      canonicalToPath.set(canonical, path);
      bindAlias(canonical, canonical);
      bindAlias(`cheng/${canonical}`, canonical);
      bindAlias(`src/${canonical}`, canonical);
    }
  }
  return {canonicalRoot, sourceRoot, canonicalToPath, aliases};
}

function frontierProbeHashFrame(hash, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  hash.update(length);
  hash.update(bytes);
}

// 与正式 regalloc_source_manifest 相同的精确闭包模型：canonical module/path +
// 每个成员的字节 SHA-256 + 精确 from/to import edge。这里直接为 driver entry
// 计算内存回执，不制造另一份落盘 manifest 或 v2 工具。
function frontierProbeEntrySourceClosure(root, entryPath) {
  const index = frontierProbeSourceModuleIndex(root);
  const canonicalEntryPath = resolve(entryPath);
  if (realpathSync(canonicalEntryPath) !== canonicalEntryPath) {
    throw new Error(`driver entry source must be a canonical non-symlink path: ${canonicalEntryPath}`);
  }
  const entryProjectPath = relative(index.canonicalRoot, canonicalEntryPath).split(sep).join("/");
  if (!entryProjectPath.startsWith("src/") || !entryProjectPath.endsWith(".cheng")) {
    throw new Error(`driver entry source must be inside root/src: ${canonicalEntryPath}`);
  }
  const entryModule = entryProjectPath.slice("src/".length, -".cheng".length);
  if (index.canonicalToPath.get(entryModule) !== canonicalEntryPath) {
    throw new Error(`driver entry source is not an exact Cheng module: ${canonicalEntryPath}`);
  }

  const pending = [entryModule];
  const visited = new Set();
  const snapshots = new Map();
  const edgeKeys = new Set();
  while (pending.length > 0) {
    const module = pending.shift();
    if (visited.has(module)) continue;
    visited.add(module);
    const path = index.canonicalToPath.get(module);
    if (!path) throw new Error(`entry source closure lost module mapping: ${module}`);
    const projectPath = `src/${module}.cheng`;
    const snapshot = frontierProbeStableSourceSnapshot(path, `entry source closure member ${projectPath}`);
    snapshots.set(module, snapshot);
    for (const importedAlias of frontierProbeChengImports(projectPath, snapshot.bytes)) {
      const importedModule = index.aliases.get(importedAlias);
      if (importedModule === undefined) {
        throw new Error(`entry source closure has unresolved import: ${module} -> ${importedAlias}`);
      }
      edgeKeys.add(`${module}\0${importedModule}`);
      if (!visited.has(importedModule)) pending.push(importedModule);
    }
  }

  const modules = [...visited].sort(frontierProbeCompareText);
  const moduleIndex = new Map(modules.map((module, offset) => [module, offset]));
  const entries = modules.map((module) => {
    const snapshot = snapshots.get(module);
    return {
      module,
      path: `src/${module}.cheng`,
      byteLength: snapshot.byteLength,
      sha256: snapshot.sha256,
    };
  });
  const importEdges = [...edgeKeys].map((key) => {
    const [fromModule, toModule] = key.split("\0");
    return {
      from: moduleIndex.get(fromModule),
      to: moduleIndex.get(toModule),
      fromPath: `src/${fromModule}.cheng`,
      toPath: `src/${toModule}.cheng`,
    };
  }).sort((left, right) => left.from - right.from || left.to - right.to);

  // 读完所有边后再次按内容核对每个成员，禁止一次闭包捕获混入两个源码世代。
  for (const entry of entries) {
    const finalSnapshot = frontierProbeStableSourceSnapshot(
      index.canonicalToPath.get(entry.module),
      `entry source closure final member ${entry.path}`,
    );
    if (finalSnapshot.byteLength !== entry.byteLength || finalSnapshot.sha256 !== entry.sha256) {
      throw new Error(
        `entry source closure changed while capturing: ${entry.path} ` +
        `before=${entry.sha256} after=${finalSnapshot.sha256}`,
      );
    }
  }

  const closureHash = createHash("sha256");
  frontierProbeHashFrame(closureHash, "cheng.driver_frontier.entry_source_closure");
  frontierProbeHashFrame(closureHash, entryProjectPath);
  frontierProbeHashFrame(closureHash, entryModule);
  frontierProbeHashFrame(closureHash, String(entries.length));
  for (const entry of entries) {
    frontierProbeHashFrame(closureHash, entry.module);
    frontierProbeHashFrame(closureHash, entry.path);
    frontierProbeHashFrame(closureHash, String(entry.byteLength));
    frontierProbeHashFrame(closureHash, Buffer.from(entry.sha256, "hex"));
  }
  frontierProbeHashFrame(closureHash, String(importEdges.length));
  for (const edge of importEdges) {
    frontierProbeHashFrame(closureHash, String(edge.from));
    frontierProbeHashFrame(closureHash, String(edge.to));
  }
  return {
    entry: entryProjectPath,
    entryModule,
    entries,
    importEdges,
    sha256: closureHash.digest("hex"),
  };
}

function frontierProbeChangedClosurePaths(before, after) {
  const beforeByPath = new Map(before.entries.map((entry) => [entry.path, entry]));
  const afterByPath = new Map(after.entries.map((entry) => [entry.path, entry]));
  const paths = [...new Set([...beforeByPath.keys(), ...afterByPath.keys()])].sort();
  return paths.filter((path) => {
    const left = beforeByPath.get(path);
    const right = afterByPath.get(path);
    return left === undefined || right === undefined ||
      left.byteLength !== right.byteLength || left.sha256 !== right.sha256;
  });
}

function frontierProbeEntryClosureDifference(before, after) {
  const beforePaths = new Set(before.entries.map((entry) => entry.path));
  const afterPaths = new Set(after.entries.map((entry) => entry.path));
  const changed = frontierProbeChangedClosurePaths(before, after);
  const added = [...afterPaths].filter((path) => !beforePaths.has(path)).sort(frontierProbeCompareText);
  const removed = [...beforePaths].filter((path) => !afterPaths.has(path)).sort(frontierProbeCompareText);
  const edgeKey = (edge) => `${edge.fromPath}->${edge.toPath}`;
  const beforeEdges = new Set(before.importEdges.map(edgeKey));
  const afterEdges = new Set(after.importEdges.map(edgeKey));
  const addedEdges = [...afterEdges].filter((edge) => !beforeEdges.has(edge)).sort(frontierProbeCompareText);
  const removedEdges = [...beforeEdges].filter((edge) => !afterEdges.has(edge)).sort(frontierProbeCompareText);
  return {changed, added, removed, addedEdges, removedEdges};
}

function frontierProbeAssertStableColdSourceClosure(root, coldSource, before, phase) {
  const after = frontierProbeColdSourceClosure(root, coldSource);
  if (after.sha256 !== before.sha256) {
    const changedPaths = frontierProbeChangedClosurePaths(before, after);
    throw new Error(
      `cold compiler source closure drifted during ${phase}: ` +
      `before=${before.sha256} after=${after.sha256} changed=${changedPaths.join(",")}`,
    );
  }
  return after;
}

function frontierProbeAssertStableEntrySourceClosure(root, entryPath, before, phase) {
  let after;
  try {
    after = frontierProbeEntrySourceClosure(root, entryPath);
  } catch (error) {
    throw new Error(
      `driver frontier untrusted: entry source closure could not be captured during ${phase}: ` +
      `entrySourceClosureTrusted=false error=${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (after.sha256 !== before.sha256) {
    const difference = frontierProbeEntryClosureDifference(before, after);
    throw new Error(
      `driver frontier untrusted: entry source closure drifted during ${phase}: ` +
      `entrySourceClosureTrusted=false before=${before.sha256} after=${after.sha256} ` +
      `changed=${difference.changed.join(",")} added=${difference.added.join(",")} ` +
      `removed=${difference.removed.join(",")} addedEdges=${difference.addedEdges.join(",")} ` +
      `removedEdges=${difference.removedEdges.join(",")}`,
    );
  }
  return after;
}

function frontierProbeProcessFailure(label, run) {
  return `${label} failed: exitCode=${run.exitCode} missingBinary=${Boolean(run.missingDriver)} timedOut=${Boolean(run.timedOut)} overflow=${Boolean(run.overflow)}\nstderr:\n${takeTrailingText(run.stderr, 8000)}`;
}

// Opt-in pre-flight for live-development trees: wait until BOTH closures have been
// byte-and-edge identical for the whole quiet window before capturing the "before"
// snapshot. Default 0 keeps the original strict immediate-hard-fail behavior; this
// never downgrades mid-run drift detection (the pre/post asserts still hard-fail).
async function frontierProbeAwaitQuietClosure(root, coldSource, entryPath, quietSec) {
  const startedMs = Date.now();
  if (!Number.isFinite(quietSec) || quietSec <= 0) return {elapsedSec: 0, polls: 0};
  const deadlineMs = startedMs + Math.max(120, quietSec * 10) * 1000;
  let lastSignature = null;
  let stableSinceMs = 0;
  let polls = 0;
  for (;;) {
    const signature = frontierProbeColdSourceClosure(root, coldSource).sha256 + "|" + frontierProbeEntrySourceClosure(root, entryPath).sha256;
    polls += 1;
    const nowMs = Date.now();
    if (signature !== lastSignature) {
      lastSignature = signature;
      stableSinceMs = nowMs;
    } else if (nowMs - stableSinceMs >= quietSec * 1000) {
      return {elapsedSec: frontierProbeElapsedSec(startedMs), polls};
    }
    if (nowMs > deadlineMs) {
      throw new Error(
        `driver frontier: entry/cold source closures did not stay quiet for ${quietSec}s ` +
        `within ${Math.round((deadlineMs - startedMs) / 1000)}s (concurrent edits ongoing) — ` +
        `retry later, or rerun with a smaller waitQuietSeconds`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(2000, Math.max(250, quietSec * 250))));
  }
}

var initChengDriverFrontierProbeModule = defineModuleInitializer(() => {
  initChengToolkitModule();
  chengDriverFrontierProbeInputSchema = zodSchema.strictObject({
    root: zodSchema.string().optional().describe("Cheng project root to probe. Defaults to the active Cheng project root (/Users/lbcheng/cheng-lang)."),
    workDir: zodSchema.string().optional().describe(`Caller-owned persistent absolute directory holding the built seed, probe.exe and probe.report.txt. Volatile temp directories (/tmp, /private/tmp, $TMPDIR) and any path inside the source tree are rejected. Defaults to ${DRIVER_FRONTIER_DEFAULT_WORK_DIR}.`),
    entry: zodSchema.string().optional().describe(`Driver entry source, absolute or relative to root. Defaults to ${DRIVER_FRONTIER_DEFAULT_ENTRY}.`),
    target: zodSchema.string().optional().describe(`Backend target triple passed as --target:. Defaults to ${DRIVER_FRONTIER_DEFAULT_TARGET}.`),
    timeoutSec: zodSchema.number().positive().optional().describe(`Hard timeout in seconds for the cc build and for the driver build separately. Defaults to ${DRIVER_FRONTIER_DEFAULT_TIMEOUT_SEC}.`),
    reuseSeed: zodSchema.boolean().optional().describe("Reuse an existing seed whose filename carries the current recursive local-include source-closure hash. Default true. Any changed closure member forces a rebuild because the hash (and therefore the filename) changes."),
    waitQuietSeconds: zodSchema.number().nonnegative().optional().describe("Opt-in pre-flight for live-development trees: before capturing the trusted closure, wait until both closures have been byte-and-edge identical for this whole quiet window (default 0 = strict immediate hard-fail on any drift). Deadline is max(120s, 10x the window). Mid-run drift still hard-fails."),
  });
  ChengDriverFrontierProbeTool = createChengTextTool({
    name: "cheng_driver_frontier_probe",
    requiresChengProjectRoot: true,
    searchHint: "canonical ~53s probe: does the current-source Cheng driver build, and what is the exact frontier failure signature",
    inputSchema: chengDriverFrontierProbeInputSchema,
    description: "Answers 'does the current-source Cheng driver build, and if not what is the exact frontier failure signature?' in one deterministic ~53s run: hashes both the recursive local-include closure rooted at bootstrap/cheng_cold.c and the exact Cheng import closure rooted at entry (canonical module/path, member byte SHA-256 and exact import edges), builds or reuses the matching cold seed, verifies both closures immediately before and after system-link-exec, then returns driverRc/driverBuilds plus the verbatim trailing `cheng_cold:` stderr lines as frontierSignature. Any member, byte or import-edge drift hard-fails as an untrusted frontier and removes probe artifacts; it never returns a consumable frontier from mixed source generations, retries, or falls back.",
    prompt: "Use this instead of ad-hoc seed rebuild loops to track the ownership-convergence frontier. The tool binds the run to two exact content closures: the cold C seed include closure and the entry Cheng import closure. Both must remain byte-for-byte and edge-for-edge stable through seed selection and the driver run. Any drift returns only a hard error with entrySourceClosureTrusted=false, never frontierSignature or stale artifacts. Point workDir at a caller-owned persistent directory (never /tmp) so matching seeds are reused and evidence survives.",
    toAutoClassifierInput: (input) => `driver_frontier_probe:${input.entry || DRIVER_FRONTIER_DEFAULT_ENTRY}`,
    async execute(input) {
      const startedMs = Date.now();
      const root = resolveChengProjectRoot({root: input.root});
      const workDir = resolveFrontierProbeWorkDir(input.workDir, root);
      const entryPath = resolveChengPath(input.entry, DRIVER_FRONTIER_DEFAULT_ENTRY, root);
      if (!existsSync(entryPath)) throw new Error(`driver entry source not found: ${entryPath}`);
      const target = String(input.target || DRIVER_FRONTIER_DEFAULT_TARGET);
      if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(target)) throw new Error(`invalid target triple: ${target}`);
      const timeoutSec = input.timeoutSec === undefined ? DRIVER_FRONTIER_DEFAULT_TIMEOUT_SEC : Number(input.timeoutSec);
      if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) throw new Error(`timeoutSec must be a positive number: ${input.timeoutSec}`);
      const timeoutMs = Math.round(timeoutSec * 1000);
      const reuseSeed = input.reuseSeed === undefined ? true : Boolean(input.reuseSeed);
      const waitQuietSeconds = input.waitQuietSeconds === undefined ? 0 : Number(input.waitQuietSeconds);
      if (!Number.isFinite(waitQuietSeconds) || waitQuietSeconds < 0) throw new Error(`waitQuietSeconds must be a non-negative number: ${input.waitQuietSeconds}`);

      const coldSource = join(root, DRIVER_FRONTIER_COLD_SOURCE);
      if (!existsSync(coldSource)) throw new Error(`cold compiler source not found (not a Cheng bootstrap checkout): ${coldSource}`);
      const quietWait = await frontierProbeAwaitQuietClosure(root, coldSource, entryPath, waitQuietSeconds);
      const seedSourceClosure = frontierProbeColdSourceClosure(root, coldSource);
      const entrySourceClosure = frontierProbeEntrySourceClosure(root, entryPath);
      const seedSha256 = seedSourceClosure.sha256;
      const seedSha256Prefix = seedSha256.slice(0, 16);
      mkdirSync(workDir, {recursive: true});
      const seedPath = join(workDir, `seed.${seedSha256Prefix}`);
      const exePath = join(workDir, "probe.exe");
      const reportPath = join(workDir, "probe.report.txt");

      let seedRebuilt = false;
      let seedBuildRc = null;
      let seedBuildElapsedSec = null;
      if (!(reuseSeed && existsSync(seedPath))) {
        const seedStartedMs = Date.now();
        const build = await runChengDriver(DRIVER_FRONTIER_C_COMPILER, [...DRIVER_FRONTIER_C_FLAGS, coldSource, "-o", seedPath], {
          root, cwd: workDir, timeoutMs, maxBuffer: DRIVER_FRONTIER_MAX_OUTPUT_BYTES,
        });
        seedBuildElapsedSec = frontierProbeElapsedSec(seedStartedMs);
        seedBuildRc = build.exitCode;
        seedRebuilt = true;
        if (build.exitCode !== 0 || build.timedOut || build.overflow || !existsSync(seedPath)) {
          throw new Error(frontierProbeProcessFailure(`${DRIVER_FRONTIER_C_COMPILER} ${DRIVER_FRONTIER_C_FLAGS.join(" ")} ${coldSource}`, build));
        }
      }
      const preDriverClosureErrors = [];
      try {
        frontierProbeAssertStableColdSourceClosure(root, coldSource, seedSourceClosure, "seed build or reuse");
      } catch (error) {
        preDriverClosureErrors.push(error instanceof Error ? error.message : String(error));
      }
      try {
        frontierProbeAssertStableEntrySourceClosure(root, entryPath, entrySourceClosure, "seed build or reuse");
      } catch (error) {
        preDriverClosureErrors.push(error instanceof Error ? error.message : String(error));
      }
      if (preDriverClosureErrors.length > 0) throw new Error(preDriverClosureErrors.join("\n"));

      // 上一轮的 probe.exe / report 必须先删干净: 留着的话, 这一轮编译失败也会看到"exe 在",
      // 把陈旧产物读成 driverBuilds=true。
      rmSync(exePath, {force: true});
      rmSync(reportPath, {force: true});
      const driverStartedMs = Date.now();
      const driver = await runChengDriver(seedPath, [
        "system-link-exec",
        `--root:${root}`,
        `--in:${entryPath}`,
        "--emit:exe",
        `--target:${target}`,
        `--out:${exePath}`,
        `--report-out:${reportPath}`,
      ], {
        root, cwd: workDir, timeoutMs, maxBuffer: DRIVER_FRONTIER_MAX_OUTPUT_BYTES, hardRssCapBytes: DRIVER_FRONTIER_RSS_CAP_BYTES,
      });
      let seedSourceClosureAfterDriver;
      let entrySourceClosureAfterDriver;
      const postDriverClosureErrors = [];
      try {
        seedSourceClosureAfterDriver = frontierProbeAssertStableColdSourceClosure(
          root,
          coldSource,
          seedSourceClosure,
          "driver frontier run",
        );
      } catch (error) {
        postDriverClosureErrors.push(error instanceof Error ? error.message : String(error));
      }
      try {
        entrySourceClosureAfterDriver = frontierProbeAssertStableEntrySourceClosure(
          root,
          entryPath,
          entrySourceClosure,
          "driver frontier run",
        );
      } catch (error) {
        postDriverClosureErrors.push(error instanceof Error ? error.message : String(error));
      }
      if (postDriverClosureErrors.length > 0) {
        rmSync(exePath, {force: true});
        rmSync(reportPath, {force: true});
        throw new Error(postDriverClosureErrors.join("\n"));
      }
      const exeExists = existsSync(exePath);
      return jsonResult({
        schema: DRIVER_FRONTIER_PROBE_SCHEMA,
        root,
        workDir,
        entry: entryPath,
        target,
        coldSource,
        seedSourceClosure,
        seedSourceClosureAfterDriver,
        seedSourceClosureStable: true,
        entrySourceClosure,
        entrySourceClosureAfterDriver,
        entrySourceClosureStable: true,
        entrySourceClosureTrusted: true,
        seedPath,
        seedSha256Prefix,
        seedRebuilt,
        seedBuildRc,
        seedBuildElapsedSec,
        driverRc: driver.exitCode,
        driverBuilds: driver.exitCode === 0 && exeExists,
        frontierSignature: frontierProbeSignature(driver.stderr),
        exePath,
        exeExists,
        exeSizeBytes: exeExists ? statSync(exePath).size : null,
        reportPath,
        reportExists: existsSync(reportPath),
        driverTimedOut: Boolean(driver.timedOut),
        driverOverflow: Boolean(driver.overflow),
        driverElapsedSec: frontierProbeElapsedSec(driverStartedMs),
        waitQuietSeconds,
        quietWaitElapsedSec: quietWait.elapsedSec,
        quietWaitPolls: quietWait.polls,
        totalElapsedSec: frontierProbeElapsedSec(startedMs),
        stdoutTail: takeTrailingText(driver.stdout, 4000),
        stderrTail: takeTrailingText(driver.stderr, 8000),
      });
    },
  });
});

export {
  ChengDriverFrontierProbeTool,
  DRIVER_FRONTIER_PROBE_SCHEMA,
  DRIVER_FRONTIER_DEFAULT_ENTRY,
  DRIVER_FRONTIER_DEFAULT_TARGET,
  DRIVER_FRONTIER_DEFAULT_WORK_DIR,
  frontierProbeAwaitQuietClosure,
  frontierProbeSignature,
  frontierProbeAssertStableColdSourceClosure,
  frontierProbeAssertStableEntrySourceClosure,
  frontierProbeEntrySourceClosure,
  initChengDriverFrontierProbeModule,
  resolveFrontierProbeWorkDir,
};
