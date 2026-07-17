// @ts-nocheck
// cheng_shape_matrix: 金标 fixture 矩阵跑批器。把"点火确定性枚举纪律"手工循环
// (为每个 fixture 编译+运行+核对预期, 逐条口头汇报)产品化成一个工具: 读
// fixtures/ignition/matrix.json, 对每条 entry 用给定 driver 编译(system-link-exec
// --emit:exe --link-providers), 编译失败按 ZC_NOT_READY 摘要分类, 编译成功则运行
// 并核对 expectRc / expectStdout / golden(两种输出契约都逐字节精确比较, 绝不用 PATH 上的 diff)。
//
// 三组契约互斥, 同组的运行期检查可组合:
//   - expectCompileRc: 期望编译器精确返回指定退出码。
//   - expectCompileBail: 期望这条 fixture 以实证固定的 rc=2 和完整 ZC_NOT_READY
//     记录 + 唯一末尾 TOTAL 被诚实拒绝；idx 必须零基连续且每条 bail 都匹配。
//   - runtime: expectRc / expectStdout / golden(字节级) 至少一项, 可同时约束。
// 占位 entry 不是可执行契约；planned:true 与无契约 entry 都在首个 spawn 前 hard-fail。
import {createHash} from "node:crypto";
import {accessSync, chmodSync, closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdtempSync, openSync, readFileSync, readSync, realpathSync, rmSync, statSync, writeSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, isAbsolute, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool, jsonResult, runChengDriver, takeTrailingText, initChengToolkitModule, zodSchema} from "./cheng_toolkit_m9000.ts";

var chengShapeMatrixInputSchema, ChengShapeMatrixTool;

const CHENG_FUSION_PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MATRIX_PATH = join(CHENG_FUSION_PACKAGE_ROOT, "fixtures/ignition/matrix.json");
const DEFAULT_TIMEOUT_SEC = 300;
const DEFAULT_MAX_OUTPUT_BYTES = 1 << 30;
// Existing DRV78 evidence and checked-in ignition logs establish the diagnosed-rejection
// process contract: rc=2, zero-based idx=0..total-1, and one final TOTAL record.
const EXPECTED_COMPILE_BAIL_RC = 2;
const PROTOCOL_UNSIGNED_INTEGER = "(?:0|[1-9]\\d*)";
const PROTOCOL_POSITIVE_INTEGER = "[1-9]\\d*";
const PROTOCOL_SIGNED_INTEGER = "(?:0|-?[1-9]\\d*)";
const ZC_PROTOCOL_ENTRY_RE = new RegExp(`^ZC_NOT_READY idx=(${PROTOCOL_UNSIGNED_INTEGER})/(${PROTOCOL_POSITIVE_INTEGER}) function=(\\S+) body_kind=(\\S+) detail=(\\S*) line=(${PROTOCOL_UNSIGNED_INTEGER}) fz_kind=(\\S+) stmt_kind=(\\S+) bail=(${PROTOCOL_SIGNED_INTEGER}) slot_diag=(\\S*)$`);
const ZC_PROTOCOL_TOTAL_RE = new RegExp(`^ZC_NOT_READY_TOTAL count=(${PROTOCOL_POSITIVE_INTEGER})$`);
const STRICT_PROTOCOL_UTF8 = new TextDecoder("utf-8", {fatal: true});
const SNAPSHOT_CHUNK_BYTES = 1 << 20;
const MAX_DRIVER_BYTES = 512 * 1024 * 1024;
const MAX_MATRIX_BYTES = 8 * 1024 * 1024;
const MAX_FIXTURE_BYTES = 64 * 1024 * 1024;
const MAX_GOLDEN_BYTES = 64 * 1024 * 1024;
const MAX_MATRIX_ENTRIES = 4096;
const MAX_TOTAL_INPUT_BYTES = 1024 * 1024 * 1024;

function sameFileGeneration(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function stableSnapshot(sourcePath, snapshotPath, label, {executable = false, maxBytes, allowEmpty = false} = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error(`${label} snapshot size limit is invalid`);
  if (!Number.isInteger(constants.O_NOFOLLOW)) throw new Error(`${label} snapshot requires O_NOFOLLOW support`);
  let sourceFd = null;
  let snapshotFd = null;
  let completed = false;
  try {
    let pathBefore;
    try {
      pathBefore = lstatSync(sourcePath, {bigint: true});
    } catch (error) {
      if (error?.code === "ENOENT") throw new Error(`${label} not found: ${sourcePath}`);
      throw error;
    }
    if (pathBefore.isSymbolicLink() || !pathBefore.isFile()) throw new Error(`${label} must be a regular non-symlink file: ${sourcePath}`);
    if (!allowEmpty && pathBefore.size === 0n) throw new Error(`${label} is empty: ${sourcePath}`);
    if (pathBefore.size > BigInt(maxBytes)) throw new Error(`${label} exceeds ${maxBytes} byte snapshot limit: ${sourcePath}`);
    if (executable) {
      try { accessSync(sourcePath, constants.X_OK); } catch { throw new Error(`${label} is not executable: ${sourcePath}`); }
    }

    sourceFd = openSync(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW | (constants.O_CLOEXEC || 0));
    const openedBefore = fstatSync(sourceFd, {bigint: true});
    if (!openedBefore.isFile() || !sameFileGeneration(pathBefore, openedBefore)) throw new Error(`${label} changed while opening: ${sourcePath}`);
    if (executable && (openedBefore.mode & 0o111n) === 0n) throw new Error(`${label} has no executable mode bit: ${sourcePath}`);

    const snapshotMode = executable ? 0o700 : 0o600;
    snapshotFd = openSync(snapshotPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | (constants.O_CLOEXEC || 0), snapshotMode);
    const hash = createHash("sha256");
    const chunk = Buffer.allocUnsafe(SNAPSHOT_CHUNK_BYTES);
    let totalBytes = 0;
    while (true) {
      const count = readSync(sourceFd, chunk, 0, chunk.length, null);
      if (count === 0) break;
      totalBytes += count;
      if (totalBytes > maxBytes) throw new Error(`${label} exceeds ${maxBytes} byte snapshot limit while reading: ${sourcePath}`);
      hash.update(chunk.subarray(0, count));
      let offset = 0;
      while (offset < count) {
        const written = writeSync(snapshotFd, chunk, offset, count - offset);
        if (written <= 0) throw new Error(`${label} snapshot write made no progress: ${snapshotPath}`);
        offset += written;
      }
    }
    if (BigInt(totalBytes) !== openedBefore.size) throw new Error(`${label} size changed while snapshotting: ${sourcePath}`);
    fsyncSync(snapshotFd);

    const openedAfter = fstatSync(sourceFd, {bigint: true});
    let pathAfter;
    try {
      pathAfter = lstatSync(sourcePath, {bigint: true});
    } catch (error) {
      if (error?.code === "ENOENT") throw new Error(`${label} was removed while snapshotting: ${sourcePath}`);
      throw error;
    }
    if (pathAfter.isSymbolicLink() || !pathAfter.isFile()
      || !sameFileGeneration(openedBefore, openedAfter)
      || !sameFileGeneration(openedAfter, pathAfter)) {
      throw new Error(`${label} changed while snapshotting: ${sourcePath}`);
    }
    chmodSync(snapshotPath, snapshotMode);
    completed = true;
    return {
      originalPath: sourcePath,
      snapshotPath,
      bytes: totalBytes,
      sha256: `sha256:${hash.digest("hex")}`,
    };
  } finally {
    try {
      if (snapshotFd !== null) closeSync(snapshotFd);
    } finally {
      try {
        if (sourceFd !== null) closeSync(sourceFd);
      } finally {
        if (!completed) rmSync(snapshotPath, {force: true});
      }
    }
  }
}

function budgetedSnapshot(sourcePath, snapshotPath, label, options, budget) {
  const remaining = budget.limit - budget.used;
  if (remaining <= 0) throw new Error(`cheng_shape_matrix input snapshots exceed ${budget.limit} total bytes`);
  const snapshot = stableSnapshot(sourcePath, snapshotPath, label, {...options, maxBytes: Math.min(options.maxBytes, remaining)});
  budget.used += snapshot.bytes;
  return snapshot;
}

function resolveExistingAbsolutePath(value, label, {executable = false, directory = false, allowEmpty = false, rejectSymlink = false} = {}) {
  if (!value) throw new Error(`${label} is required`);
  const requested = String(value);
  if (!isAbsolute(requested)) throw new Error(`${label} must be an absolute path: ${requested}`);
  const resolved = resolve(requested);
  if (!existsSync(resolved)) throw new Error(`${label} not found: ${resolved}`);
  const requestedStat = lstatSync(resolved);
  if (rejectSymlink && requestedStat.isSymbolicLink()) throw new Error(`${label} must not be a symlink: ${resolved}`);
  const path = realpathSync.native(resolved);
  const stat = statSync(path);
  if (directory ? !stat.isDirectory() : !stat.isFile()) throw new Error(`${label} is not a ${directory ? "directory" : "file"}: ${path}`);
  if (!directory && !allowEmpty && stat.size === 0) throw new Error(`${label} is empty: ${path}`);
  if (executable) {
    try { accessSync(path, constants.X_OK); } catch { throw new Error(`${label} is not executable: ${path}`); }
  }
  return path;
}

function resolveMatrixPath(matrixPathInput) {
  const text = matrixPathInput ? String(matrixPathInput) : DEFAULT_MATRIX_PATH;
  return isAbsolute(text) ? resolve(text) : resolve(CHENG_FUSION_PACKAGE_ROOT, text);
}

function loadMatrix(matrixPath) {
  let bytes;
  try {
    bytes = readFileSync(matrixPath);
  } catch (error) {
    throw new Error(`cannot read matrix file: ${matrixPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  let raw;
  try {
    raw = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
  } catch (error) {
    throw new Error(`matrix file is not valid UTF-8: ${matrixPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`matrix file is not valid JSON: ${matrixPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || !Array.isArray(parsed.entries)) throw new Error(`matrix file missing entries[] array: ${matrixPath}`);
  if (parsed.entries.length > MAX_MATRIX_ENTRIES) throw new Error(`matrix entries[] exceeds ${MAX_MATRIX_ENTRIES} entry limit: ${matrixPath}`);
  validateMatrixContracts(parsed.entries, matrixPath);
  return parsed;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function validateMatrixContracts(entries, matrixPath) {
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`matrix entry[${index}] must be an object: ${matrixPath}`);
    }
    const label = typeof entry.name === "string" && entry.name ? entry.name : `entry[${index}]`;
    const hasCompileBail = hasOwn(entry, "expectCompileBail");
    const hasCompileRc = hasOwn(entry, "expectCompileRc");
    const runtimeKeys = ["expectRc", "expectStdout", "golden"].filter((key) => hasOwn(entry, key));

    if (hasOwn(entry, "planned") && typeof entry.planned !== "boolean") {
      throw new Error(`matrix entry ${label} planned must be a boolean`);
    }

    if (hasCompileBail && !Number.isInteger(entry.expectCompileBail)) {
      throw new Error(`matrix entry ${label} expectCompileBail must be an integer`);
    }
    if (hasCompileRc && !Number.isInteger(entry.expectCompileRc)) {
      throw new Error(`matrix entry ${label} expectCompileRc must be an integer`);
    }
    if (hasOwn(entry, "expectRc") && !Number.isInteger(entry.expectRc)) {
      throw new Error(`matrix entry ${label} expectRc must be an integer`);
    }
    if (hasOwn(entry, "expectStdout") && typeof entry.expectStdout !== "string") {
      throw new Error(`matrix entry ${label} expectStdout must be a string`);
    }
    if (hasOwn(entry, "golden") && typeof entry.golden !== "string") {
      throw new Error(`matrix entry ${label} golden must be a string`);
    }

    const contractGroups = [
      ...(hasCompileBail ? ["expectCompileBail"] : []),
      ...(hasCompileRc ? ["expectCompileRc"] : []),
      ...(runtimeKeys.length > 0 ? [`runtime(${runtimeKeys.join("+")})`] : []),
    ];
    if (entry.planned === true) throw new Error(`matrix entry ${label} is planned:true; executable matrices cannot contain placeholders`);
    if (contractGroups.length === 0) {
      throw new Error(`matrix entry ${label} has no contract; define exactly one of expectCompileBail, expectCompileRc, or runtime expectRc/expectStdout/golden`);
    }
    if (contractGroups.length > 1) {
      throw new Error(`matrix entry ${label} contract groups are mutually exclusive: ${contractGroups.join(", ")}`);
    }
  }
}

function resolveFixturePath(fixtureValue, matrixDir) {
  const text = String(fixtureValue);
  return resolve(isAbsolute(text) ? text : join(matrixDir, text));
}

function entryTags(entry) {
  return Array.isArray(entry.tags) ? entry.tags : [];
}

function matchesFilterTag(entry, filterTag) {
  if (!filterTag) return true;
  return entryTags(entry).includes(filterTag);
}

function preflightMatrixEntries(entries, matrixDir, snapshotDir, inputBudget) {
  const prepared = [];
  const names = new Set();
  const fixtureSnapshots = new Map();
  const goldenSnapshots = new Map();
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (typeof entry.name !== "string" || entry.name.length === 0) throw new Error(`matrix entry[${index}] requires a non-empty name`);
    if (names.has(entry.name)) throw new Error(`duplicate matrix entry name: ${entry.name}`);
    names.add(entry.name);
    if (hasOwn(entry, "tags")) {
      if (!Array.isArray(entry.tags) || entry.tags.some((tag) => typeof tag !== "string" || tag.length === 0)) {
        throw new Error(`matrix entry ${entry.name} tags must be an array of non-empty strings`);
      }
      if (new Set(entry.tags).size !== entry.tags.length) throw new Error(`matrix entry ${entry.name} tags must be unique`);
    }
    if (typeof entry.fixture !== "string" || entry.fixture.length === 0) throw new Error(`matrix entry ${entry.name} requires fixture`);
    const fixtureInput = resolveFixturePath(entry.fixture, matrixDir);
    if (!fixtureInput.endsWith(".cheng")) throw new Error(`matrix entry ${entry.name} fixture must be a .cheng file: ${fixtureInput}`);
    let fixtureSnapshot = fixtureSnapshots.get(fixtureInput);
    if (!fixtureSnapshot) {
      fixtureSnapshot = budgetedSnapshot(
        fixtureInput,
        join(snapshotDir, `fixture-${index}.cheng`),
        `matrix entry ${entry.name} fixture`,
        {maxBytes: MAX_FIXTURE_BYTES},
        inputBudget,
      );
      fixtureSnapshots.set(fixtureInput, fixtureSnapshot);
    }
    let goldenPath = null;
    let goldenBytes = null;
    let goldenEvidence = null;
    if (typeof entry.golden === "string") {
      goldenPath = resolveFixturePath(entry.golden, matrixDir);
      let goldenSnapshot = goldenSnapshots.get(goldenPath);
      if (!goldenSnapshot) {
        goldenSnapshot = budgetedSnapshot(
          goldenPath,
          join(snapshotDir, `golden-${index}.bin`),
          `matrix entry ${entry.name} golden`,
          {maxBytes: MAX_GOLDEN_BYTES, allowEmpty: true},
          inputBudget,
        );
        goldenSnapshots.set(goldenPath, goldenSnapshot);
      }
      // Snapshot the oracle before the first child process starts. A compiler/runner or a
      // concurrent build must not be able to rewrite the golden path and grade its own output.
      goldenBytes = readFileSync(goldenSnapshot.snapshotPath);
      goldenEvidence = {bytes: goldenSnapshot.bytes, sha256: goldenSnapshot.sha256};
    }
    prepared.push({
      ...entry,
      __matrixIndex: index,
      __fixturePath: fixtureSnapshot.snapshotPath,
      __fixtureOriginalPath: fixtureInput,
      __fixtureEvidence: {bytes: fixtureSnapshot.bytes, sha256: fixtureSnapshot.sha256},
      __goldenBytes: goldenBytes,
      __goldenEvidence: goldenEvidence,
    });
  }
  return prepared;
}

function selectPreparedEntries(entries, filterTag) {
  const selected = entries.filter((entry) => matchesFilterTag(entry, filterTag));
  if (selected.length === 0) throw new Error(`matrix filter selected no entries: ${filterTag || "<all>"}`);
  return selected;
}

function parseProtocolSafeInteger(token) {
  const value = Number(token);
  return Number.isSafeInteger(value) ? value : null;
}

// 编译拒绝只信任 raw stderr。stdout 是编译产物协议以外的通道，不能拿来证明 ZC wall。
function parseCompileBailProtocol(stderrBuffer) {
  const entries = [];
  const totals = [];
  const malformedLines = [];
  const protocolKinds = [];
  let observed = false;
  if (!Buffer.isBuffer(stderrBuffer)) {
    return {
      expectedExitCode: EXPECTED_COMPILE_BAIL_RC,
      observed: false,
      utf8Valid: false,
      protocolError: "raw stderr bytes are unavailable",
      totalLineCount: 0,
      declaredTotal: null,
      entryCount: 0,
      countMatches: false,
      indicesUnique: false,
      indicesContinuous: false,
      denominatorsMatch: false,
      totalIsFinal: false,
      malformedLines,
      complete: false,
      entries,
    };
  }
  let text;
  try {
    text = STRICT_PROTOCOL_UTF8.decode(stderrBuffer);
  } catch {
    return {
      expectedExitCode: EXPECTED_COMPILE_BAIL_RC,
      observed: false,
      utf8Valid: false,
      protocolError: "stderr is not valid UTF-8",
      totalLineCount: 0,
      declaredTotal: null,
      entryCount: 0,
      countMatches: false,
      indicesUnique: false,
      indicesContinuous: false,
      denominatorsMatch: false,
      totalIsFinal: false,
      malformedLines,
      complete: false,
      entries,
    };
  }
  for (const rawLine of text.split(/\r?\n/)) {
    if (!/^\s*ZC_NOT_READY/.test(rawLine)) continue;
    observed = true;
    let match = rawLine.match(ZC_PROTOCOL_ENTRY_RE);
    if (match) {
      const index = parseProtocolSafeInteger(match[1]);
      const total = parseProtocolSafeInteger(match[2]);
      const line = parseProtocolSafeInteger(match[6]);
      const bail = parseProtocolSafeInteger(match[9]);
      if (index === null || total === null || line === null || bail === null) {
        malformedLines.push(takeTrailingText(rawLine, 500));
        protocolKinds.push("malformed");
        continue;
      }
      entries.push({
        index,
        total,
        function: match[3],
        bodyKind: match[4],
        detail: match[5],
        line,
        fzKind: match[7],
        statementKind: match[8],
        bail,
        slotDiag: match[10],
      });
      protocolKinds.push("entry");
      continue;
    }
    match = rawLine.match(ZC_PROTOCOL_TOTAL_RE);
    if (match) {
      const total = parseProtocolSafeInteger(match[1]);
      if (total === null) {
        malformedLines.push(takeTrailingText(rawLine, 500));
        protocolKinds.push("malformed");
        continue;
      }
      totals.push(total);
      protocolKinds.push("total");
      continue;
    }
    malformedLines.push(takeTrailingText(rawLine, 500));
    protocolKinds.push("malformed");
  }
  const uniqueTotal = totals.length === 1;
  const declaredTotal = uniqueTotal ? totals[0] : null;
  const countMatches = Number.isInteger(declaredTotal) && declaredTotal > 0 && entries.length === declaredTotal;
  const indices = entries.map((entry) => entry.index);
  const indicesUnique = new Set(indices).size === indices.length;
  const indicesContinuous = countMatches && indicesUnique && indices.every((index) => index >= 0 && index < declaredTotal);
  const denominatorsMatch = countMatches && entries.every((entry) => entry.total === declaredTotal);
  const totalIsFinal = uniqueTotal && protocolKinds.at(-1) === "total";
  const complete = observed && malformedLines.length === 0 && uniqueTotal && countMatches && indicesContinuous && denominatorsMatch && totalIsFinal;
  return {
    expectedExitCode: EXPECTED_COMPILE_BAIL_RC,
    observed,
    utf8Valid: true,
    protocolError: null,
    totalLineCount: totals.length,
    declaredTotal,
    entryCount: entries.length,
    countMatches,
    indicesUnique,
    indicesContinuous,
    denominatorsMatch,
    totalIsFinal,
    malformedLines,
    complete,
    entries,
  };
}

function summarizeBails(notReady) {
  return notReady.entries.map((e) => ({function: e.function, bodyKind: e.bodyKind, bail: e.bail}));
}

function processOk(run) {
  return !run.missingDriver && !run.timedOut && !run.overflow && Number.isInteger(run.exitCode);
}

function inspectExecutableArtifact(path) {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size === 0) {
      return {present: true, executable: false};
    }
    try {
      accessSync(path, constants.X_OK);
      return {present: true, executable: true};
    } catch {
      return {present: true, executable: false};
    }
  } catch (error) {
    if (error && error.code === "ENOENT") return {present: false, executable: false};
    throw error;
  }
}

function materializationOk(exitCode, artifact) {
  if (!Number.isInteger(exitCode)) return false;
  // outPath is born inside a fresh private temp directory. Therefore any path left behind by a
  // nonzero compiler exit is a contradictory partial artifact, including symlinks, empty files,
  // non-executable regular files, and directories.
  return exitCode === 0 ? artifact.executable : !artifact.present;
}

async function compileEntryFixture(driver, fixturePath, root, outPath, timeoutMs, maxBuffer) {
  const args = ["system-link-exec", `--root:${root}`, `--in:${fixturePath}`, "--emit:exe", "--link-providers", "--target:arm64-apple-darwin", `--out:${outPath}`];
  // 这两个开关必须从 driver 子进程环境移除，空字符串仍是“已设置”。
  // 与 cheng_exec_diff 同一纪律: 差分/矩阵跑批必须在两侧一致的
  // "默认 handoff + 默认 pure-providers 门"下比较, 不被父进程残留环境污染。
  const run = await runChengDriver(driver, args, {root, cwd: root, timeoutMs, maxBuffer, unsetEnv: ["CHENG_NO_BACKEND_DRIVER_HANDOFF", "CHENG_REQUIRE_PURE_PROVIDERS"]});
  // 原始 stdout/stderr buffer 是不可枚举证据，不能用 spread 包装后丢失。
  return Object.assign(run, {args});
}

async function runOneEntry(entry, driver, root, timeoutMs, maxBuffer) {
  const tags = entryTags(entry);
  const base = {
    name: entry.name,
    tags,
    fixture: entry.__fixtureOriginalPath,
    fixtureEvidence: entry.__fixtureEvidence,
    ...(entry.__goldenEvidence ? {goldenEvidence: entry.__goldenEvidence} : {}),
  };

  const fixturePath = entry.__fixturePath;

  const tempDir = mkdtempSync(join(tmpdir(), "cheng-shape-matrix-"));
  try {
    const outPath = join(tempDir, `entry-${entry.__matrixIndex}.exe`);
    const compile = await compileEntryFixture(driver, fixturePath, root, outPath, timeoutMs, maxBuffer);
    const compileProtocol = parseCompileBailProtocol(compile.stderrBuffer);
    const notReady = {
      entries: compileProtocol.entries.map((record) => ({function: record.function, bodyKind: record.bodyKind, bail: record.bail})),
      total: compileProtocol.declaredTotal ?? compileProtocol.entries.length,
    };
    const compileProcessOk = processOk(compile);
    const artifact = inspectExecutableArtifact(outPath);
    const materialized = artifact.executable;
    const artifactPresent = artifact.present;
    const compileMaterializationOk = materializationOk(compile.exitCode, artifact);
    const compiledOk = compileProcessOk && compile.exitCode === 0 && compileMaterializationOk;
    const zcTotal = notReady.total;
    const bails = summarizeBails(notReady);

    if (typeof entry.expectCompileBail === "number") {
      const protocol = compileProtocol;
      const exitCodeMatch = compile.exitCode === EXPECTED_COMPILE_BAIL_RC;
      const targetBailsMatch = protocol.entries.length > 0 && protocol.entries.every((record) => record.bail === entry.expectCompileBail);
      const bailObserved = targetBailsMatch;
      const compileBailMatch = compileProcessOk && compileMaterializationOk && exitCodeMatch && protocol.complete && targetBailsMatch;
      const checks = {
        processOk: compileProcessOk,
        materialized,
        artifactPresent,
        materializationOk: compileMaterializationOk,
        exitCodeMatch,
        protocolUtf8Valid: protocol.utf8Valid,
        protocolComplete: protocol.complete,
        targetBailsMatch,
        bailObserved,
        compileBailMatch,
      };
      const contractResult = {
        ...base,
        rc: compile.exitCode,
        expect: {expectCompileBail: entry.expectCompileBail, expectCompileRc: EXPECTED_COMPILE_BAIL_RC},
        checks,
        zcTotal: protocol.declaredTotal,
        bails: protocol.entries.map((record) => ({function: record.function, bodyKind: record.bodyKind, bail: record.bail})),
        compileBailProtocol: protocol,
        compileTimedOut: Boolean(compile.timedOut),
        compileOverflow: Boolean(compile.overflow),
      };
      if (!compileProcessOk) {
        const reason = compile.timedOut ? "compile timed out" : compile.overflow ? "compile output overflow" : compile.missingDriver ? "driver missing" : "compiler process produced no exit code";
        return {...contractResult, status: "CFAIL", note: `${reason}; expectCompileBail=${entry.expectCompileBail} was not observable`, compileStderrTail: takeTrailingText(compile.stderr, 1500)};
      }
      if (!compileMaterializationOk) {
        const note = compile.exitCode === 0
          ? "compiler returned rc=0 but did not materialize a non-empty executable"
          : "compiler returned a nonzero rc but left an output artifact";
        return {...contractResult, status: "CFAIL", note, compileStderrTail: takeTrailingText(compile.stderr, 1500)};
      }
      if (!protocol.utf8Valid) {
        return {...contractResult, status: "CFAIL", note: `compile stderr is not usable for a formal ZC protocol: ${protocol.protocolError}`, compileStderrTail: takeTrailingText(compile.stderr, 1500)};
      }
      if (compileBailMatch) {
        return {...contractResult, status: "GREEN", note: "complete diagnosed-rejection protocol matches the contracted exit code and bail"};
      }
      if (compile.exitCode === 0) {
        return {...contractResult, status: "RED", note: "contract expected a compile-time bail, but this fixture now compiles clean — matrix.json is stale, update the contract"};
      }
      return {
        ...contractResult,
        status: "RED",
        note: `compile rejection protocol mismatch: expected rc=${EXPECTED_COMPILE_BAIL_RC}, one final TOTAL, unique idx=0..TOTAL-1, and every bail=${entry.expectCompileBail}`,
        compileStderrTail: takeTrailingText(compile.stderr, 1500),
      };
    }

    if (typeof entry.expectCompileRc === "number") {
      const expectCompileRc = entry.expectCompileRc;
      const compileRcMatch = compileProcessOk && compile.exitCode === expectCompileRc;
      const contractResult = {
        ...base,
        rc: compile.exitCode,
        expect: {expectCompileRc},
        checks: {processOk: compileProcessOk, artifactPresent, materialized, materializationOk: compileMaterializationOk, compileRcMatch},
        zcTotal,
        bails,
        compileTimedOut: Boolean(compile.timedOut),
        compileOverflow: Boolean(compile.overflow),
      };
      if (!compileProcessOk) {
        const reason = compile.missingDriver ? "driver missing" : compile.timedOut ? "compile timed out" : compile.overflow ? "compile output overflow" : "compiler process produced no exit code";
        return {...contractResult, status: "CFAIL", note: `${reason}; expectCompileRc=${expectCompileRc} was not observable`, compileStderrTail: takeTrailingText(compile.stderr, 1500)};
      }
      if (!compileMaterializationOk) {
        const note = compile.exitCode === 0
          ? "compiler returned rc=0 but did not materialize a non-empty executable"
          : `compiler returned nonzero rc=${compile.exitCode} but left an output artifact`;
        return {...contractResult, status: "CFAIL", note, compileStderrTail: takeTrailingText(compile.stderr, 1500)};
      }
      if (compileRcMatch) {
        return {...contractResult, status: "GREEN", note: `compile rc matches contracted expectation: ${expectCompileRc}`};
      }
      const mismatch = compile.exitCode === 0
        ? `unexpected compile success: expected rc=${expectCompileRc}, got rc=0`
        : `compile rc contract mismatch: expected rc=${expectCompileRc}, got rc=${compile.exitCode}`;
      return {...contractResult, status: "RED", note: mismatch, compileStderrTail: takeTrailingText(compile.stderr, 1500)};
    }

    if (!compiledOk) {
      const note = !compileProcessOk
        ? (compile.timedOut ? "compile timed out" : compile.overflow ? "compile output overflow" : compile.missingDriver ? "driver missing" : "compiler process produced no exit code")
        : compile.exitCode === 0 ? "compiler returned rc=0 but did not materialize a non-empty executable" : "compile failed";
      return {...base, status: "CFAIL", rc: compile.exitCode, expect: {expectRc: entry.expectRc ?? null, expectStdout: entry.expectStdout ?? null, golden: entry.golden ?? null}, checks: {processOk: compileProcessOk, artifactPresent, materialized, materializationOk: compileMaterializationOk}, zcTotal, bails, compileTimedOut: Boolean(compile.timedOut), compileOverflow: Boolean(compile.overflow), note, compileStderrTail: takeTrailingText(compile.stderr, 1500)};
    }

    const runResult = await runChengDriver(outPath, [], {root, cwd: root, timeoutMs, maxBuffer, unsetEnv: ["CHENG_NO_BACKEND_DRIVER_HANDOFF", "CHENG_REQUIRE_PURE_PROVIDERS"]});
    const stdoutRaw = runResult.stdout || "";
    const runProcessOk = processOk(runResult);
    const checks = {processOk: runProcessOk, artifactPresent, materialized, materializationOk: compileMaterializationOk};
    let allPass = runProcessOk;

    if (typeof entry.expectRc === "number") {
      checks.rcMatch = runResult.exitCode === entry.expectRc;
      allPass = allPass && checks.rcMatch;
    }
    if (typeof entry.expectStdout === "string") {
      if (!Buffer.isBuffer(runResult.stdoutBuffer)) {
        throw new Error("Cheng process runner did not preserve raw stdout bytes for expectStdout comparison");
      }
      checks.stdoutMatch = runResult.stdoutBuffer.equals(Buffer.from(entry.expectStdout, "utf8"));
      allPass = allPass && checks.stdoutMatch;
    }
    if (typeof entry.golden === "string") {
      const goldenBuf = entry.__goldenBytes;
      if (!Buffer.isBuffer(goldenBuf)) {
        throw new Error(`matrix entry ${entry.name} golden snapshot is missing`);
      }
      if (!Buffer.isBuffer(runResult.stdoutBuffer)) {
        throw new Error("Cheng process runner did not preserve raw stdout bytes for golden comparison");
      }
      const actualBuf = runResult.stdoutBuffer;
      checks.goldenMatch = goldenBuf.equals(actualBuf);
      allPass = allPass && checks.goldenMatch;
    }

    return {
      ...base,
      status: allPass ? "GREEN" : "RED",
      rc: runResult.exitCode,
      expect: {expectRc: entry.expectRc ?? null, expectStdout: entry.expectStdout ?? null, golden: entry.golden ?? null},
      checks,
      zcTotal,
      stdoutTail: takeTrailingText(stdoutRaw, 500),
      timedOut: Boolean(runResult.timedOut),
      overflow: Boolean(runResult.overflow),
    };
  } finally {
    rmSync(tempDir, {recursive: true, force: true});
  }
}

var initChengShapeMatrixModule = defineModuleInitializer(() => {
  initChengToolkitModule();
  chengShapeMatrixInputSchema = zodSchema.strictObject({
    driver: zodSchema.string().describe("Absolute path to the Cheng driver binary used to compile+run every matrix entry."),
    matrixPath: zodSchema.string().optional().describe("Path to the matrix JSON file. Absolute, or relative to the cheng-fusion package root. Defaults to fixtures/ignition/matrix.json."),
    root: zodSchema.string().optional().describe("Cheng project root passed to --root:. Overrides the matrix file's defaultRoot."),
    filterTag: zodSchema.string().optional().describe("If set, only run entries whose tags[] includes this exact tag."),
    timeoutSec: zodSchema.number().positive().optional().describe("Per-process (compile or run) timeout in seconds, applied per matrix entry. Default 300."),
    maxOutputBytes: zodSchema.number().int().positive().max(DEFAULT_MAX_OUTPUT_BYTES).optional().describe("Maximum combined stdout+stderr bytes per compile or run process. Hard cap and default are 1 GiB; overflow kills the process group and cannot satisfy a contract."),
  });
  ChengShapeMatrixTool = createChengTextTool({
    name: "cheng_shape_matrix",
    searchHint: "run the golden ignition fixture matrix against a Cheng driver and report GREEN/RED/CFAIL per entry",
    inputSchema: chengShapeMatrixInputSchema,
    description: "Compiles and runs every selected entry in the golden ignition fixture matrix (fixtures/ignition/matrix.json) under one Cheng driver. The entire matrix is structurally and filesystem-preflighted before filtering or spawning. Runtime expectStdout and golden contracts compare original stdout bytes exactly. expectCompileBail requires raw stderr to be strict UTF-8 and contain the evidenced rc=2 protocol: exact diagnostic records, one final TOTAL, matching count/denominators, unique continuous zero-based indices, and the contracted bail on every record. Timeout, output overflow, and executable-materialization contradictions cannot be GREEN.",
    prompt: "Use this to re-run the golden ignition matrix against an experimental or baseline driver and get a structured GREEN/RED/CFAIL verdict per fixture, instead of re-deriving expected rc/stdout by hand each time.",
    toAutoClassifierInput: (input) => `shape_matrix:${input.filterTag || "all"}`,
    async execute(input) {
      if (!input.driver || !isAbsolute(String(input.driver))) throw new Error(`driver must be an absolute path: ${String(input.driver || "")}`);
      const driverPath = resolve(String(input.driver));
      const matrixPath = resolveMatrixPath(input.matrixPath);
      const matrixDir = dirname(matrixPath);
      const snapshotDir = mkdtempSync(join(tmpdir(), "cheng-shape-inputs-"));
      try {
        chmodSync(snapshotDir, 0o700);
        const inputBudget = {used: 0, limit: MAX_TOTAL_INPUT_BYTES};
        const driver = budgetedSnapshot(driverPath, join(snapshotDir, "driver"), "driver", {executable: true, maxBytes: MAX_DRIVER_BYTES}, inputBudget);
        const matrixSnapshot = budgetedSnapshot(matrixPath, join(snapshotDir, "matrix.json"), "matrixPath", {maxBytes: MAX_MATRIX_BYTES}, inputBudget);
        const matrix = loadMatrix(matrixSnapshot.snapshotPath);
        const rootInput = input.root ? String(input.root) : String(matrix.defaultRoot || matrixDir);
        const root = resolveExistingAbsolutePath(rootInput, "root", {directory: true});
        resolveExistingAbsolutePath(join(root, "cheng-package.toml"), "root cheng-package.toml", {rejectSymlink: true});
        const timeoutMs = Math.round((input.timeoutSec || DEFAULT_TIMEOUT_SEC) * 1000);
        const maxBuffer = input.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES;
        const preparedEntries = preflightMatrixEntries(matrix.entries, matrixDir, snapshotDir, inputBudget);
        const selectedEntries = selectPreparedEntries(preparedEntries, input.filterTag);
        const coverageGaps = preparedEntries
          .filter((entry) => !matchesFilterTag(entry, input.filterTag))
          .map((entry) => ({name: entry.name, tags: entryTags(entry), reason: "filtered_out"}));

        const results = [];
        for (const entry of selectedEntries) {
          const result = await runOneEntry(entry, driver.snapshotPath, root, timeoutMs, maxBuffer);
          results.push(result);
        }
        const summary = {
          total: matrix.entries.length,
          selected: selectedEntries.length,
          green: 0,
          red: 0,
          cfail: 0,
          skipped: coverageGaps.length,
          coverageGaps,
        };
        for (const result of results) {
          if (result.status === "GREEN") summary.green++;
          else if (result.status === "RED") summary.red++;
          else if (result.status === "CFAIL") summary.cfail++;
        }
        return jsonResult({
          schema: "cheng_shape_matrix.v1",
          driver: driverPath,
          matrixPath,
          root,
          inputEvidence: {
            driver: {bytes: driver.bytes, sha256: driver.sha256},
            matrix: {bytes: matrixSnapshot.bytes, sha256: matrixSnapshot.sha256},
            totalSnapshotBytes: inputBudget.used,
          },
          maxOutputBytes: maxBuffer,
          results,
          summary,
        });
      } finally {
        rmSync(snapshotDir, {recursive: true, force: true});
      }
    },
  });
});

export {ChengShapeMatrixTool, initChengShapeMatrixModule};
