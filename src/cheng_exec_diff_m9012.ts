// @ts-nocheck
// 双 driver 差分法工具化: 同一份 .cheng 夹具分别用 driverA/driverB 编译+运行, 逐条比较
// compile rc / run rc / stdout 摘要, 报 identical|semantic_divergence|compile_wall|both_fail。
// compile_wall 时额外抽取 ZC_NOT_READY 摘要(function/body_kind/bail), 单列展示不计入分歧,
// 因为那是"功能尚未落地"的已知墙, 不是两个 driver 之间的真实行为差异。
import {createHash} from "node:crypto";
import {mkdtempSync, rmSync, existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {isAbsolute, join} from "node:path";
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool,jsonResult,resolveChengProjectRoot,runChengDriver,takeTrailingText,initChengToolkitModule,zodSchema} from "./cheng_toolkit_m9000.ts";

var chengExecDiffInputSchema,ChengExecDiffTool;

function normalizeMaybeFileUri(value) {
  const text = String(value || "");
  if (text.startsWith("file://")) return decodeURIComponent(new URL(text).pathname);
  return text;
}

// driverA/driverB 常常不是同一份 "受信" driver(实验分支产物、/tmp 下的临时构建), 所以这里
// 不复用 createChengTextTool 默认的 assertChengProjectInputPaths(那只认 file/source/... 键,
// 且要求路径落在 root 内) —— fixture/driverA/driverB 就是刻意允许指向 root 之外的路径。
function resolveArbitraryPath(value, label) {
  if (!value) throw new Error(`${label} is required`);
  const path = normalizeMaybeFileUri(value);
  if (!existsSync(path)) throw new Error(`${label} not found: ${path}`);
  return path;
}

function resolveFixturePath(value, root, label) {
  const text = normalizeMaybeFileUri(value);
  const path = isAbsolute(text) ? text : join(root, text);
  if (!existsSync(path)) throw new Error(`${label} not found: ${path}`);
  return path;
}

function sha256Digest(text) {
  return `sha256:${createHash("sha256").update(String(text || ""), "utf8").digest("hex")}`;
}

// ZC_NOT_READY idx=E/T function=NAME body_kind=KIND detail=... line=NUM fz_kind=... stmt_kind=... bail=NUM slot_diag=...
const ZC_NOT_READY_LINE = /^ZC_NOT_READY idx=(\d+)\/(\d+) function=(\S+) body_kind=(\S+) .*?\bbail=(-?\d+)\b/m;
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

async function compileWithDriver(driver, fixturePath, root, outPath, timeoutMs) {
  const args = ["system-link-exec", `--root:${root}`, `--in:${fixturePath}`, "--emit:exe", "--link-providers", "--target:arm64-apple-darwin", `--out:${outPath}`];
  // 两个 env 旋钮显式清空(等价 `env -u`): 部分实验 driver/父进程环境可能残留这两个开关,
  // 差分必须在两侧一致的"默认 handoff + 默认 pure-providers 门"下比较, 否则同一份夹具会因
  // 环境不同而假报分歧。RSS 帽由 runChengDriver 内部统一注入, 这里不用重复处理。
  const run = await runChengDriver(driver, args, {root, cwd: root, timeoutMs, env: {CHENG_NO_BACKEND_DRIVER_HANDOFF: "", CHENG_REQUIRE_PURE_PROVIDERS: ""}});
  return {...run, args};
}

async function runExecutable(exePath, root, timeoutMs) {
  return runChengDriver(exePath, [], {root, cwd: root, timeoutMs});
}

async function diffOneFixture(fixtureValue, driverA, driverB, root, timeoutMs, tempDir) {
  const fixturePath = resolveFixturePath(fixtureValue, root, "fixture");
  const outA = join(tempDir, `a-${Buffer.from(fixturePath).toString("hex").slice(-24)}.exe`);
  const outB = join(tempDir, `b-${Buffer.from(fixturePath).toString("hex").slice(-24)}.exe`);
  const compileA = await compileWithDriver(driverA, fixturePath, root, outA, timeoutMs);
  const compileB = await compileWithDriver(driverB, fixturePath, root, outB, timeoutMs);
  const base = {
    fixture: fixturePath,
    compileRcA: compileA.exitCode,
    compileRcB: compileB.exitCode,
    compileStderrA: takeTrailingText(compileA.stderr, 1000),
    compileStderrB: takeTrailingText(compileB.stderr, 1000),
  };
  const compiledOkA = !compileA.missingDriver && compileA.exitCode === 0 && existsSync(outA);
  const compiledOkB = !compileB.missingDriver && compileB.exitCode === 0 && existsSync(outB);
  if (!compiledOkA || !compiledOkB) {
    const notReady = {
      A: parseZcNotReady(`${compileA.stdout || ""}\n${compileA.stderr || ""}`),
      B: parseZcNotReady(`${compileB.stdout || ""}\n${compileB.stderr || ""}`),
    };
    const hasNotReady = notReady.A.entries.length > 0 || notReady.B.entries.length > 0;
    return {
      ...base,
      runRcA: null,
      runRcB: null,
      stdoutDigestA: null,
      stdoutDigestB: null,
      verdict: hasNotReady ? "compile_wall" : (!compiledOkA && !compiledOkB ? "both_fail" : "semantic_divergence"),
      ...(hasNotReady ? {notReady} : {}),
    };
  }
  const runA = await runExecutable(outA, root, timeoutMs);
  const runB = await runExecutable(outB, root, timeoutMs);
  const stdoutDigestA = sha256Digest(runA.stdout);
  const stdoutDigestB = sha256Digest(runB.stdout);
  const identical = runA.exitCode === runB.exitCode && stdoutDigestA === stdoutDigestB;
  return {
    ...base,
    runRcA: runA.exitCode,
    runRcB: runB.exitCode,
    stdoutDigestA,
    stdoutDigestB,
    verdict: identical ? "identical" : "semantic_divergence",
    runStdoutA: takeTrailingText(runA.stdout, 500),
    runStdoutB: takeTrailingText(runB.stdout, 500),
  };
}

var initChengExecDiffModule = defineModuleInitializer(() => {
  initChengToolkitModule();
  chengExecDiffInputSchema = zodSchema.strictObject({
    fixture: zodSchema.union([zodSchema.string(), zodSchema.array(zodSchema.string()).min(1)]).describe("One .cheng path, or an array of paths. Absolute paths are allowed (fixtures need not live inside root)."),
    driverA: zodSchema.string().describe("Absolute path to the first Cheng driver binary."),
    driverB: zodSchema.string().describe("Absolute path to the second Cheng driver binary."),
    root: zodSchema.string().describe("Explicit Cheng project root passed to --root:. Must contain cheng-package.toml."),
    timeoutSec: zodSchema.number().positive().optional().describe("Per-process (compile or run) timeout in seconds. Default is the tool's driver timeout."),
  });
  ChengExecDiffTool = createChengTextTool({
    name: "cheng_exec_diff",
    requiresChengProjectRoot: true,
    searchHint: "compile+run a fixture on two Cheng drivers and diff the result",
    inputSchema: chengExecDiffInputSchema,
    description: "Compile and run one or more .cheng fixtures under two Cheng driver binaries (system-link-exec --emit:exe --link-providers) and report per-fixture verdict: identical, semantic_divergence (real miscompile signal), compile_wall (blocked by ZC_NOT_READY, not a divergence), or both_fail.",
    prompt: "Use this for the 30s two-driver differential method: pass a known-divergent fixture plus an experimental driverA and a baseline driverB (often cheng.stage3).",
    toAutoClassifierInput: (input) => `exec_diff:${Array.isArray(input.fixture) ? input.fixture.length : 1}`,
    async execute(input) {
      const root = resolveChengProjectRoot({root: input.root});
      const driverA = resolveArbitraryPath(input.driverA, "driverA");
      const driverB = resolveArbitraryPath(input.driverB, "driverB");
      const timeoutMs = input.timeoutSec ? Math.round(input.timeoutSec * 1000) : undefined;
      const fixtures = Array.isArray(input.fixture) ? input.fixture : [input.fixture];
      const tempDir = mkdtempSync(join(tmpdir(), "cheng-exec-diff-"));
      try {
        const results = [];
        for (const fixtureValue of fixtures) {
          results.push(await diffOneFixture(fixtureValue, driverA, driverB, root, timeoutMs, tempDir));
        }
        const summary = {identical: 0, semantic_divergence: 0, compile_wall: 0, both_fail: 0};
        for (const result of results) summary[result.verdict]++;
        return jsonResult({schema: "cheng_exec_diff.v1", root, driverA, driverB, summary, results});
      } finally {
        rmSync(tempDir, {recursive: true, force: true});
      }
    },
  });
});

export {ChengExecDiffTool, initChengExecDiffModule};
