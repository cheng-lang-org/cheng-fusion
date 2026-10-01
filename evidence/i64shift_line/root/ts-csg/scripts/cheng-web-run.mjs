#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileNativeGuiChengSourceToExe } from "./cheng-native-gui-link.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(helpText());
  process.exit(0);
}

if (options.surfaceOut) {
  fail("--surface-out requires the native surface/raster provider; refusing to write placeholder pixels");
}
if ((options.project ? 1 : 0) + (options.csgWeb ? 1 : 0) !== 1) {
  fail("pass exactly one of --project or --csg-web");
}

const outDir = resolvePath(options.outDir ?? join(packageDir, "tmp", `cheng-web-run-${Date.now()}`));
mkdirSync(outDir, { recursive: true });

const factsPath = resolvePath(options.factsOut ?? join(outDir, "app.csgweb"));
const webReportPath = resolvePath(options.webReportOut ?? join(outDir, "app.web.report.json"));
const sourcePath = resolvePath(options.sourceOut ?? join(outDir, "app.cheng"));
const exePath = resolvePath(options.exeOut ?? join(outDir, "app"));
const compileReportPath = resolvePath(options.compileReportOut ?? join(outDir, "app.compile.report.txt"));
const tracePath = options.traceOut ? resolvePath(options.traceOut) : "";
const cheng = resolvePath(options.cheng ?? join(repoRoot, "artifacts", "backend_driver", "cheng"));

if (!existsSync(cheng)) fail(`missing Cheng compiler: ${cheng}`);

const startedAt = Date.now();
let factsText = "";
let webReport = undefined;

if (options.project) {
  execFileSync("npm", ["run", "build"], { cwd: packageDir, stdio: ["ignore", "pipe", "pipe"] });
  const { emitCsgWebFromTs } = await import(pathToFileURL(join(packageDir, "dist", "csg-web.js")).href);
  const result = emitCsgWebFromTs({
    project: resolvePath(options.project),
    runtime: options.runtime,
    entryRoots: options.entryRoots,
  });
  if (result.diagnostics.length > 0) fail(result.diagnostics.join("\n"));
  factsText = result.text;
  webReport = result.report;
  writeFileSync(factsPath, factsText, "utf8");
  writeFileSync(webReportPath, JSON.stringify(webReport, null, 2) + "\n", "utf8");
} else {
  factsText = readFileSync(resolvePath(options.csgWeb), "utf8");
  execFileSync("npm", ["run", "build"], { cwd: packageDir, stdio: ["ignore", "pipe", "pipe"] });
}

const { validateCsgWebText } = await import(pathToFileURL(join(packageDir, "dist", "csg-web.js")).href);
const { materializeCsgWebFactsToChengSource } = await import(pathToFileURL(join(packageDir, "dist", "csg-web-materializer.js")).href);

const validation = validateCsgWebText(factsText);
if (!validation.ok) fail(validation.diagnostics.join("\n"));

if (webReport) {
  const closure = webReport.runtimeClosure;
  if (!closure?.complete || closure.openRequirementCount !== 0 || closure.openExternalSymbolCount !== 0) {
    fail(`runtime closure is not complete: open=${closure?.openRequirementCount ?? "unknown"} external=${closure?.openExternalSymbolCount ?? "unknown"}`);
  }
}

const materialized = materializeCsgWebFactsToChengSource(factsText, {
  frameLimit: options.frameLimit,
  viewport: options.viewport,
  rawPixelDump: options.rawPixelDump,
});
if (materialized.diagnostics.length > 0) fail(materialized.diagnostics.join("\n"));
writeFileSync(sourcePath, materialized.text, "utf8");

const nativeObjects = compileNativeGuiChengSourceToExe({
  repoRoot,
  sourcePath,
  exePath,
  outDir,
  reportPath: compileReportPath,
  cheng,
  timeout: options.compileTimeoutMs,
});

let runOutput = "";
if (options.run) {
  runOutput = execFileSync(exePath, [], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: options.runTimeoutMs,
    maxBuffer: options.runMaxBufferBytes,
  });
}

const trace = {
  schema: "cheng-web-run.trace",
  project: options.project ? resolvePath(options.project) : undefined,
  csgWeb: options.csgWeb ? resolvePath(options.csgWeb) : factsPath,
  viewport: options.viewport,
  facts: factsPath,
  webReport: webReport ? webReportPath : undefined,
  source: sourcePath,
  executable: exePath,
  compileReport: compileReportPath,
  materialized: materialized.counts,
  frameLimit: options.frameLimit,
  nativeObjects,
  run: options.run,
  runOutput,
  elapsedMs: Date.now() - startedAt,
};
if (tracePath) writeFileSync(tracePath, JSON.stringify(trace, null, 2) + "\n", "utf8");

process.stdout.write(`cheng-web-run ok\nsource=${sourcePath}\nexe=${exePath}\n`);
if (runOutput.trim().length > 0) process.stdout.write(runOutput);

function parseArgs(args) {
  const parsed = {
    runtime: ["node", "browser"],
    entryRoots: [],
    viewport: "800x600",
    frameLimit: 600,
    run: true,
    compileTimeoutMs: 120000,
    runTimeoutMs: 30000,
    runMaxBufferBytes: 32 * 1024 * 1024,
    rawPixelDump: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      i += 1;
      if (i >= args.length) fail(`missing value for ${arg}`);
      return args[i];
    };
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--project") parsed.project = next();
    else if (arg === "--csg-web") parsed.csgWeb = next();
    else if (arg === "--entry-root") parsed.entryRoots.push(next());
    else if (arg === "--runtime") parsed.runtime = next().split(",").map((item) => item.trim()).filter(Boolean);
    else if (arg === "--viewport") parsed.viewport = next();
    else if (arg === "--frame-limit") parsed.frameLimit = positiveInteger(next(), "--frame-limit");
    else if (arg === "--out-dir") parsed.outDir = next();
    else if (arg === "--facts-out") parsed.factsOut = next();
    else if (arg === "--web-report-out") parsed.webReportOut = next();
    else if (arg === "--source-out") parsed.sourceOut = next();
    else if (arg === "--exe-out") parsed.exeOut = next();
    else if (arg === "--compile-report-out") parsed.compileReportOut = next();
    else if (arg === "--trace-out") parsed.traceOut = next();
    else if (arg === "--surface-out") parsed.surfaceOut = next();
    else if (arg === "--cheng") parsed.cheng = next();
    else if (arg === "--no-run") parsed.run = false;
    else if (arg === "--raw-pixels") parsed.rawPixelDump = true;
    else if (arg === "--compile-timeout-ms") parsed.compileTimeoutMs = Number(next());
    else if (arg === "--run-timeout-ms") parsed.runTimeoutMs = Number(next());
    else fail(`unknown argument: ${arg}`);
  }
  return parsed;
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(`${name} must be a positive integer`);
  return parsed;
}

function resolvePath(value) {
  if (!value) return value;
  return resolve(process.cwd(), value);
}

function fail(message) {
  process.stderr.write(`cheng-web-run: ${message}\n`);
  process.exit(1);
}

function helpText() {
  return `cheng-web-run

Usage:
  node scripts/cheng-web-run.mjs --project <tsconfig> [--entry-root <path>] [--out-dir <dir>]
  node scripts/cheng-web-run.mjs --csg-web <facts> [--out-dir <dir>]

Options:
  --runtime <list>          default: node,browser
  --viewport <w>x<h>        recorded in trace; default: 800x600
  --frame-limit <n>         GUI frames to run before exit; default: 600
  --trace-out <path>        write pipeline trace JSON
  --surface-out <path>      hard-fails until native surface provider is connected
  --raw-pixels              dump full raw pixel rows for oracle comparison
  --no-run                  compile only
`;
}
