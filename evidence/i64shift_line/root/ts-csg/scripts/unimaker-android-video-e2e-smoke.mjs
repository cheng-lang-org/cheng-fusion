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

const outDir = resolvePath(options.outDir || join(packageDir, "tmp", `unimaker-android-video-e2e-smoke-${Date.now()}`));
mkdirSync(outDir, { recursive: true });
const reportPath = join(outDir, "unimaker-android-video-e2e-smoke.report.json");

let report = null;
const phases = [];
try {
  requireTarget();

  const publish = await runPhase("publish_cancel", "unimaker-android-publish-cancel-smoke.mjs", publishArgs());
  phases.push(publish);
  if (!publish.ok) {
    throw new Error(`publish_cancel failed: ${phaseError(publish)}`);
  }

  const playback = await runPhase("playback", "unimaker-android-playback-smoke.mjs", playbackArgs());
  phases.push(playback);
  if (!playback.ok) {
    throw new Error(`playback failed: ${phaseError(playback)}`);
  }

  report = baseReport(options.dryRun ? "dry_run" : "passed", phases);
  writeReport(report);
  process.stdout.write("unimaker-android-video-e2e-smoke ok\n");
  process.stdout.write(`report: ${reportPath}\n`);
} catch (error) {
  report = report ?? baseReport("failed", phases);
  report.status = "failed";
  report.error = error instanceof Error ? error.message : String(error);
  writeReport(report);
  process.stderr.write(`unimaker-android-video-e2e-smoke: ${report.error}\n`);
  process.stderr.write(`report: ${reportPath}\n`);
  process.exit(1);
}

function requireTarget() {
  if (!options.apk && options.expectedVersionCode === undefined) {
    fail("provide --apk or --expected-version-code so the e2e smoke cannot run against a stale installed APK");
  }
}

async function runPhase(name, scriptName, args) {
  const phaseDir = join(outDir, name);
  mkdirSync(phaseDir, { recursive: true });
  const stdoutPath = join(phaseDir, `${name}.stdout.txt`);
  const stderrPath = join(phaseDir, `${name}.stderr.txt`);
  const fullArgs = [join(scriptDir, scriptName), ...args, "--out-dir", phaseDir];
  const startedAt = new Date().toISOString();
  try {
    await runCommand(process.execPath, fullArgs, {
      cwd: packageDir,
      encoding: "utf8",
      timeout: options.phaseTimeoutMs,
      maxBuffer: 128 * 1024 * 1024,
      stdoutPath,
      stderrPath,
    });
    return phaseRecord(name, phaseDir, stdoutPath, stderrPath, startedAt, true);
  } catch (error) {
    const record = phaseRecord(name, phaseDir, stdoutPath, stderrPath, startedAt, false);
    record.error = error instanceof Error ? error.message : String(error);
    record.status = error?.status ?? null;
    return record;
  }
}

function phaseRecord(name, phaseDir, stdoutPath, stderrPath, startedAt, ok) {
  const report = readPhaseReport(phaseDir);
  return {
    name,
    ok,
    startedAt,
    finishedAt: new Date().toISOString(),
    outDir: phaseDir,
    stdoutPath,
    stderrPath,
    reportPath: report?.reportPath ?? "",
    reportStatus: report?.status ?? "",
    failures: Array.isArray(report?.failures) ? report.failures : [],
    checks: report?.checks ?? null,
    visualChecks: report?.visualChecks ?? null,
    audioDumpChecks: report?.audioDumpChecks ?? null,
    expectedVersionCode: report?.expectedVersionCode,
    installed: report?.installed ?? null,
  };
}

function readPhaseReport(phaseDir) {
  const candidates = [
    join(phaseDir, "unimaker-android-publish-cancel-smoke.report.json"),
    join(phaseDir, "unimaker-android-playback-smoke.report.json"),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      return JSON.parse(readFileSync(candidate, "utf8"));
    } catch {
      return null;
    }
  }
  return null;
}

function phaseError(phase) {
  if (phase.failures.length > 0) return phase.failures.join("; ");
  if (phase.reportStatus) return phase.reportStatus;
  return phase.error || "unknown";
}

function publishArgs() {
  const args = commonArgs();
  args.push("--publish-text", options.publishText);
  args.push("--expected-title", options.expectedTitle);
  if (options.cancelTap) args.push("--cancel-tap", options.cancelTap);
  if (options.publishWaitMs > 0) args.push("--publish-wait-ms", String(options.publishWaitMs));
  if (options.backWaitMs > 0) args.push("--back-wait-ms", String(options.backWaitMs));
  if (options.cancelWaitMs > 0) args.push("--cancel-wait-ms", String(options.cancelWaitMs));
  args.push("--max-publish-snapshot-ms", String(options.maxPublishSnapshotMs));
  if (options.dryRun) args.push("--dry-run");
  return args;
}

function playbackArgs() {
  const args = commonArgs();
  args.push("--min-media-frames", String(options.minMediaFrames));
  args.push("--min-media-refreshes", String(options.minMediaRefreshes));
  args.push("--min-eos-presentation-us", String(options.minEosPresentationUs));
  args.push("--max-steady-media-frame-p95-ms", String(options.maxSteadyMediaFrameP95Ms));
  args.push("--max-steady-media-frame-max-ms", String(options.maxSteadyMediaFrameMaxMs));
  args.push("--playback-wait-ms", String(options.playbackWaitMs));
  if (options.requireEos) args.push("--require-eos");
  if (options.noRequireAudio) args.push("--no-require-audio");
  if (options.noRequireAudioFocus) args.push("--no-require-audio-focus");
  if (options.dryRun) args.push("--dry-run");
  return args;
}

function commonArgs() {
  const args = [];
  if (options.device) args.push("--device", options.device);
  if (options.packageName) args.push("--package", options.packageName);
  if (options.apk) args.push("--apk", options.apk);
  if (options.expectedVersionCode !== undefined) args.push("--expected-version-code", String(options.expectedVersionCode));
  if (options.aapt) args.push("--aapt", options.aapt);
  args.push("--adb-timeout-ms", String(options.adbTimeoutMs));
  args.push("--logcat-timeout-ms", String(options.logcatTimeoutMs));
  return args;
}

function baseReport(status, phases) {
  return {
    schema: "unimaker.android_video_e2e_smoke.v1",
    status,
    outDir,
    reportPath,
    packageName: options.packageName,
    apk: options.apk,
    expectedVersionCode: options.expectedVersionCode,
    phases,
    options: publicOptions(),
  };
}

function writeReport(value) {
  writeFileSync(reportPath, `${JSON.stringify(value, null, 2)}\n`);
}

function publicOptions() {
  return {
    publishText: options.publishText,
    expectedTitle: options.expectedTitle,
    maxPublishSnapshotMs: options.maxPublishSnapshotMs,
    minMediaFrames: options.minMediaFrames,
    minMediaRefreshes: options.minMediaRefreshes,
    minEosPresentationUs: options.minEosPresentationUs,
    requireEos: options.requireEos,
    playbackWaitMs: options.playbackWaitMs,
    dryRun: options.dryRun,
  };
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
    // See unimaker-android-publish-cancel-smoke.mjs: 2350 compensated for the host
    // requireSurfaceHeight() y-axis bug (fixed in mobile_shell_codegen.cheng); true
    // visual cancel-button position is (606, 2447).
    cancelTap: "606,2447",
    publishWaitMs: 8000,
    backWaitMs: 1200,
    cancelWaitMs: 1500,
    maxPublishSnapshotMs: 1000,
    minMediaFrames: 120,
    minMediaRefreshes: 120,
    minEosPresentationUs: 6000000,
    maxSteadyMediaFrameP95Ms: 60,
    maxSteadyMediaFrameMaxMs: 90,
    playbackWaitMs: 7500,
    requireEos: true,
    noRequireAudio: false,
    noRequireAudioFocus: false,
    adbTimeoutMs: 30000,
    logcatTimeoutMs: 30000,
    phaseTimeoutMs: 180000,
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
    else if (arg === "--device") parsed.device = next();
    else if (arg === "--package") parsed.packageName = next();
    else if (arg === "--apk") parsed.apk = resolvePath(next());
    else if (arg === "--aapt") parsed.aapt = next();
    else if (arg === "--expected-version-code") parsed.expectedVersionCode = positiveInt(next(), arg);
    else if (arg === "--out-dir") parsed.outDir = next();
    else if (arg === "--publish-text") parsed.publishText = next();
    else if (arg === "--expected-title") parsed.expectedTitle = next();
    else if (arg === "--cancel-tap") parsed.cancelTap = parseTapText(next(), arg);
    else if (arg === "--publish-wait-ms") parsed.publishWaitMs = positiveInt(next(), arg);
    else if (arg === "--back-wait-ms") parsed.backWaitMs = positiveInt(next(), arg);
    else if (arg === "--cancel-wait-ms") parsed.cancelWaitMs = positiveInt(next(), arg);
    else if (arg === "--max-publish-snapshot-ms") parsed.maxPublishSnapshotMs = positiveInt(next(), arg);
    else if (arg === "--min-media-frames") parsed.minMediaFrames = positiveInt(next(), arg);
    else if (arg === "--min-media-refreshes") parsed.minMediaRefreshes = positiveInt(next(), arg);
    else if (arg === "--min-eos-presentation-us") parsed.minEosPresentationUs = positiveInt(next(), arg);
    else if (arg === "--max-steady-media-frame-p95-ms") parsed.maxSteadyMediaFrameP95Ms = positiveInt(next(), arg);
    else if (arg === "--max-steady-media-frame-max-ms") parsed.maxSteadyMediaFrameMaxMs = positiveInt(next(), arg);
    else if (arg === "--playback-wait-ms") parsed.playbackWaitMs = positiveInt(next(), arg);
    else if (arg === "--no-require-eos") parsed.requireEos = false;
    else if (arg === "--no-require-audio") parsed.noRequireAudio = true;
    else if (arg === "--no-require-audio-focus") parsed.noRequireAudioFocus = true;
    else if (arg === "--adb-timeout-ms") parsed.adbTimeoutMs = positiveInt(next(), arg);
    else if (arg === "--logcat-timeout-ms") parsed.logcatTimeoutMs = positiveInt(next(), arg);
    else if (arg === "--phase-timeout-ms") parsed.phaseTimeoutMs = positiveInt(next(), arg);
    else if (arg === "--dry-run") parsed.dryRun = true;
    else fail(`unknown argument: ${arg}`);
  }
  return parsed;
}

function parseTapText(value, label) {
  const text = String(value).trim();
  if (!/^\d+,\d+$/.test(text)) fail(`${label} must be x,y`);
  return text;
}

function positiveInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) fail(`${label} must be a positive integer`);
  return n;
}

function resolvePath(path) {
  return resolve(process.cwd(), path);
}

function fail(message) {
  throw new Error(message);
}

function helpText() {
  return `Usage: node scripts/unimaker-android-video-e2e-smoke.mjs --apk <app-debug.apk> [options]

Runs the strict installed-APK video e2e gate:
computer-use video publish -> publish/back/cancel proof -> video playback proof with audio and EOS.

Options:
  --device <serial>                 adb serial; defaults to ANDROID_SERIAL or adb default
  --package <id>                    package id; default org.cheng.unimaker.scene
  --apk <path>                      target APK used to derive expected versionCode
  --expected-version-code <n>        target installed versionCode when --apk is omitted
  --out-dir <path>                  report/log output directory
  --publish-text <text>             computer-use publish command
  --expected-title <text>            expected published title
  --max-publish-snapshot-ms <n>      max publish enqueue -> feed snapshot latency, default 1000
  --min-media-frames <n>            default 120
  --min-media-refreshes <n>         default 120
  --min-eos-presentation-us <n>     default 6000000
  --no-require-eos                  do not require media_playback_eos
  --dry-run                         only verify installed target version in both sub-smokes
`;
}
