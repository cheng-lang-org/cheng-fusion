// @ts-nocheck
// cheng_fixture_matrix: 对任意显式 Cheng root 执行 drivers[] x fixtures[] 的真实
// compile/run 矩阵。每个 fixture 都携带自己的运行期 expectRc；编译失败、未产出真实
// executable、运行超时或 rc 不匹配都直接判 RED。
//
// mirror 是 fixture name 间的双向边。foo/foo_true 命名对会自动建立 mirror；任何
// *_true 缺 base、requiresMirror 找不到约定对端、显式 mirror 非双向，或同一 fixture
// 被配到多个对端，都会在启动第一个编译进程前 hard-fail。mirror pair 不推断两端
// expectRc 的关系，只要求两格分别命中各自契约，并据此给出 pairVerdict。
import {accessSync, constants, lstatSync, mkdtempSync, realpathSync, rmSync, statSync} from "node:fs";
import {tmpdir} from "node:os";
import {isAbsolute, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {b as defineModuleInitializer} from "./runtime.ts";
import {createChengTextTool, jsonResult, runChengDriver, takeTrailingText, initChengToolkitModule, zodSchema} from "./cheng_toolkit_m9000.ts";

var chengFixtureMatrixInputSchema, ChengFixtureMatrixTool;

const DEFAULT_TIMEOUT_SEC = 300;
const DEFAULT_MAX_OUTPUT_BYTES = 1 << 30;
const TARGET = "arm64-apple-darwin";

function normalizeAbsolutePath(value, label) {
  const raw = String(value || "");
  const text = raw.startsWith("file://") ? fileURLToPath(raw) : raw;
  if (!isAbsolute(text)) throw new Error(`${label} must be an absolute path: ${raw}`);
  return resolve(text);
}

function resolveExistingFile(value, label, executable = false) {
  const requested = normalizeAbsolutePath(value, label);
  let stat;
  try {
    stat = statSync(requested);
  } catch {
    throw new Error(`${label} not found: ${requested}`);
  }
  if (!stat.isFile()) throw new Error(`${label} is not a file: ${requested}`);
  if (stat.size === 0) throw new Error(`${label} is empty: ${requested}`);
  const path = realpathSync.native(requested);
  if (executable) {
    try {
      accessSync(path, constants.X_OK);
    } catch {
      throw new Error(`${label} is not executable: ${path}`);
    }
  }
  return path;
}

function resolveExistingDirectory(value, label) {
  const requested = normalizeAbsolutePath(value, label);
  let stat;
  try {
    stat = statSync(requested);
  } catch {
    throw new Error(`${label} not found: ${requested}`);
  }
  if (!stat.isDirectory()) throw new Error(`${label} is not a directory: ${requested}`);
  return realpathSync.native(requested);
}

function resolveChengRoot(value) {
  const root = resolveExistingDirectory(value, "root");
  resolveExistingFile(join(root, "cheng-package.toml"), "root cheng-package.toml");
  return root;
}

function validateAndResolveDrivers(values) {
  const drivers = values.map((value, index) => resolveExistingFile(value, `drivers[${index}]`, true));
  const seen = new Map();
  for (let index = 0; index < drivers.length; index++) {
    const previous = seen.get(drivers[index]);
    if (previous !== undefined) {
      throw new Error(`duplicate driver path: drivers[${previous}] and drivers[${index}] both resolve to ${drivers[index]}`);
    }
    seen.set(drivers[index], index);
  }
  return drivers;
}

function addMirrorPartner(partners, fixtures, leftIndex, rightIndex, source) {
  if (leftIndex === rightIndex) {
    throw new Error(`fixture ${fixtures[leftIndex].name} cannot mirror itself (${source})`);
  }
  const previous = partners.get(leftIndex);
  if (previous !== undefined && previous !== rightIndex) {
    throw new Error(`duplicate/conflicting mirror for ${fixtures[leftIndex].name}: ${fixtures[previous].name} and ${fixtures[rightIndex].name}`);
  }
  partners.set(leftIndex, rightIndex);
}

function validateAndResolveFixtures(values) {
  const fixtures = values.map((fixture, index) => {
    const path = resolveExistingFile(fixture.path, `fixtures[${index}].path`);
    if (!path.endsWith(".cheng")) throw new Error(`fixtures[${index}].path must be a .cheng file: ${path}`);
    return {
      name: fixture.name,
      path,
      expectRc: fixture.expectRc,
      ...(fixture.mirror !== undefined ? {mirror: fixture.mirror} : {}),
      ...(fixture.requiresMirror !== undefined ? {requiresMirror: fixture.requiresMirror} : {}),
    };
  });
  const indexByName = new Map();
  const indexByPath = new Map();
  for (let index = 0; index < fixtures.length; index++) {
    const name = fixtures[index].name;
    const previous = indexByName.get(name);
    if (previous !== undefined) {
      throw new Error(`duplicate fixture name: fixtures[${previous}] and fixtures[${index}] are both named ${name}`);
    }
    indexByName.set(name, index);
    const previousPath = indexByPath.get(fixtures[index].path);
    if (previousPath !== undefined) {
      throw new Error(`duplicate fixture path: fixtures[${previousPath}] (${fixtures[previousPath].name}) and fixtures[${index}] (${name}) both resolve to ${fixtures[index].path}`);
    }
    indexByPath.set(fixtures[index].path, index);
  }

  const partners = new Map();

  // 后缀本身就是声明：出现 *_true 就必须同时出现精确 base name。不能用显式 mirror
  // 把一个命名错误的 *_true 静默改配到别处。
  for (let trueIndex = 0; trueIndex < fixtures.length; trueIndex++) {
    const trueName = fixtures[trueIndex].name;
    if (!trueName.endsWith("_true")) continue;
    const baseName = trueName.slice(0, -"_true".length);
    if (!baseName) throw new Error(`automatic _true mirror has an empty base name: ${trueName}`);
    const baseIndex = indexByName.get(baseName);
    if (baseIndex === undefined) {
      throw new Error(`automatic _true mirror missing base fixture: ${trueName} requires ${baseName}`);
    }
    addMirrorPartner(partners, fixtures, trueIndex, baseIndex, "automatic _true pair");
    addMirrorPartner(partners, fixtures, baseIndex, trueIndex, "automatic _true pair");
  }

  // 显式 mirror 必须由对端原样指回，半条边不能被自动命名规则掩盖。
  for (let index = 0; index < fixtures.length; index++) {
    const mirrorName = fixtures[index].mirror;
    if (mirrorName === undefined) continue;
    const mirrorIndex = indexByName.get(mirrorName);
    if (mirrorIndex === undefined) {
      throw new Error(`explicit mirror missing fixture: ${fixtures[index].name} -> ${mirrorName}`);
    }
    if (fixtures[mirrorIndex].mirror !== fixtures[index].name) {
      throw new Error(`explicit mirror must be bidirectional: ${fixtures[index].name} -> ${mirrorName}, but ${mirrorName}.mirror is ${JSON.stringify(fixtures[mirrorIndex].mirror ?? null)}`);
    }
    addMirrorPartner(partners, fixtures, index, mirrorIndex, "explicit mirror");
  }

  // requiresMirror 可以由显式 mirror 满足；否则只能按 foo <-> foo_true 约定派生。
  for (let index = 0; index < fixtures.length; index++) {
    if (!fixtures[index].requiresMirror || partners.has(index)) continue;
    const name = fixtures[index].name;
    const expectedName = name.endsWith("_true") ? name.slice(0, -"_true".length) : `${name}_true`;
    const mirrorIndex = indexByName.get(expectedName);
    if (mirrorIndex === undefined) {
      throw new Error(`requiresMirror fixture missing mirror: ${name} requires ${expectedName} or an explicit bidirectional mirror`);
    }
    addMirrorPartner(partners, fixtures, index, mirrorIndex, "requiresMirror naming convention");
    addMirrorPartner(partners, fixtures, mirrorIndex, index, "requiresMirror naming convention");
  }

  // 所有已建立的边必须严格对称；同时只产出一次 canonical pair。
  const mirrorPairs = [];
  for (const [leftIndex, rightIndex] of partners) {
    if (partners.get(rightIndex) !== leftIndex) {
      throw new Error(`mirror relation is asymmetric: ${fixtures[leftIndex].name} -> ${fixtures[rightIndex].name}`);
    }
    if (leftIndex < rightIndex) mirrorPairs.push({leftIndex, rightIndex});
  }
  mirrorPairs.sort((a, b) => a.leftIndex - b.leftIndex || a.rightIndex - b.rightIndex);
  return {fixtures, mirrorPairs};
}

function executableMaterialized(path) {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size === 0) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function processOk(run) {
  return !run.missingDriver && !run.timedOut && !run.overflow && Number.isInteger(run.exitCode);
}

async function compileAndRunCell(driver, driverIndex, fixture, fixtureIndex, root, tempDir, timeoutMs, maxBuffer) {
  const outPath = join(tempDir, `driver-${driverIndex}-fixture-${fixtureIndex}.exe`);
  const args = [
    "system-link-exec",
    `--root:${root}`,
    `--in:${fixture.path}`,
    "--emit:exe",
    "--link-providers",
    `--target:${TARGET}`,
    `--out:${outPath}`,
  ];
  const compile = await runChengDriver(driver, args, {
    root,
    cwd: root,
    timeoutMs,
    maxBuffer,
    // A blank value is observably different from an absent variable for shell/Python
    // based drivers. The matrix contract requires the default driver behavior.
    unsetEnv: ["CHENG_NO_BACKEND_DRIVER_HANDOFF", "CHENG_REQUIRE_PURE_PROVIDERS"],
  });
  const producedExecutable = executableMaterialized(outPath);
  const compileProcessOk = processOk(compile);
  const compileSucceeded = compileProcessOk && compile.exitCode === 0;
  const compiled = compileSucceeded && producedExecutable;
  const base = {
    driverIndex,
    driver,
    fixtureIndex,
    fixture: fixture.name,
    fixturePath: fixture.path,
    expectRc: fixture.expectRc,
    compileRc: compile.exitCode,
    runRc: null,
    status: "RED",
    checks: {processOk: compileProcessOk, compileSucceeded, executableProduced: producedExecutable, rcMatch: false},
    compileTimedOut: Boolean(compile.timedOut),
    compileOverflow: Boolean(compile.overflow),
  };
  if (!compiled) {
    return {
      ...base,
      reason: compile.timedOut ? "compile_timed_out" : (compile.overflow ? "compile_output_overflow" : (compile.exitCode === 0 ? "executable_not_produced" : "compile_failed")),
      compileStdoutTail: takeTrailingText(compile.stdout, 1000),
      compileStderrTail: takeTrailingText(compile.stderr, 1500),
    };
  }

  const run = await runChengDriver(outPath, [], {root, cwd: root, timeoutMs, maxBuffer});
  const runProcessOk = processOk(run);
  const rcMatch = runProcessOk && run.exitCode === fixture.expectRc;
  return {
    ...base,
    runRc: run.exitCode,
    status: rcMatch ? "GREEN" : "RED",
    reason: rcMatch ? "expected_rc_matched" : (run.timedOut ? "run_timed_out" : (run.overflow ? "run_output_overflow" : (run.exitCode === null ? "run_failed" : "expected_rc_mismatch"))),
    checks: {processOk: runProcessOk, compileSucceeded: true, executableProduced: true, rcMatch},
    runTimedOut: Boolean(run.timedOut),
    runOverflow: Boolean(run.overflow),
    stdoutTail: takeTrailingText(run.stdout, 500),
    stderrTail: takeTrailingText(run.stderr, 500),
  };
}

function buildMirrorReports(mirrorPairs, fixtures, drivers, cellsByKey) {
  return mirrorPairs.map(({leftIndex, rightIndex}) => {
    const perDriver = drivers.map((driver, driverIndex) => {
      const left = cellsByKey.get(`${driverIndex}:${leftIndex}`);
      const right = cellsByKey.get(`${driverIndex}:${rightIndex}`);
      const pairVerdict = left?.status === "GREEN" && right?.status === "GREEN" ? "GREEN" : "RED";
      return {
        driverIndex,
        driver,
        pairVerdict,
        cells: [
          {fixture: fixtures[leftIndex].name, verdict: left?.status || "RED"},
          {fixture: fixtures[rightIndex].name, verdict: right?.status || "RED"},
        ],
      };
    });
    return {
      fixtures: [fixtures[leftIndex].name, fixtures[rightIndex].name],
      pairVerdict: perDriver.every((entry) => entry.pairVerdict === "GREEN") ? "GREEN" : "RED",
      perDriver,
    };
  });
}

var initChengFixtureMatrixModule = defineModuleInitializer(() => {
  initChengToolkitModule();
  const fixtureSchema = zodSchema.strictObject({
    name: zodSchema.string().min(1).describe("Unique fixture name. A name ending in _true automatically requires its exact base-name fixture."),
    path: zodSchema.string().min(1).describe("Absolute path to a real .cheng fixture; it may live outside root."),
    expectRc: zodSchema.number().int().describe("Exact process exit code expected after successful compilation."),
    mirror: zodSchema.string().min(1).optional().describe("Optional counterpart fixture name. Explicit mirror declarations must be bidirectional."),
    requiresMirror: zodSchema.boolean().optional().describe("Require a mirror. Without explicit mirror, foo pairs with foo_true."),
  });
  chengFixtureMatrixInputSchema = zodSchema.strictObject({
    drivers: zodSchema.array(zodSchema.string().min(1)).min(1).describe("Unique absolute paths to executable Cheng drivers."),
    fixtures: zodSchema.array(fixtureSchema).min(1).describe("Fixtures forming the other dimension of the compile/run matrix."),
    root: zodSchema.string().min(1).describe("Explicit absolute Cheng tree root passed unchanged to every --root: compile invocation."),
    timeoutSec: zodSchema.number().positive().max(600).optional().describe("Per compile or run process timeout in seconds, maximum 600. Default 300."),
    maxOutputBytes: zodSchema.number().int().positive().max(DEFAULT_MAX_OUTPUT_BYTES).optional().describe("Maximum combined stdout+stderr bytes per compile or run process, maximum 1 GiB. Overflow kills the process group and makes the cell RED."),
  });
  ChengFixtureMatrixTool = createChengTextTool({
    name: "cheng_fixture_matrix",
    searchHint: "run an explicit drivers by fixtures Cheng compile/run expectation matrix with mirror-pair invariants",
    inputSchema: chengFixtureMatrixInputSchema,
    description: "Runs the full drivers[] x fixtures[] product using real `system-link-exec --emit:exe --link-providers` compiles and real produced executables. Every fixture has name/path/expectRc; each cell is GREEN only when compilation materializes an executable and its run rc exactly matches expectRc, otherwise RED. `_true`, requiresMirror, and explicit bidirectional mirror pairs are preflight-validated and receive per-driver plus aggregate pairVerdict reports.",
    prompt: "Use this when validating the same explicit fixture contracts across one or more Cheng driver binaries or cloned Cheng roots. Pass every driver, fixture, and root as an absolute path.",
    toAutoClassifierInput: (input) => `fixture_matrix:${input.drivers?.length || 0}x${input.fixtures?.length || 0}`,
    async execute(input) {
      // All structural and filesystem validation intentionally completes before mkdtemp/spawn.
      const root = resolveChengRoot(input.root);
      const drivers = validateAndResolveDrivers(input.drivers);
      const {fixtures, mirrorPairs} = validateAndResolveFixtures(input.fixtures);
      const timeoutMs = Math.round((input.timeoutSec || DEFAULT_TIMEOUT_SEC) * 1000);
      const maxBuffer = input.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES;
      const tempDir = mkdtempSync(join(tmpdir(), "cheng-fixture-matrix-"));
      try {
        const results = [];
        const cellsByKey = new Map();
        for (let driverIndex = 0; driverIndex < drivers.length; driverIndex++) {
          for (let fixtureIndex = 0; fixtureIndex < fixtures.length; fixtureIndex++) {
            const result = await compileAndRunCell(drivers[driverIndex], driverIndex, fixtures[fixtureIndex], fixtureIndex, root, tempDir, timeoutMs, maxBuffer);
            results.push(result);
            cellsByKey.set(`${driverIndex}:${fixtureIndex}`, result);
          }
        }
        const mirrorReports = buildMirrorReports(mirrorPairs, fixtures, drivers, cellsByKey);
        const summary = {total: results.length, green: 0, red: 0, pairGreen: 0, pairRed: 0};
        for (const result of results) summary[result.status === "GREEN" ? "green" : "red"]++;
        for (const pair of mirrorReports) summary[pair.pairVerdict === "GREEN" ? "pairGreen" : "pairRed"]++;
        const verdict = summary.red === 0 && summary.pairRed === 0 ? "GREEN" : "RED";
        return jsonResult({schema: "cheng_fixture_matrix.v1", root, target: TARGET, maxOutputBytes: maxBuffer, drivers, fixtures, verdict, summary, mirrorPairs: mirrorReports, results});
      } finally {
        rmSync(tempDir, {recursive: true, force: true});
      }
    },
  });
});

export {ChengFixtureMatrixTool, initChengFixtureMatrixModule};
