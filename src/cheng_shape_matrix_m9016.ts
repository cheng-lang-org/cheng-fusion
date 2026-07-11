// @ts-nocheck
// cheng_shape_matrix: 金标 fixture 矩阵跑批器。把"点火确定性枚举纪律"手工循环
// (为每个 fixture 编译+运行+核对预期, 逐条口头汇报)产品化成一个工具: 读
// fixtures/ignition/matrix.json, 对每条 entry 用给定 driver 编译(system-link-exec
// --emit:exe --link-providers), 编译失败按 ZC_NOT_READY 摘要分类, 编译成功则运行
// 并核对 expectRc / expectStdout / golden(字节级, 绝不用 PATH 上的 diff)。
//
// 三类预期契约, 都能被判 GREEN(诚实契约, 不是"必须全过"):
//   - expectRc: 运行期望的退出码。
//   - expectCompileBail: 期望这条 fixture 在编译期就被 ZC_NOT_READY 诚实拒绝, 且
//     bail 号匹配(例如 fam_7_positional 当前契约就是 bail=6641 —— "诚实拒绝"本身
//     是被钉死的绿态, 不是要修复的红态)。
//   - golden: 期望 stdout 与金标文件字节级相同。
// entry 若标 planned:true 且无 fixture, 是覆盖缺口占位(不执行, 计入 coverageGaps)。
import {existsSync, mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, isAbsolute, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool, jsonResult, parseZcNotReady, runChengDriver, takeTrailingText, initChengToolkitModule, zodSchema} from "./cheng_toolkit_m9000.ts";

var chengShapeMatrixInputSchema, ChengShapeMatrixTool;

const CHENG_FUSION_PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MATRIX_PATH = join(CHENG_FUSION_PACKAGE_ROOT, "fixtures/ignition/matrix.json");
const DEFAULT_TIMEOUT_SEC = 300;

function resolveExistingAbsolutePath(value, label) {
  if (!value) throw new Error(`${label} is required`);
  const path = resolve(String(value));
  if (!existsSync(path)) throw new Error(`${label} not found: ${path}`);
  return path;
}

function resolveMatrixPath(matrixPathInput) {
  const text = matrixPathInput ? String(matrixPathInput) : DEFAULT_MATRIX_PATH;
  const path = isAbsolute(text) ? text : resolve(CHENG_FUSION_PACKAGE_ROOT, text);
  if (!existsSync(path)) throw new Error(`matrixPath not found: ${path}`);
  return path;
}

function loadMatrix(matrixPath) {
  let raw;
  try {
    raw = readFileSync(matrixPath, "utf8");
  } catch (error) {
    throw new Error(`cannot read matrix file: ${matrixPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`matrix file is not valid JSON: ${matrixPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || !Array.isArray(parsed.entries)) throw new Error(`matrix file missing entries[] array: ${matrixPath}`);
  return parsed;
}

function resolveFixturePath(fixtureValue, matrixDir) {
  const text = String(fixtureValue);
  return isAbsolute(text) ? text : resolve(matrixDir, text);
}

function entryTags(entry) {
  return Array.isArray(entry.tags) ? entry.tags : [];
}

function matchesFilterTag(entry, filterTag) {
  if (!filterTag) return true;
  return entryTags(entry).includes(filterTag);
}

function summarizeBails(notReady) {
  return notReady.entries.map((e) => ({function: e.function, bodyKind: e.bodyKind, bail: e.bail}));
}

async function compileEntryFixture(driver, fixturePath, root, outPath, timeoutMs) {
  const args = ["system-link-exec", `--root:${root}`, `--in:${fixturePath}`, "--emit:exe", "--link-providers", "--target:arm64-apple-darwin", `--out:${outPath}`];
  // 两个 env 旋钮显式清空, 与 cheng_exec_diff 同一纪律: 差分/矩阵跑批必须在两侧一致的
  // "默认 handoff + 默认 pure-providers 门"下比较, 不被父进程残留环境污染。
  const run = await runChengDriver(driver, args, {root, cwd: root, timeoutMs, env: {CHENG_NO_BACKEND_DRIVER_HANDOFF: "", CHENG_REQUIRE_PURE_PROVIDERS: ""}});
  return {...run, args};
}

async function runOneEntry(entry, driver, root, matrixDir, timeoutMs) {
  const tags = entryTags(entry);
  const base = {name: entry.name, tags};

  if (entry.planned) {
    return {...base, status: "PLANNED_GAP", note: entry.note || null};
  }
  if (!entry.fixture) {
    return {...base, status: "CFAIL", note: "entry has no fixture and is not planned:true (malformed matrix entry)"};
  }
  const fixturePath = resolveFixturePath(entry.fixture, matrixDir);
  if (!existsSync(fixturePath)) {
    return {...base, status: "CFAIL", note: `fixture not found: ${fixturePath}`};
  }

  const tempDir = mkdtempSync(join(tmpdir(), "cheng-shape-matrix-"));
  try {
    const outPath = join(tempDir, `${entry.name}.exe`);
    const compile = await compileEntryFixture(driver, fixturePath, root, outPath, timeoutMs);
    const notReady = parseZcNotReady(`${compile.stdout || ""}\n${compile.stderr || ""}`);
    const compiledOk = !compile.missingDriver && compile.exitCode === 0 && existsSync(outPath);
    const zcTotal = notReady.total;
    const bails = summarizeBails(notReady);

    if (typeof entry.expectCompileBail === "number") {
      const bailMatch = bails.some((b) => b.bail === entry.expectCompileBail);
      if (!compiledOk && bailMatch) {
        return {...base, status: "GREEN", rc: compile.exitCode, expect: {expectCompileBail: entry.expectCompileBail}, zcTotal, bails, note: "diagnosed honest bail matches contracted expectation"};
      }
      if (compiledOk) {
        return {...base, status: "RED", rc: compile.exitCode, expect: {expectCompileBail: entry.expectCompileBail}, zcTotal, bails, note: "contract expected a compile-time bail, but this fixture now compiles clean — matrix.json is stale, update the contract"};
      }
      return {...base, status: "RED", rc: compile.exitCode, expect: {expectCompileBail: entry.expectCompileBail}, zcTotal, bails, note: `compile failed but bail=${entry.expectCompileBail} not observed among: ${JSON.stringify(bails)}`, compileStderrTail: takeTrailingText(compile.stderr, 1500)};
    }

    if (!compiledOk) {
      return {...base, status: "CFAIL", rc: compile.exitCode, expect: {expectRc: entry.expectRc ?? null}, zcTotal, bails, note: compile.missingDriver ? "driver missing" : "compile failed", compileStderrTail: takeTrailingText(compile.stderr, 1500)};
    }

    const runResult = await runChengDriver(outPath, [], {root, cwd: root, timeoutMs});
    const stdoutRaw = runResult.stdout || "";
    const stdoutTrimmed = stdoutRaw.replace(/\s+$/, "");
    const checks = {};
    let allPass = true;

    if (typeof entry.expectRc === "number") {
      checks.rcMatch = runResult.exitCode === entry.expectRc;
      allPass = allPass && checks.rcMatch;
    }
    if (typeof entry.expectStdout === "string") {
      checks.stdoutMatch = stdoutTrimmed === entry.expectStdout;
      allPass = allPass && checks.stdoutMatch;
    }
    if (typeof entry.golden === "string") {
      const goldenPath = resolveFixturePath(entry.golden, matrixDir);
      if (!existsSync(goldenPath)) {
        checks.goldenMatch = false;
        checks.goldenError = `golden file not found: ${goldenPath}`;
      } else {
        const goldenBuf = readFileSync(goldenPath);
        const actualBuf = Buffer.from(stdoutRaw, "utf8");
        checks.goldenMatch = goldenBuf.equals(actualBuf);
      }
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
  });
  ChengShapeMatrixTool = createChengTextTool({
    name: "cheng_shape_matrix",
    searchHint: "run the golden ignition fixture matrix against a Cheng driver and report GREEN/RED/CFAIL per entry",
    inputSchema: chengShapeMatrixInputSchema,
    description: "Compiles and runs every non-planned entry in the golden ignition fixture matrix (fixtures/ignition/matrix.json) under one Cheng driver, checking expectRc / expectStdout / golden(byte-exact) or expectCompileBail (a contracted honest ZC_NOT_READY rejection). Reports GREEN/RED/CFAIL per entry plus coverageGaps (planned:true entries with no fixture yet). Productizes the manual '30s ignition determinism loop' so shape regressions across the pobj ctor/positional family are caught by re-running one tool call instead of a hand-typed loop.",
    prompt: "Use this to re-run the golden ignition matrix against an experimental or baseline driver and get a structured GREEN/RED/CFAIL verdict per fixture, instead of re-deriving expected rc/stdout by hand each time.",
    toAutoClassifierInput: (input) => `shape_matrix:${input.filterTag || "all"}`,
    async execute(input) {
      const driver = resolveExistingAbsolutePath(input.driver, "driver");
      const matrixPath = resolveMatrixPath(input.matrixPath);
      const matrixDir = dirname(matrixPath);
      const matrix = loadMatrix(matrixPath);
      const root = input.root ? resolve(String(input.root)) : resolve(String(matrix.defaultRoot || matrixDir));
      if (!existsSync(root)) throw new Error(`root not found: ${root}`);
      const timeoutMs = Math.round((input.timeoutSec || DEFAULT_TIMEOUT_SEC) * 1000);

      const results = [];
      const coverageGaps = [];
      for (const entry of matrix.entries) {
        if (!matchesFilterTag(entry, input.filterTag)) continue;
        const result = await runOneEntry(entry, driver, root, matrixDir, timeoutMs);
        results.push(result);
        if (result.status === "PLANNED_GAP") coverageGaps.push({name: entry.name, tags: entryTags(entry), note: entry.note || null});
      }
      const summary = {green: 0, red: 0, cfail: 0, skipped: 0, coverageGaps};
      for (const result of results) {
        if (result.status === "GREEN") summary.green++;
        else if (result.status === "RED") summary.red++;
        else if (result.status === "CFAIL") summary.cfail++;
        else if (result.status === "PLANNED_GAP") summary.skipped++;
      }
      return jsonResult({schema: "cheng_shape_matrix.v1", driver, matrixPath, root, results, summary});
    },
  });
});

export {ChengShapeMatrixTool, initChengShapeMatrixModule};
