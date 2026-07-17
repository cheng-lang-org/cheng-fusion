// @ts-nocheck
// 双 driver 差分法工具化: 同一份 .cheng 夹具分别用 driverA/driverB 编译+运行, 逐条比较
// compile rc / run rc / 原始 stdout 字节, 报 identical|semantic_divergence|compile_wall|both_fail|CFAIL。
// compile_wall 时额外抽取 ZC_NOT_READY 摘要(function/body_kind/bail), 单列展示不计入分歧,
// 因为那是"功能尚未落地"的已知墙, 不是两个 driver 之间的真实行为差异。
import {createHash} from "node:crypto";
import {accessSync, chmodSync, closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdtempSync, openSync, readSync, rmSync, writeSync} from "node:fs";
import {tmpdir} from "node:os";
import {isAbsolute, join, resolve} from "node:path";
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool,jsonResult,resolveChengProjectRoot,runChengDriver,takeTrailingText,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";

var chengExecDiffInputSchema,ChengExecDiffTool;

const EXPECTED_COMPILE_WALL_RC = 2;
const PROTOCOL_UNSIGNED_INTEGER = "(?:0|[1-9]\\d*)";
const PROTOCOL_POSITIVE_INTEGER = "[1-9]\\d*";
const PROTOCOL_SIGNED_INTEGER = "(?:0|-?[1-9]\\d*)";
const ZC_PROTOCOL_ENTRY_RE = new RegExp(`^ZC_NOT_READY idx=(${PROTOCOL_UNSIGNED_INTEGER})/(${PROTOCOL_POSITIVE_INTEGER}) function=(\\S+) body_kind=(\\S+) detail=(\\S*) line=(${PROTOCOL_UNSIGNED_INTEGER}) fz_kind=(\\S+) stmt_kind=(\\S+) bail=(${PROTOCOL_SIGNED_INTEGER}) slot_diag=(\\S*)$`);
const ZC_PROTOCOL_TOTAL_RE = new RegExp(`^ZC_NOT_READY_TOTAL count=(${PROTOCOL_POSITIVE_INTEGER})$`);
const STRICT_PROTOCOL_UTF8 = new TextDecoder("utf-8", {fatal: true});
const SNAPSHOT_CHUNK_BYTES = 1 << 20;
const MAX_DRIVER_BYTES = 512 * 1024 * 1024;
const MAX_FIXTURE_BYTES = 64 * 1024 * 1024;
const MAX_FIXTURE_COUNT = 4096;
const MAX_TOTAL_INPUT_BYTES = 1024 * 1024 * 1024;

function normalizeMaybeFileUri(value) {
  const text = String(value || "");
  if (text.startsWith("file://")) return decodeURIComponent(new URL(text).pathname);
  return text;
}

// driverA/driverB 常常不是同一份 "受信" driver(实验分支产物、/tmp 下的临时构建), 所以这里
// 不复用 createChengTextTool 默认的 assertChengProjectInputPaths(那只认 file/source/... 键,
// 且要求路径落在 root 内) —— fixture/driverA/driverB 就是刻意允许指向 root 之外的路径。
//
// driver 路径必须先绝对化，再在首个 spawn 前复制到私有快照；执行阶段不再打开调用方路径。
function resolveArbitraryPath(value, label) {
  if (!value) throw new Error(`${label} is required`);
  const text = normalizeMaybeFileUri(value);
  if (!isAbsolute(text)) throw new Error(`${label} must be an absolute path: ${text}`);
  return resolve(text);
}

function resolveFixturePath(value, root, label) {
  const text = normalizeMaybeFileUri(value);
  const path = resolve(isAbsolute(text) ? text : join(root, text));
  if (!path.endsWith(".cheng")) throw new Error(`${label} must be a .cheng file: ${path}`);
  return path;
}

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
    if (!openedBefore.isFile() || !sameFileGeneration(pathBefore, openedBefore)) {
      throw new Error(`${label} changed while opening: ${sourcePath}`);
    }
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
  if (remaining <= 0) throw new Error(`cheng_exec_diff input snapshots exceed ${budget.limit} total bytes`);
  const snapshot = stableSnapshot(sourcePath, snapshotPath, label, {...options, maxBytes: Math.min(options.maxBytes, remaining)});
  budget.used += snapshot.bytes;
  return snapshot;
}

function sha256Digest(bytes) {
  if (!Buffer.isBuffer(bytes)) throw new Error("cheng_exec_diff requires raw stdout bytes from the process runner");
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function processOk(run) {
  return !run.missingDriver && !run.timedOut && !run.overflow && Number.isInteger(run.exitCode);
}

function inspectExecutableArtifact(path) {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size === 0) return {present: true, executable: false};
    try {
      accessSync(path, constants.X_OK);
      return {present: true, executable: true};
    } catch {
      return {present: true, executable: false};
    }
  } catch (error) {
    if (error?.code === "ENOENT") return {present: false, executable: false};
    throw error;
  }
}

function materializationOk(exitCode, artifact) {
  if (!Number.isInteger(exitCode)) return false;
  return exitCode === 0 ? artifact.executable : !artifact.present;
}

function processFailureReason(prefix, run) {
  if (run.missingDriver) return `${prefix}_driver_missing`;
  if (run.timedOut) return `${prefix}_timed_out`;
  if (run.overflow) return `${prefix}_output_overflow`;
  if (!Number.isInteger(run.exitCode)) return `${prefix}_missing_exit_code`;
  return null;
}

function cfailResult(base, reason, extra = {}) {
  return {...base, ...extra, status: "CFAIL", verdict: "CFAIL", reason};
}

function parseProtocolSafeInteger(token) {
  const value = Number(token);
  return Number.isSafeInteger(value) ? value : null;
}

// exec_diff 的 compile_wall 是一个完成态，不是“任意输出里碰巧含 ZC_NOT_READY”启发式。
// 只信任 driver 原始 stderr 的严格 UTF-8、逐行完全匹配的正式协议；stdout 永远不是诊断通道。
function parseCompileWallProtocol(stderrBuffer) {
  const entries = [];
  const totals = [];
  const malformedLines = [];
  const protocolKinds = [];
  let observed = false;
  if (!Buffer.isBuffer(stderrBuffer)) {
    return {
      observed: false,
      complete: false,
      utf8Valid: false,
      protocolError: "raw stderr bytes are unavailable",
      total: null,
      totalLineCount: 0,
      countMatches: false,
      indicesUnique: false,
      indicesContinuous: false,
      denominatorsMatch: false,
      totalIsFinal: false,
      malformedLines,
      entries,
    };
  }
  let text;
  try {
    text = STRICT_PROTOCOL_UTF8.decode(stderrBuffer);
  } catch {
    return {
      observed: false,
      complete: false,
      utf8Valid: false,
      protocolError: "stderr is not valid UTF-8",
      total: null,
      totalLineCount: 0,
      countMatches: false,
      indicesUnique: false,
      indicesContinuous: false,
      denominatorsMatch: false,
      totalIsFinal: false,
      malformedLines,
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
    observed,
    complete,
    utf8Valid: true,
    protocolError: null,
    total: declaredTotal,
    totalLineCount: totals.length,
    countMatches,
    indicesUnique,
    indicesContinuous,
    denominatorsMatch,
    totalIsFinal,
    malformedLines,
    entries,
  };
}

function compileWallEvidence(run) {
  const protocol = parseCompileWallProtocol(run.stderrBuffer);
  const exitCodeMatch = run.exitCode === EXPECTED_COMPILE_WALL_RC;
  return {...protocol, exitCodeMatch, completedRejection: protocol.complete && exitCodeMatch};
}

async function compileWithDriver(driver, fixturePath, root, outPath, timeoutMs, maxBuffer) {
  const args = ["system-link-exec", `--root:${root}`, `--in:${fixturePath}`, "--emit:exe", "--link-providers", "--target:arm64-apple-darwin", `--out:${outPath}`];
  // 这两个 env 旋钮必须从子进程环境删除，而不是赋空串：driver 可以区分“未设置”与“设置为空”。
  // 差分必须在两侧一致的"默认 handoff + 默认 pure-providers 门"下比较, 否则同一份夹具会因
  // 环境不同而假报分歧。RSS 帽由 runChengDriver 内部统一注入, 这里不用重复处理。
  const run = await runChengDriver(driver, args, {root, cwd: root, timeoutMs, maxBuffer, unsetEnv: ["CHENG_NO_BACKEND_DRIVER_HANDOFF", "CHENG_REQUIRE_PURE_PROVIDERS"]});
  // runChengDriver 将原始 buffer 故意定义为不可枚举；spread 会把诊断证据丢掉。
  return Object.assign(run, {args});
}

async function runExecutable(exePath, root, timeoutMs, maxBuffer) {
  return runChengDriver(exePath, [], {root, cwd: root, timeoutMs, maxBuffer, unsetEnv: ["CHENG_NO_BACKEND_DRIVER_HANDOFF", "CHENG_REQUIRE_PURE_PROVIDERS"]});
}

async function diffOneFixture(fixture, fixtureIndex, driverA, driverB, root, timeoutMs, maxBuffer, tempDir) {
  const fixturePath = fixture.snapshotPath;
  // Index-scoped fresh paths prevent a repeated fixture or equal path suffix from inheriting a
  // prior cell's executable when a later compiler returns rc=0 without writing its own output.
  const outA = join(tempDir, `a-${fixtureIndex}.exe`);
  const outB = join(tempDir, `b-${fixtureIndex}.exe`);
  const compileA = await compileWithDriver(driverA, fixturePath, root, outA, timeoutMs, maxBuffer);
  const compileB = await compileWithDriver(driverB, fixturePath, root, outB, timeoutMs, maxBuffer);
  const compileProcessOkA = processOk(compileA);
  const compileProcessOkB = processOk(compileB);
  const artifactA = inspectExecutableArtifact(outA);
  const artifactB = inspectExecutableArtifact(outB);
  const materializedA = artifactA.executable;
  const materializedB = artifactB.executable;
  const materializationOkA = materializationOk(compileA.exitCode, artifactA);
  const materializationOkB = materializationOk(compileB.exitCode, artifactB);
  const base = {
    fixture: fixture.originalPath,
    fixtureEvidence: {bytes: fixture.bytes, sha256: fixture.sha256},
    compileRcA: compileA.exitCode,
    compileRcB: compileB.exitCode,
    compileStderrA: takeTrailingText(compileA.stderr, 1000),
    compileStderrB: takeTrailingText(compileB.stderr, 1000),
    compileTimedOutA: Boolean(compileA.timedOut),
    compileTimedOutB: Boolean(compileB.timedOut),
    compileOverflowA: Boolean(compileA.overflow),
    compileOverflowB: Boolean(compileB.overflow),
    compileChecks: {
      A: {processOk: compileProcessOkA, artifactPresent: artifactA.present, materialized: materializedA, materializationOk: materializationOkA},
      B: {processOk: compileProcessOkB, artifactPresent: artifactB.present, materialized: materializedB, materializationOk: materializationOkB},
    },
  };
  const compileProcessFailureA = processFailureReason("compile_a", compileA);
  const compileProcessFailureB = processFailureReason("compile_b", compileB);
  if (compileProcessFailureA || compileProcessFailureB) {
    return cfailResult(base, compileProcessFailureA || compileProcessFailureB, {
      runRcA: null,
      runRcB: null,
      stdoutDigestA: null,
      stdoutDigestB: null,
    });
  }
  if (!materializationOkA || !materializationOkB) {
    const side = !materializationOkA ? "a" : "b";
    const compile = side === "a" ? compileA : compileB;
    const materialized = side === "a" ? materializedA : materializedB;
    const artifact = side === "a" ? artifactA : artifactB;
    const reason = compile.exitCode === 0 && !materialized
      ? `compile_${side}_executable_not_materialized`
      : artifact.present
        ? `compile_${side}_nonzero_rc_left_output_artifact`
        : `compile_${side}_materialization_contract_failed`;
    return cfailResult(base, reason, {
      runRcA: null,
      runRcB: null,
      stdoutDigestA: null,
      stdoutDigestB: null,
    });
  }
  const compiledOkA = compileA.exitCode === 0;
  const compiledOkB = compileB.exitCode === 0;
  const notReady = {A: compileWallEvidence(compileA), B: compileWallEvidence(compileB)};
  const invalidProtocolA = !notReady.A.utf8Valid || (notReady.A.observed && !notReady.A.completedRejection);
  const invalidProtocolB = !notReady.B.utf8Valid || (notReady.B.observed && !notReady.B.completedRejection);
  if (invalidProtocolA || invalidProtocolB) {
    return cfailResult(base, invalidProtocolA ? "compile_a_incomplete_zc_protocol" : "compile_b_incomplete_zc_protocol", {
      runRcA: null,
      runRcB: null,
      stdoutDigestA: null,
      stdoutDigestB: null,
      notReady,
    });
  }
  if (!compiledOkA || !compiledOkB) {
    const failedSides = [
      ...(!compiledOkA ? [notReady.A] : []),
      ...(!compiledOkB ? [notReady.B] : []),
    ];
    const completedCompileWall = failedSides.length > 0 && failedSides.every((evidence) => evidence.completedRejection);
    return {
      ...base,
      runRcA: null,
      runRcB: null,
      stdoutDigestA: null,
      stdoutDigestB: null,
      verdict: completedCompileWall ? "compile_wall" : (!compiledOkA && !compiledOkB ? "both_fail" : "semantic_divergence"),
      ...((notReady.A.observed || notReady.B.observed) ? {notReady} : {}),
    };
  }
  const runA = await runExecutable(outA, root, timeoutMs, maxBuffer);
  const runB = await runExecutable(outB, root, timeoutMs, maxBuffer);
  const runProcessOkA = processOk(runA);
  const runProcessOkB = processOk(runB);
  const runBase = {
    ...base,
    runRcA: runA.exitCode,
    runRcB: runB.exitCode,
    runTimedOutA: Boolean(runA.timedOut),
    runTimedOutB: Boolean(runB.timedOut),
    runOverflowA: Boolean(runA.overflow),
    runOverflowB: Boolean(runB.overflow),
    runChecks: {A: {processOk: runProcessOkA}, B: {processOk: runProcessOkB}},
  };
  const runProcessFailureA = processFailureReason("run_a", runA);
  const runProcessFailureB = processFailureReason("run_b", runB);
  if (runProcessFailureA || runProcessFailureB) {
    return cfailResult(runBase, runProcessFailureA || runProcessFailureB, {
      stdoutDigestA: Buffer.isBuffer(runA.stdoutBuffer) ? sha256Digest(runA.stdoutBuffer) : null,
      stdoutDigestB: Buffer.isBuffer(runB.stdoutBuffer) ? sha256Digest(runB.stdoutBuffer) : null,
      runStdoutA: takeTrailingText(runA.stdout, 500),
      runStdoutB: takeTrailingText(runB.stdout, 500),
    });
  }
  if (!Buffer.isBuffer(runA.stdoutBuffer) || !Buffer.isBuffer(runB.stdoutBuffer)) {
    return cfailResult(runBase, "raw_stdout_unavailable", {stdoutDigestA: null, stdoutDigestB: null});
  }
  const stdoutDigestA = sha256Digest(runA.stdoutBuffer);
  const stdoutDigestB = sha256Digest(runB.stdoutBuffer);
  const stdoutBytesEqual = runA.stdoutBuffer.equals(runB.stdoutBuffer);
  const identical = runA.exitCode === runB.exitCode && stdoutBytesEqual;
  return {
    ...runBase,
    stdoutDigestA,
    stdoutDigestB,
    stdoutBytesA: runA.stdoutBuffer.length,
    stdoutBytesB: runB.stdoutBuffer.length,
    stdoutBytesEqual,
    verdict: identical ? "identical" : "semantic_divergence",
    runStdoutA: takeTrailingText(runA.stdout, 500),
    runStdoutB: takeTrailingText(runB.stdout, 500),
  };
}

var initChengExecDiffModule = defineModuleInitializer(() => {
  initChengToolkitModule();
  chengExecDiffInputSchema = zodSchema.strictObject({
    fixture: zodSchema.union([zodSchema.string(), zodSchema.array(zodSchema.string()).min(1).max(MAX_FIXTURE_COUNT)]).describe("One .cheng path, or an array of paths. Absolute paths are allowed (fixtures need not live inside root)."),
    driverA: zodSchema.string().describe("Absolute path to the first Cheng driver binary."),
    driverB: zodSchema.string().describe("Absolute path to the second Cheng driver binary."),
    root: zodSchema.string().describe("Explicit Cheng project root passed to --root:. Must contain cheng-package.toml."),
    timeoutSec: zodSchema.number().positive().optional().describe("Per-process (compile or run) timeout in seconds. Default is the tool's driver timeout."),
    maxOutputBytes: zodSchema.number().int().positive().max(1 << 30).optional().describe("Maximum combined stdout+stderr bytes per compile or run process. Hard cap and default are 1 GiB; overflow kills the process group and returns CFAIL."),
  });
  ChengExecDiffTool = createChengTextTool({
    name: "cheng_exec_diff",
    requiresChengProjectRoot: true,
    searchHint: "compile+run a fixture on two Cheng drivers and diff the result",
    inputSchema: chengExecDiffInputSchema,
    description: "Compile and run one or more .cheng fixtures under two Cheng driver binaries (system-link-exec --emit:exe --link-providers) and report per-fixture verdict: identical, semantic_divergence (real miscompile signal), compile_wall (a completed ZC_NOT_READY rejection), both_fail, or CFAIL. Missing/timeout/overflow processes, materialization contradictions, and unavailable raw stdout bytes are always CFAIL. Runtime stdout is compared and hashed as original bytes.",
    prompt: "Use this for the 30s two-driver differential method: pass a known-divergent fixture plus an experimental driverA and a baseline driverB (often cheng.stage3).",
    toAutoClassifierInput: (input) => `exec_diff:${Array.isArray(input.fixture) ? input.fixture.length : 1}`,
    async execute(input) {
      const root = resolveChengProjectRoot({root: input.root});
      const driverAPath = resolveArbitraryPath(input.driverA, "driverA");
      const driverBPath = resolveArbitraryPath(input.driverB, "driverB");
      const timeoutMs = input.timeoutSec ? Math.round(input.timeoutSec * 1000) : undefined;
      const maxBuffer = input.maxOutputBytes || (1 << 30);
      const fixtures = Array.isArray(input.fixture) ? input.fixture : [input.fixture];
      const tempDir = mkdtempSync(join(tmpdir(), "cheng-exec-diff-"));
      try {
        chmodSync(tempDir, 0o700);
        const inputBudget = {used: 0, limit: MAX_TOTAL_INPUT_BYTES};
        const driverA = budgetedSnapshot(driverAPath, join(tempDir, "driver-a"), "driverA", {executable: true, maxBytes: MAX_DRIVER_BYTES}, inputBudget);
        const driverB = driverBPath === driverAPath
          ? driverA
          : budgetedSnapshot(driverBPath, join(tempDir, "driver-b"), "driverB", {executable: true, maxBytes: MAX_DRIVER_BYTES}, inputBudget);
        const fixtureSnapshots = [];
        const fixtureSnapshotByPath = new Map();
        for (let fixtureIndex = 0; fixtureIndex < fixtures.length; fixtureIndex++) {
          const fixturePath = resolveFixturePath(fixtures[fixtureIndex], root, `fixture[${fixtureIndex}]`);
          let snapshot = fixtureSnapshotByPath.get(fixturePath);
          if (!snapshot) {
            snapshot = budgetedSnapshot(fixturePath, join(tempDir, `fixture-${fixtureIndex}.cheng`), `fixture[${fixtureIndex}]`, {maxBytes: MAX_FIXTURE_BYTES}, inputBudget);
            fixtureSnapshotByPath.set(fixturePath, snapshot);
          }
          fixtureSnapshots.push(snapshot);
        }

        const results = [];
        for (let fixtureIndex = 0; fixtureIndex < fixtureSnapshots.length; fixtureIndex++) {
          results.push(await diffOneFixture(fixtureSnapshots[fixtureIndex], fixtureIndex, driverA.snapshotPath, driverB.snapshotPath, root, timeoutMs, maxBuffer, tempDir));
        }
        const summary = {identical: 0, semantic_divergence: 0, compile_wall: 0, both_fail: 0, cfail: 0};
        for (const result of results) {
          if (result.verdict === "CFAIL") summary.cfail++;
          else summary[result.verdict]++;
        }
        return jsonResult({
          schema: "cheng_exec_diff.v1",
          root,
          driverA: driverAPath,
          driverB: driverBPath,
          inputEvidence: {
            driverA: {bytes: driverA.bytes, sha256: driverA.sha256},
            driverB: {bytes: driverB.bytes, sha256: driverB.sha256},
            totalSnapshotBytes: inputBudget.used,
          },
          maxOutputBytes: maxBuffer,
          summary,
          results,
        });
      } finally {
        rmSync(tempDir, {recursive: true, force: true});
      }
    },
  });
});

export {ChengExecDiffTool, initChengExecDiffModule};
