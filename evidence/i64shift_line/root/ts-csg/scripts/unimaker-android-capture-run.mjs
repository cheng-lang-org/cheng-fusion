#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "./process-runner.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(helpText());
  process.exit(0);
}

const outDir = resolvePath(options.outDir ?? join(packageDir, "tmp", `unimaker-android-capture-${Date.now()}`));
mkdirSync(outDir, { recursive: true });
const reportPath = join(outDir, "unimaker-android-capture.report.json");
const localRawPath = resolvePath(options.rawOut || join(outDir, `cheng_${options.routeState}.raw`));

let report = null;
try {
  const summary = readApkBuildSummary(options.apkBuildSummary);
  const plan = buildCapturePlan(summary);
  validateCapturePlan(plan);

  if (options.dryRun) {
    report = baseReport("dry_run", summary, plan, {
      available: false,
      reason: "dry_run",
    });
    writeReport(report);
    process.stdout.write(`unimaker-android-capture dry-run ok\n`);
    process.stdout.write(`report: ${reportPath}\n`);
    process.exit(0);
  }

  const device = await resolveDevice(summary, plan);
  report = await runDeviceCapture(summary, plan, device);
  writeReport(report);
  process.stdout.write(`unimaker-android-capture ok\n`);
  process.stdout.write(`raw: ${report.rawPath}\n`);
  process.stdout.write(`report: ${reportPath}\n`);
} catch (error) {
  if (!report) {
    report = {
      schema: "unimaker.android_headless_capture.v1",
      status: "failed",
      available: false,
      reason: "exception",
      error: error instanceof Error ? error.message : String(error),
      reportPath,
    };
  } else {
    report.status = "failed";
    report.available = false;
    report.reason = report.reason || "exception";
    report.error = error instanceof Error ? error.message : String(error);
  }
  writeReport(report);
  process.stderr.write(`unimaker-android-capture: ${report.error}\n`);
  process.stderr.write(`report: ${reportPath}\n`);
  process.exit(1);
}

function parseArgs(args) {
  const parsed = {
    adb: process.env.ADB || "adb",
    device: process.env.ANDROID_SERIAL || "",
    apkBuildSummary: "",
    outDir: "",
    rawOut: "",
    routeState: "home_default",
    viewport: "390x844",
    deviceDir: "/data/local/tmp/cheng-unimaker-capture",
    timeoutMs: 180000,
    captureEnv: [],
    expectDeviceOutput: [],
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      i += 1;
      if (i >= args.length) fail(`missing value for ${arg}`);
      return args[i];
    };
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--adb") parsed.adb = next();
    else if (arg === "--device") parsed.device = next();
    else if (arg === "--apk-build-summary") parsed.apkBuildSummary = next();
    else if (arg === "--out-dir") parsed.outDir = next();
    else if (arg === "--raw-out") parsed.rawOut = next();
    else if (arg === "--route-state" || arg === "--react-route") parsed.routeState = next();
    else if (arg === "--viewport") parsed.viewport = next();
    else if (arg === "--device-dir") parsed.deviceDir = next();
    else if (arg === "--timeout-ms") parsed.timeoutMs = positiveInteger(next(), arg);
    else if (arg === "--capture-env") parsed.captureEnv.push(parseEnvAssignment(next(), arg));
    else if (arg === "--expect-device-output") parsed.expectDeviceOutput.push(next());
    else if (arg === "--dry-run") parsed.dryRun = true;
    else fail(`unknown argument: ${arg}`);
  }
  if (parsed.apkBuildSummary.trim().length === 0) fail("--apk-build-summary is required");
  parsed.routeState = parsed.routeState.trim();
  if (parsed.routeState.length === 0) fail("--route-state must be non-empty");
  parseViewport(parsed.viewport);
  if (!parsed.deviceDir.startsWith("/data/local/tmp/")) {
    fail("--device-dir must stay under /data/local/tmp");
  }
  return parsed;
}

function readApkBuildSummary(path) {
  const resolved = resolvePath(path);
  if (!existsSync(resolved)) fail(`missing APK build summary: ${resolved}`);
  const summary = JSON.parse(readFileSync(resolved, "utf8"));
  if (summary?.schema !== "unimaker.apk_build.v1") {
    fail(`unexpected APK build summary schema: ${summary?.schema ?? "missing"}`);
  }
  summary.__path = resolved;
  return summary;
}

function buildCapturePlan(summary) {
  const headless = summary.android?.headlessCapture ?? null;
  const hostCapture = summary.android?.hostCapture ?? null;
  const bundleDir = String(headless?.bundleDir ?? "");
  const assetDir = String(headless?.assetDir ?? summary.shellOutDir ?? "");
  const appLib = join(bundleDir, `lib${summary.android?.libName ?? "cheng_unimaker_scene"}.so`);
  const hostLib = join(bundleDir, "libcheng_generated_android_host.so");
  const executable = String(headless?.executable ?? "");
  const assets = assetEntries(summary, assetDir);
  const [width, height] = parseViewport(options.viewport);
  return {
    supported: headless?.supported === true && hostCapture?.supported === true,
    hostCapture,
    headless,
    executable,
    bundleDir,
    assetDir,
    appLib,
    hostLib,
    assets,
    width,
    height,
    deviceDir: options.deviceDir,
    deviceAssetDir: `${options.deviceDir}/assets`,
    deviceRawPath: `${options.deviceDir}/cheng_capture.raw`,
    routeState: options.routeState,
  };
}

function assetEntries(summary, assetDir) {
  const out = [];
  const seen = new Set();
  const verified = Array.isArray(summary.verifiedApkPayloads) ? summary.verifiedApkPayloads : [];
  for (const record of verified) {
    const entry = String(record?.entry ?? "");
    if (!entry.startsWith("assets/") || record?.verification !== "byte-exact") continue;
    const relPath = entry.slice("assets/".length);
    const source = chooseExistingSource(record?.source, join(assetDir, relPath));
    if (!source) fail(`missing verified asset source for ${entry}`);
    const key = relPath;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      relPath,
      source,
      byteCount: statSync(source).size,
      sha256: sha256File(source),
    });
  }
  const copied = Array.isArray(summary.copiedAssets) ? summary.copiedAssets : [];
  for (const record of copied) {
    const relPath = String(record?.relPath ?? "");
    if (!relPath || seen.has(relPath)) continue;
    const source = chooseExistingSource(record?.source, join(assetDir, relPath), record?.bundleSource);
    if (!source) continue;
    seen.add(relPath);
    out.push({
      relPath,
      source,
      byteCount: statSync(source).size,
      sha256: sha256File(source),
    });
  }
  return out.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function chooseExistingSource(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0 && existsSync(candidate)) return candidate;
  }
  return "";
}

function validateCapturePlan(plan) {
  if (!plan.supported) fail("APK summary does not prove host/headless capture support");
  requireFile(plan.executable, "headless capture executable");
  requireFile(plan.appLib, "headless app library");
  requireFile(plan.hostLib, "headless host library");
  if (plan.assets.length <= 0) fail("APK summary has no assets to push");
  for (const required of [
    "runtime/unimaker_scene_data.bin",
    "runtime/unimaker_glyph_sdf_pixels.bin",
  ]) {
    if (!plan.assets.some((asset) => asset.relPath === required)) {
      fail(`capture asset list missing ${required}`);
    }
  }
}

async function resolveDevice(summary, plan) {
  if (options.device.trim().length > 0) {
    return options.device.trim();
  }
  const stdout = await adb(["devices"], 30000);
  const devices = [];
  const bad = [];
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("List of devices")) continue;
    const [serial, state] = line.split(/\s+/);
    if (state === "device") devices.push(serial);
    else bad.push({ serial, state });
  }
  if (devices.length === 1) return devices[0];
  if (devices.length === 0) {
    const reason = bad.length > 0 ? `no ready adb device; states=${bad.map((d) => `${d.serial}:${d.state}`).join(",")}` : "no adb device";
    report = baseReport("failed", summary, plan, { available: false, reason: "no_device", error: reason });
    throw new Error(reason);
  }
  throw new Error(`multiple adb devices; pass --device: ${devices.join(", ")}`);
}

async function runDeviceCapture(summary, plan, device) {
  const serialArgs = ["-s", device];
  const shell = (command, timeout = options.timeoutMs) => adb([...serialArgs, "shell", command], timeout);
  const push = (source, target, timeout = options.timeoutMs) => adb([...serialArgs, "push", source, target], timeout);
  const pull = (source, target, timeout = options.timeoutMs) => adb([...serialArgs, "pull", source, target], timeout);

  await shell(`rm -rf ${shq(plan.deviceDir)} && mkdir -p ${shq(plan.deviceDir)} ${shq(plan.deviceAssetDir)}`);
  await push(plan.executable, `${plan.deviceDir}/unimaker_capture`);
  await push(plan.appLib, `${plan.deviceDir}/${basename(plan.appLib)}`);
  await push(plan.hostLib, `${plan.deviceDir}/${basename(plan.hostLib)}`);

  const dirs = new Set([plan.deviceAssetDir]);
  for (const asset of plan.assets) {
    const target = `${plan.deviceAssetDir}/${asset.relPath}`;
    dirs.add(dirnamePosix(target));
  }
  await shell([...dirs].map((dir) => `mkdir -p ${shq(dir)}`).join(" && "));
  for (const asset of plan.assets) {
    await push(asset.source, `${plan.deviceAssetDir}/${asset.relPath}`);
  }

  const runCommandLine = [
    `cd ${shq(plan.deviceDir)}`,
    "chmod 755 unimaker_capture",
    `${formatCaptureEnv(plan)} ./unimaker_capture ${shq(plan.routeState)} ${shq(plan.deviceRawPath)} ${plan.width} ${plan.height} 2>&1`,
  ].join(" && ");

  let stdout = "";
  let stderr = "";
  let runOk = false;
  try {
    stdout = await shell(runCommandLine, options.timeoutMs);
    runOk = true;
    verifyExpectedDeviceOutput(stdout, stderr);
  } catch (error) {
    stdout = String(error.stdout ?? "");
    stderr = String(error.stderr ?? "");
    report = baseReport("failed", summary, plan, {
      available: false,
      reason: "capture_command_failed",
      device,
      deviceStdout: stdout,
      deviceStderr: stderr,
      command: runCommandLine,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  await pull(plan.deviceRawPath, localRawPath);
  const raw = validateRawFile(localRawPath, plan.width, plan.height);
  return baseReport("ok", summary, plan, {
    available: true,
    reason: "",
    device,
    rawPath: localRawPath,
    rawByteCount: raw.byteCount,
    rawSha256: raw.sha256,
    deviceRawPath: plan.deviceRawPath,
    deviceStdout: stdout,
    deviceStderr: stderr,
    command: runCommandLine,
    runOk,
  });
}

function baseReport(status, summary, plan, extra) {
  return {
    schema: "unimaker.android_headless_capture.v1",
    status,
    available: extra.available === true,
    reason: extra.reason ?? "",
    error: extra.error ?? "",
    reportPath,
    apkBuildSummary: summary?.__path ?? options.apkBuildSummary,
    apk: summary?.apk ?? "",
    routeState: plan?.routeState ?? options.routeState,
    viewport: options.viewport,
    rawPath: extra.rawPath ?? "",
    rawByteCount: extra.rawByteCount ?? 0,
    rawSha256: extra.rawSha256 ?? "",
    device: extra.device ?? options.device ?? "",
    deviceDir: plan?.deviceDir ?? options.deviceDir,
    deviceRawPath: extra.deviceRawPath ?? plan?.deviceRawPath ?? "",
    command: extra.command ?? "",
    captureEnv: options.captureEnv.map((entry) => ({ name: entry.name, value: entry.value })),
    expectedDeviceOutput: options.expectDeviceOutput,
    hostCapture: plan?.hostCapture ?? null,
    headlessCapture: plan?.headless ?? null,
    pushed: plan ? {
      executable: plan.executable,
      appLibrary: plan.appLib,
      hostLibrary: plan.hostLib,
      assetCount: plan.assets.length,
      assetBytes: plan.assets.reduce((sum, asset) => sum + asset.byteCount, 0),
      assets: plan.assets.map((asset) => ({
        relPath: asset.relPath,
        byteCount: asset.byteCount,
        sha256: asset.sha256,
      })),
    } : null,
    deviceStdout: extra.deviceStdout ?? "",
    deviceStderr: extra.deviceStderr ?? "",
  };
}

function validateRawFile(path, width, height) {
  requireFile(path, "captured raw RGBA");
  const payload = readFileSync(path);
  const expected = 8 + width * height * 4;
  if (payload.length !== expected) {
    fail(`captured raw byte count mismatch: expected ${expected}, got ${payload.length}`);
  }
  const gotWidth = payload.readUInt32LE(0);
  const gotHeight = payload.readUInt32LE(4);
  if (gotWidth !== width || gotHeight !== height) {
    fail(`captured raw viewport mismatch: expected ${width}x${height}, got ${gotWidth}x${gotHeight}`);
  }
  return {
    byteCount: payload.length,
    sha256: createHash("sha256").update(payload).digest("hex"),
  };
}

async function adb(args, timeout) {
  return await runCommand(options.adb, args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function writeReport(value) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function parseViewport(value) {
  const match = String(value).match(/^(\d+)x(\d+)$/);
  if (!match) fail(`invalid --viewport: ${value}`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    fail(`invalid --viewport: ${value}`);
  }
  return [width, height];
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(`${name} must be a positive integer`);
  return parsed;
}

function parseEnvAssignment(value, name) {
  const eq = String(value).indexOf("=");
  if (eq <= 0) fail(`${name} must be KEY=VALUE`);
  const key = String(value).slice(0, eq);
  const rawValue = String(value).slice(eq + 1);
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) fail(`${name} has invalid env key: ${key}`);
  return { name: key, value: rawValue };
}

function formatCaptureEnv(plan) {
  const env = [
    { name: "CHENG_HEADLESS_ASSET_DIR", value: plan.deviceAssetDir },
    { name: "LD_LIBRARY_PATH", value: plan.deviceDir },
    ...options.captureEnv,
  ];
  return env.map((entry) => `${entry.name}=${shq(entry.value)}`).join(" ");
}

function verifyExpectedDeviceOutput(stdout, stderr) {
  if (options.expectDeviceOutput.length <= 0) return;
  const combined = `${stdout}\n${stderr}`;
  for (const expected of options.expectDeviceOutput) {
    if (!combined.includes(expected)) {
      fail(`device output did not include expected text: ${expected}`);
    }
  }
}

function requireFile(path, label) {
  if (!path || !existsSync(path) || !statSync(path).isFile() || statSync(path).size <= 0) {
    fail(`missing ${label}: ${path}`);
  }
}

function resolvePath(value) {
  if (!value) return value;
  return resolve(process.cwd(), value);
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function basename(path) {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(i + 1) : path;
}

function dirnamePosix(path) {
  const i = path.lastIndexOf("/");
  return i > 0 ? path.slice(0, i) : "/";
}

function shq(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function fail(message) {
  throw new Error(message);
}

function helpText() {
  return `Usage: node scripts/unimaker-android-capture-run.mjs --apk-build-summary <summary.json> [options]

Runs the packaged Android headless EGL pbuffer capture executable on an adb device
and pulls back raw RGBA pixels.

Options:
  --apk-build-summary <file>  Required unimaker-apk-build.summary.json
  --out-dir <dir>             Output dir for report/raw
  --raw-out <file>            Raw RGBA output path
  --device <serial>           adb serial; default ANDROID_SERIAL or sole ready device
  --adb <path>                adb command, default adb
  --route-state <route>       Route to capture, default home_default
  --viewport <WxH>            Capture viewport, default 390x844
  --device-dir <path>         Device work dir under /data/local/tmp
  --timeout-ms <ms>           adb run timeout, default 180000
  --capture-env KEY=VALUE     Extra env passed to the headless capture command; repeatable
  --expect-device-output <s>  Require stdout/stderr from device command to contain text; repeatable
  --dry-run                   Validate summary and write a dry-run report without adb
`;
}
