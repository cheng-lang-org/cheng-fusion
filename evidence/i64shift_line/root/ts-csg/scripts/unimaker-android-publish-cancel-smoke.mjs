#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand } from "./process-runner.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(helpText());
  process.exit(0);
}

const outDir = resolvePath(options.outDir || join(packageDir, "tmp", `unimaker-android-publish-cancel-smoke-${Date.now()}`));
mkdirSync(outDir, { recursive: true });
const reportPath = join(outDir, "unimaker-android-publish-cancel-smoke.report.json");

let report = null;
let touchTraceRestore = null;
try {
  const deviceArgs = options.device ? ["-s", options.device] : [];
  const expectedVersionCode = await resolveExpectedVersionCode(options);
  const installed = await installedPackageInfo(deviceArgs);
  if (expectedVersionCode !== undefined && installed.versionCode !== expectedVersionCode) {
    report = baseReport("version_mismatch", expectedVersionCode, installed);
    writeReport(report);
    fail(`installed ${options.packageName} versionCode=${installed.versionCode}; expected ${expectedVersionCode}`);
  }

  if (options.dryRun) {
    report = baseReport("dry_run", expectedVersionCode, installed);
    writeReport(report);
    process.stdout.write("unimaker-android-publish-cancel-smoke dry-run ok\n");
    process.stdout.write(`report: ${reportPath}\n`);
    process.exit(0);
  }

  const previousTouchTrace = (await adb(deviceArgs, ["shell", "getprop", "debug.cheng.touch.trace"], {
    timeout: options.adbTimeoutMs,
  })).trim();
  touchTraceRestore = { deviceArgs, value: previousTouchTrace || "0" };
  await adb(deviceArgs, ["shell", "setprop", "debug.cheng.touch.trace", "1"], { timeout: options.adbTimeoutMs });

  await adb(deviceArgs, ["logcat", "-c"], { timeout: options.adbTimeoutMs });
  await adb(deviceArgs, ["shell", "am", "force-stop", options.packageName], { timeout: options.adbTimeoutMs });
  try {
    await adb(deviceArgs, ["shell", "run-as", options.packageName, "rm", "-f", "files/cheng_published_tasks.jsonl"], { timeout: options.adbTimeoutMs });
  } catch {
    // run-as can fail before first launch; task-file absence is checked after publish.
  }

  const activity = await resolveActivity(deviceArgs);
  await adbShell(deviceArgs, `am start -n ${shellQuote(activity)} --es cheng.computer_use_text ${shellQuote(options.publishText)}`, {
    timeout: options.adbTimeoutMs,
  });
  await sleep(options.publishWaitMs);
  await screencap(deviceArgs, join(outDir, "01-after-publish.png"));

  const taskText = await readTaskFile(deviceArgs);
  const publishLog = await logcat(deviceArgs);
  writeFileSync(join(outDir, "01-after-publish.log"), publishLog);

  await adb(deviceArgs, ["logcat", "-c"], { timeout: options.adbTimeoutMs });
  await adb(deviceArgs, ["shell", "input", "keyevent", "4"], { timeout: options.adbTimeoutMs });
  await sleep(options.backWaitMs);
  await screencap(deviceArgs, join(outDir, "02-after-back.png"));

  await adb(deviceArgs, ["shell", "input", "tap", String(options.cancelTap.x), String(options.cancelTap.y)], { timeout: options.adbTimeoutMs });
  await sleep(options.cancelWaitMs);
  await screencap(deviceArgs, join(outDir, "03-after-cancel.png"));

  const cancelLog = await logcat(deviceArgs);
  const cancelLogPath = join(outDir, "02-back-cancel.log");
  writeFileSync(cancelLogPath, cancelLog);
  const focus = await adb(deviceArgs, ["shell", "dumpsys", "window"], { timeout: options.adbTimeoutMs, maxBuffer: 16 * 1024 * 1024 });
  const checks = evaluate(taskText, publishLog, cancelLog, focus);
  const failures = [];
  if (!checks.taskFilePresent) failures.push("published task file is missing or empty");
  if (!checks.taskHasVideo) failures.push("published task does not contain media_type=video/type=video");
  if (!checks.taskHasTitle) failures.push(`published task does not contain expected title ${options.expectedTitle}`);
  if (!checks.taskHasLocation) failures.push("published task does not contain locationHint");
  if (!checks.publishQueued) failures.push("missing host_publish enqueue_result ok=true");
  if (!checks.publishSnapshot) failures.push("missing distributed_contents_snapshot after publish");
  if (checks.publishSnapshotLatencyMs >= 0 && checks.publishSnapshotLatencyMs > options.maxPublishSnapshotMs) {
    failures.push(`publish snapshot latency=${checks.publishSnapshotLatencyMs}ms; expected <=${options.maxPublishSnapshotMs}ms`);
  }
  if (!checks.backReachedSelector) failures.push("missing on_back_probe route_before=29 route_after=35");
  if (!checks.cancelReachedHome) failures.push("missing cancel route_apply from publish_selector to home_default");
  if (!checks.mediaPreparedForTransition) failures.push("missing transition media surface prepare before cancel route change");
  if (!checks.focusedApp) failures.push(`focused app is not ${options.packageName}`);
  for (const fatal of checks.fatalLines) failures.push(`fatal log: ${fatal}`);
  for (const missing of checks.missingTextureLines) failures.push(`missing texture: ${missing}`);

  report = {
    ...baseReport(failures.length === 0 ? "passed" : "failed", expectedVersionCode, installed),
    activity,
    outDir,
    reportPath,
    cancelLogPath,
    taskText,
    focusSummary: checks.focusSummary,
    checks,
    failures,
    options: publicOptions(),
  };
  writeReport(report);
  if (failures.length > 0) {
    process.stderr.write(`unimaker-android-publish-cancel-smoke failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}\n`);
    process.stderr.write(`report: ${reportPath}\n`);
    await restoreTouchTrace();
    process.exit(1);
  }
  await restoreTouchTrace();
  process.stdout.write("unimaker-android-publish-cancel-smoke ok\n");
  process.stdout.write(`report: ${reportPath}\n`);
  process.stdout.write(`log: ${cancelLogPath}\n`);
} catch (error) {
  report = report ?? baseReport("failed", undefined, null);
  report.error = error instanceof Error ? error.message : String(error);
  report.reportPath = reportPath;
  writeReport(report);
  process.stderr.write(`unimaker-android-publish-cancel-smoke: ${report.error}\n`);
  process.stderr.write(`report: ${reportPath}\n`);
  await restoreTouchTrace();
  process.exit(1);
}

async function restoreTouchTrace() {
  if (touchTraceRestore === null) return;
  const restore = touchTraceRestore;
  touchTraceRestore = null;
  try {
    await adb(restore.deviceArgs, ["shell", "setprop", "debug.cheng.touch.trace", restore.value], {
      timeout: options.adbTimeoutMs,
    });
  } catch {
    // Preserve the primary smoke result; the report still records the failure path.
  }
}

function parseArgs(args) {
  const parsed = {
    adb: process.env.ADB || "adb",
    device: process.env.ANDROID_SERIAL || "",
    packageName: "org.cheng.unimaker.scene",
    apk: "",
    aapt: process.env.AAPT || "",
    expectedVersionCode: undefined,
    outDir: "",
    publishText: "发布短视频 标题 UniMakerTestVideo 描述 Smooth PlaybackE2E",
    expectedTitle: "UniMakerTestVideo",
    // Cancel button visual position on the 1212x2616 reference device is (606, 2447).
    // The old (606, 2350) compensated for a real host-side bug: touch phys->logical
    // used requireSurfaceHeight()'s displayMetrics-clamped (undersized) height while
    // render stretched to the true surfaceFrame height, so hits landed at
    // visual_y * (x_ratio/y_ratio) = 2447 * (1212/388)/(2616/804) = 2447 * 0.96 = 2349.1.
    // Fixed at src/core/tooling/mobile_shell_codegen.cheng requireSurfaceWidth/Height
    // (use holder.surfaceFrame instead of displayMetrics) — tap the true visual position.
    cancelTap: { x: 606, y: 2447 },
    publishWaitMs: 8000,
    backWaitMs: 1200,
    cancelWaitMs: 1500,
    maxPublishSnapshotMs: 1000,
    adbTimeoutMs: 30000,
    logcatTimeoutMs: 30000,
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
    else if (arg === "--package") parsed.packageName = next();
    else if (arg === "--apk") parsed.apk = next();
    else if (arg === "--aapt") parsed.aapt = next();
    else if (arg === "--expected-version-code") parsed.expectedVersionCode = positiveInt(next(), arg);
    else if (arg === "--out-dir") parsed.outDir = next();
    else if (arg === "--publish-text") parsed.publishText = next();
    else if (arg === "--expected-title") parsed.expectedTitle = next();
    else if (arg === "--cancel-tap") parsed.cancelTap = parseTap(next(), arg);
    else if (arg === "--publish-wait-ms") parsed.publishWaitMs = positiveInt(next(), arg);
    else if (arg === "--back-wait-ms") parsed.backWaitMs = positiveInt(next(), arg);
    else if (arg === "--cancel-wait-ms") parsed.cancelWaitMs = positiveInt(next(), arg);
    else if (arg === "--max-publish-snapshot-ms") parsed.maxPublishSnapshotMs = positiveInt(next(), arg);
    else if (arg === "--adb-timeout-ms") parsed.adbTimeoutMs = positiveInt(next(), arg);
    else if (arg === "--logcat-timeout-ms") parsed.logcatTimeoutMs = positiveInt(next(), arg);
    else if (arg === "--dry-run") parsed.dryRun = true;
    else fail(`unknown argument: ${arg}`);
  }
  return parsed;
}

async function resolveExpectedVersionCode(parsed) {
  if (parsed.expectedVersionCode !== undefined) return parsed.expectedVersionCode;
  if (!parsed.apk) return undefined;
  const apk = resolvePath(parsed.apk);
  if (!existsSync(apk)) fail(`missing APK: ${apk}`);
  const aapt = resolveAapt(parsed.aapt);
  const badging = await runCommand(aapt, ["dump", "badging", apk], {
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const match = badging.match(/\bversionCode='(\d+)'/);
  if (!match) fail(`aapt badging did not expose versionCode for ${apk}`);
  return Number(match[1]);
}

function resolveAapt(explicit) {
  const candidates = [
    explicit,
    process.env.AAPT,
    "/Users/lbcheng/Library/Android/sdk/build-tools/30.0.2/aapt",
    "/Users/lbcheng/Library/Android/sdk/build-tools/36.0.0/aapt",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  fail("--apk requires --aapt or an Android SDK aapt in the default locations");
}

async function installedPackageInfo(deviceArgs) {
  const out = await adb(deviceArgs, ["shell", "dumpsys", "package", options.packageName], {
    timeout: options.adbTimeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });
  const versionMatch = out.match(/\bversionCode=(\d+)/);
  const lastUpdateMatch = out.match(/\blastUpdateTime=([^\n]+)/);
  if (!versionMatch) fail(`package is not installed: ${options.packageName}`);
  return {
    packageName: options.packageName,
    versionCode: Number(versionMatch[1]),
    lastUpdateTime: lastUpdateMatch ? lastUpdateMatch[1].trim() : "",
  };
}

async function resolveActivity(deviceArgs) {
  const out = await adb(deviceArgs, ["shell", "cmd", "package", "resolve-activity", "--brief", options.packageName], {
    timeout: options.adbTimeoutMs,
  });
  const lines = out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const activity = lines.find((line) => line.includes("/"));
  return activity || `${options.packageName}/.ChengMainActivity`;
}

async function readTaskFile(deviceArgs) {
  try {
    return await adb(deviceArgs, ["shell", "run-as", options.packageName, "cat", "files/cheng_published_tasks.jsonl"], {
      timeout: options.adbTimeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return "";
  }
}

async function screencap(deviceArgs, path) {
  const png = await runCommand(options.adb, [...deviceArgs, "exec-out", "screencap", "-p"], {
    encoding: "buffer",
    timeout: options.adbTimeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  });
  writeFileSync(path, png);
}

async function logcat(deviceArgs) {
  return await adb(deviceArgs, ["logcat", "-d", "-s", "cheng-mobile-shell", "AndroidRuntime", "libc"], {
    timeout: options.logcatTimeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function evaluate(taskText, publishLog, cancelLog, focus) {
  const allLog = `${publishLog}\n${cancelLog}`;
  const fatalLines = allLog.split(/\r?\n/).filter((line) =>
    /\bFatal signal\b|\bSIGABRT\b|\bFATAL EXCEPTION\b|\bAndroidRuntime\b.*\bFATAL\b/.test(line)
  );
  const missingTextureLines = allLog.split(/\r?\n/).filter((line) => /draw_media_surface missing texture/.test(line));
  const focusSummary = focus.split(/\r?\n/).filter((line) => /mCurrentFocus|mFocusedApp/.test(line)).join("\n");
  const publishTiming = evaluatePublishTiming(publishLog);
  return {
    taskFilePresent: taskText.trim().length > 0,
    taskHasVideo: /"type":"video"|"media_type":"video"|kind=content media_type=video/.test(taskText),
    taskHasTitle: taskText.includes(options.expectedTitle),
    taskHasLocation: /"locationHint":"[^"]+/.test(taskText),
    publishQueued: /host_publish enqueue_result ok=true\b/.test(publishLog),
    publishSnapshot: /distributed_contents_snapshot total=\d+.*first_type=video/.test(publishLog),
    ...publishTiming,
    backReachedSelector: /on_back_probe result=1 route_before=29 route_after=35/.test(cancelLog),
    cancelReachedHome: /input_touch action=1 .*route_before=35 route_after=0 .*route_apply=\d+,35,0,0,-?\d+/.test(cancelLog),
    mediaPreparedForTransition: /prepare_media_surface .*texture=\d+/.test(cancelLog) || /present_media_surface ready .*video=[1-9]\d*/.test(cancelLog),
    focusedApp: focusSummary.includes(options.packageName),
    focusSummary,
    fatalLines,
    missingTextureLines,
  };
}

function evaluatePublishTiming(log) {
  const lines = log.split(/\r?\n/);
  let computerUseMs = -1;
  let enqueueMs = -1;
  let snapshotMs = -1;
  for (const line of lines) {
    const lineMs = lineTimeMs(line);
    if (lineMs < 0) continue;
    if (computerUseMs < 0 && /\bintent_computer_use_text\b/.test(line)) {
      computerUseMs = lineMs;
    }
    if (enqueueMs < 0 && /\bhost_publish enqueue_result ok=true\b/.test(line)) {
      enqueueMs = lineMs;
    }
    if (snapshotMs < 0 && /\bdistributed_contents_snapshot\b.*\bfirst_type=video\b/.test(line)) {
      snapshotMs = normalizeAfter(lineMs, enqueueMs >= 0 ? enqueueMs : computerUseMs);
    }
  }
  return {
    computerUseToEnqueueMs: deltaMs(computerUseMs, enqueueMs),
    publishSnapshotLatencyMs: deltaMs(enqueueMs, snapshotMs),
  };
}

function lineTimeMs(line) {
  const match = line.match(/^(\d\d)-(\d\d)\s+(\d\d):(\d\d):(\d\d)\.(\d{3})\s+/);
  if (!match) return -1;
  return Number(match[3]) * 3600000 +
    Number(match[4]) * 60000 +
    Number(match[5]) * 1000 +
    Number(match[6]);
}

function normalizeAfter(valueMs, startMs) {
  if (valueMs < 0 || startMs < 0) return valueMs;
  let out = valueMs;
  while (out < startMs) out += 24 * 3600000;
  return out;
}

function deltaMs(startMs, endMs) {
  if (startMs < 0 || endMs < 0) return -1;
  return normalizeAfter(endMs, startMs) - startMs;
}

async function adb(deviceArgs, args, runOptions = {}) {
  return await runCommand(options.adb, [...deviceArgs, ...args], {
    encoding: "utf8",
    timeout: runOptions.timeout ?? options.adbTimeoutMs,
    maxBuffer: runOptions.maxBuffer ?? 16 * 1024 * 1024,
  });
}

async function adbShell(deviceArgs, command, runOptions = {}) {
  return await adb(deviceArgs, ["shell", command], runOptions);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function baseReport(status, expectedVersionCode, installed) {
  return {
    schema: "unimaker.android_publish_cancel_smoke.v1",
    status,
    expectedVersionCode,
    installed,
    packageName: options.packageName,
    reportPath,
  };
}

function writeReport(value) {
  writeFileSync(reportPath, `${JSON.stringify(value, null, 2)}\n`);
}

function publicOptions() {
  return {
    publishText: options.publishText,
    expectedTitle: options.expectedTitle,
    cancelTap: options.cancelTap,
    publishWaitMs: options.publishWaitMs,
    backWaitMs: options.backWaitMs,
    cancelWaitMs: options.cancelWaitMs,
    maxPublishSnapshotMs: options.maxPublishSnapshotMs,
  };
}

function parseTap(value, label) {
  const match = String(value).trim().match(/^(\d+),(\d+)$/);
  if (!match) fail(`${label} must be x,y`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

function positiveInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) fail(`${label} must be a positive integer`);
  return n;
}

function resolvePath(path) {
  return resolve(process.cwd(), path);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message) {
  throw new Error(message);
}

function helpText() {
  return `Usage: node scripts/unimaker-android-publish-cancel-smoke.mjs --apk <app-debug.apk> [options]

Validates the installed UniMaker Android publish-back-cancel flow:
publish video -> Android back to publish selector -> tap cancel -> home, with no native crash.

Options:
  --device <serial>                 adb serial; defaults to ANDROID_SERIAL or adb default
  --package <id>                    package id; default org.cheng.unimaker.scene
  --apk <path>                      target APK used only to derive expected versionCode
  --expected-version-code <n>        target installed versionCode when --apk is omitted
  --out-dir <path>                  report/screenshot/log output directory
  --publish-text <text>             computer-use publish command
  --expected-title <text>            expected published title
  --cancel-tap <x,y>                default 606,2447
  --max-publish-snapshot-ms <n>     max enqueue->feed snapshot latency, default 1000
  --dry-run                         only verify installed target version
`;
}
