#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { runCommand } from "./process-runner.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(helpText());
  process.exit(0);
}

const outDir = resolvePath(options.outDir || join(packageDir, "tmp", `unimaker-android-playback-smoke-${Date.now()}`));
mkdirSync(outDir, { recursive: true });
const reportPath = join(outDir, "unimaker-android-playback-smoke.report.json");

let report = null;
let mediaTracePropertyEnabled = false;
let mediaTraceDeviceArgs = [];
try {
  const deviceArgs = options.device ? ["-s", options.device] : [];
  mediaTraceDeviceArgs = deviceArgs;
  const expectedVersionCode = await resolveExpectedVersionCode(options);
  const installed = await installedPackageInfo(deviceArgs);
  if (expectedVersionCode !== undefined && installed.versionCode !== expectedVersionCode) {
    report = baseReport("version_mismatch", expectedVersionCode, installed);
    fail(`installed ${options.packageName} versionCode=${installed.versionCode}; expected ${expectedVersionCode}. Install the target APK before playback smoke.`);
  }

  if (options.dryRun) {
    report = baseReport("dry_run", expectedVersionCode, installed);
    writeReport(report);
    process.stdout.write("unimaker-android-playback-smoke dry-run ok\n");
    process.stdout.write(`report: ${reportPath}\n`);
    process.exit(0);
  }

  await adb(deviceArgs, ["shell", "setprop", "debug.cheng.media.trace", "1"], { timeout: options.adbTimeoutMs });
  mediaTracePropertyEnabled = true;
  await adb(deviceArgs, ["logcat", "-c"], { timeout: options.adbTimeoutMs });
  await adb(deviceArgs, ["shell", "am", "force-stop", options.packageName], { timeout: options.adbTimeoutMs });
  const activity = await resolveActivity(deviceArgs);
  await adb(deviceArgs, ["shell", "am", "start", "-n", activity], { timeout: options.adbTimeoutMs });
  await sleep(options.initialWaitMs);
  await screencap(deviceArgs, join(outDir, "00-launch.png"));

  const screenshotPaths = [];
  for (let index = 0; index < options.taps.length; index += 1) {
    const tap = options.taps[index];
    await adb(deviceArgs, ["shell", "input", "tap", String(tap.x), String(tap.y)], { timeout: options.adbTimeoutMs });
    await sleep(index === options.taps.length - 1 ? options.playbackWaitMs : options.afterTapWaitMs);
    const screenshotPath = join(outDir, `${String(index + 1).padStart(2, "0")}-tap-${tap.x}-${tap.y}.png`);
    await screencap(deviceArgs, screenshotPath);
    screenshotPaths.push(screenshotPath);
  }

  const audioDumpPath = join(outDir, "audio-dumpsys.txt");
  let audioDump = "";
  try {
    audioDump = await adb(deviceArgs, ["shell", "dumpsys", "audio"], {
      timeout: options.adbTimeoutMs,
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    audioDump = `dumpsys audio failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  writeFileSync(audioDumpPath, audioDump);

  const logcat = await adb(deviceArgs, ["logcat", "-d", "-s", "cheng-mobile-shell"], {
    timeout: options.logcatTimeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  const logPath = join(outDir, "cheng-mobile-shell.log");
  writeFileSync(logPath, logcat);

  const checks = evaluateLogs(logcat);
  const visualChecks = await evaluateFinalScreenshot(screenshotPaths[screenshotPaths.length - 1]);
  const audioDumpChecks = evaluateAudioDump(audioDump);
  const failures = [];
  if (!checks.inputInvalidate) failures.push("missing cache_compositor invalidate reason=input_event");
  if (!checks.mediaSurfaceReady) failures.push("missing present_media_surface ready/commit with video>0");
  if (!checks.compositorFrame) failures.push("missing present_compositor frame");
  if (options.requireAudio && !checks.localAudioConfigured) failures.push("missing local_audio configured");
  if (options.requireAudio && !checks.localAudioStarted) failures.push("missing local_audio_playback_started");
  if (options.requireAudio && !checks.localAudioNonSilent) {
    failures.push(`local audio callback stayed silent: callback_peak=${checks.maxLocalAudioCallbackPeak} callback_nonzero=${checks.localAudioCallbackNonzeroSamples}`);
  }
  if (options.requireAudio && !audioDumpChecks.hasStartedAAudioMedia) {
    failures.push("dumpsys audio did not show a started AAudio USAGE_MEDIA player");
  }
  if (options.requireAudio && options.requireAudioFocus && !checks.audioFocusGranted) {
    failures.push("missing audio_focus_request granted=true");
  }
  if (options.requireAudio && options.minMediaVolume > 0 && audioDumpChecks.mediaStreamVolume < options.minMediaVolume) {
    failures.push(`STREAM_MUSIC volume=${audioDumpChecks.mediaStreamVolume}; expected >=${options.minMediaVolume}`);
  }
  if (options.requireAudio && audioDumpChecks.mediaStreamMuted) {
    failures.push("STREAM_MUSIC is muted");
  }
  if (visualChecks.centerPlayOverlayVisible) {
    failures.push(`center play overlay still visible after playback tap: component_area=${visualChecks.maxWhiteComponent.area}`);
  }
  if (checks.maxMediaFrame < options.minMediaFrames) {
    failures.push(`media_playback_frame max=${checks.maxMediaFrame}; expected >=${options.minMediaFrames}`);
  }
  if (checks.cachedMediaRefreshCount < options.minMediaRefreshes) {
    failures.push(`cached_compositor_media_refresh count=${checks.cachedMediaRefreshCount}; expected >=${options.minMediaRefreshes}`);
  }
  if (options.requireEos && !checks.mediaPlaybackEos) {
    failures.push("missing media_playback_eos; playback did not reach end of stream");
  }
  if (options.minEosPresentationUs > 0 && checks.maxPresentationUs < options.minEosPresentationUs) {
    failures.push(`media presentation_us=${checks.maxPresentationUs}; expected >=${options.minEosPresentationUs}`);
  }
  if (checks.mediaFramePacing.count >= 20 && checks.mediaFramePacing.steadyP95Ms > options.maxSteadyMediaFrameP95Ms) {
    failures.push(`media frame pacing p95=${checks.mediaFramePacing.steadyP95Ms}ms; expected <=${options.maxSteadyMediaFrameP95Ms}ms`);
  }
  if (checks.mediaFramePacing.count >= 20 && checks.mediaFramePacing.steadyMaxMs > options.maxSteadyMediaFrameMaxMs) {
    failures.push(`media frame pacing max=${checks.mediaFramePacing.steadyMaxMs}ms; expected <=${options.maxSteadyMediaFrameMaxMs}ms`);
  }
  for (const fatal of checks.fatalLines) failures.push(`fatal log: ${fatal}`);

  report = {
    ...baseReport(failures.length === 0 ? "passed" : "failed", expectedVersionCode, installed),
    activity,
    outDir,
    reportPath,
    logPath,
    audioDumpPath,
    screenshots: screenshotPaths,
    checks,
    visualChecks,
    audioDumpChecks,
    failures,
    options: publicOptions(),
  };
  writeReport(report);
  if (failures.length > 0) {
    await resetMediaTraceIfNeeded();
    process.stderr.write(`unimaker-android-playback-smoke failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}\n`);
    process.stderr.write(`report: ${reportPath}\n`);
    process.exit(1);
  }
  await resetMediaTraceIfNeeded();
  process.stdout.write("unimaker-android-playback-smoke ok\n");
  process.stdout.write(`report: ${reportPath}\n`);
  process.stdout.write(`log: ${logPath}\n`);
} catch (error) {
  await resetMediaTraceIfNeeded();
  report = report ?? baseReport("failed", undefined, null);
  report.error = error instanceof Error ? error.message : String(error);
  report.reportPath = reportPath;
  writeReport(report);
  process.stderr.write(`unimaker-android-playback-smoke: ${report.error}\n`);
  process.stderr.write(`report: ${reportPath}\n`);
  process.exit(1);
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
    taps: [
      { x: 260, y: 520 },
      { x: 410, y: 390 },
    ],
    minMediaFrames: 12,
    minMediaRefreshes: 2,
    minMediaVolume: 0,
    minEosPresentationUs: 0,
    maxSteadyMediaFrameP95Ms: 60,
    maxSteadyMediaFrameMaxMs: 90,
    requireAudio: true,
    requireAudioFocus: true,
    requireEos: false,
    initialWaitMs: 3500,
    afterTapWaitMs: 1400,
    playbackWaitMs: 6500,
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
    else if (arg === "--tap") parsed.taps.push(parseTap(next(), arg));
    else if (arg === "--replace-default-taps") parsed.taps = [];
    else if (arg === "--min-media-frames") parsed.minMediaFrames = positiveInt(next(), arg);
    else if (arg === "--min-media-refreshes") parsed.minMediaRefreshes = positiveInt(next(), arg);
    else if (arg === "--min-media-volume") parsed.minMediaVolume = positiveInt(next(), arg);
    else if (arg === "--min-eos-presentation-us") parsed.minEosPresentationUs = positiveInt(next(), arg);
    else if (arg === "--max-steady-media-frame-p95-ms") parsed.maxSteadyMediaFrameP95Ms = positiveInt(next(), arg);
    else if (arg === "--max-steady-media-frame-max-ms") parsed.maxSteadyMediaFrameMaxMs = positiveInt(next(), arg);
    else if (arg === "--no-require-audio") parsed.requireAudio = false;
    else if (arg === "--no-require-audio-focus") parsed.requireAudioFocus = false;
    else if (arg === "--require-eos") parsed.requireEos = true;
    else if (arg === "--initial-wait-ms") parsed.initialWaitMs = positiveInt(next(), arg);
    else if (arg === "--after-tap-wait-ms") parsed.afterTapWaitMs = positiveInt(next(), arg);
    else if (arg === "--playback-wait-ms") parsed.playbackWaitMs = positiveInt(next(), arg);
    else if (arg === "--adb-timeout-ms") parsed.adbTimeoutMs = positiveInt(next(), arg);
    else if (arg === "--logcat-timeout-ms") parsed.logcatTimeoutMs = positiveInt(next(), arg);
    else if (arg === "--dry-run") parsed.dryRun = true;
    else fail(`unknown argument: ${arg}`);
  }
  if (parsed.taps.length <= 0) fail("at least one --tap is required");
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
  if (!activity) return `${options.packageName}/.ChengMainActivity`;
  return activity;
}

async function screencap(deviceArgs, path) {
  const png = await runCommand(options.adb, [...deviceArgs, "exec-out", "screencap", "-p"], {
    encoding: "buffer",
    timeout: options.adbTimeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  });
  writeFileSync(path, png);
}

function evaluateLogs(logcat) {
  const lines = logcat.split(/\r?\n/);
  let maxMediaFrame = 0;
  let cachedMediaRefreshCount = 0;
  let maxPresentationUs = -1;
  let mediaPlaybackEos = false;
  let mediaPlaybackEosPresentationUs = -1;
  let mediaSurfaceReady = false;
  let compositorFrame = false;
  let inputInvalidate = false;
  let localAudioConfigured = false;
  let localAudioStarted = false;
  let maxLocalAudioPeak = 0;
  let maxLocalAudioCallbackPeak = 0;
  let localAudioDecodedNonzeroSamples = 0;
  let localAudioCallbackNonzeroSamples = 0;
  let audioFocusGranted = false;
  const fatalLines = [];
  const mediaFrameTimesMs = [];
  for (const line of lines) {
    const timeMatch = line.match(/^(\d\d)-(\d\d)\s+(\d\d):(\d\d):(\d\d)\.(\d{3})\s+/);
    const frameMatch = line.match(/\bmedia_playback_frame\b.*\bframe=(\d+)/);
    if (frameMatch) {
      maxMediaFrame = Math.max(maxMediaFrame, Number(frameMatch[1]));
      const presentationMatch = line.match(/\bpresentation_us=(-?\d+)/);
      if (presentationMatch) maxPresentationUs = Math.max(maxPresentationUs, Number(presentationMatch[1]));
      if (timeMatch) {
        mediaFrameTimesMs.push(
          Number(timeMatch[3]) * 3600000 +
          Number(timeMatch[4]) * 60000 +
          Number(timeMatch[5]) * 1000 +
          Number(timeMatch[6])
        );
      }
    }
    const eosMatch = line.match(/\bmedia_playback_eos\b.*\bpresentation_us=(-?\d+)/);
    if (eosMatch) {
      mediaPlaybackEos = true;
      mediaPlaybackEosPresentationUs = Math.max(mediaPlaybackEosPresentationUs, Number(eosMatch[1]));
      maxPresentationUs = Math.max(maxPresentationUs, Number(eosMatch[1]));
    }
    if (/\bcached_compositor_media_refresh\b/.test(line)) cachedMediaRefreshCount += 1;
    if (/\bpresent_media_surface\b.*\b(video=[1-9]\d*)/.test(line) && /\b(ready|commit)\b/.test(line)) mediaSurfaceReady = true;
    if (/\bpresent_compositor frame=\d+/.test(line)) compositorFrame = true;
    if (/\bcache_compositor invalidate reason=(?:input_event|input_drain)\b/.test(line)) inputInvalidate = true;
    if (/\blocal_audio configured\b/.test(line)) localAudioConfigured = true;
    if (/\blocal_audio_playback_started\b/.test(line)) localAudioStarted = true;
    if (/\baudio_focus_request\b.*\bgranted=true\b/.test(line)) audioFocusGranted = true;
    const localAudioPeakMatch = line.match(/\blocal_audio_(?:frame|playback_started)\b.*\bpeak=(\d+)/);
    if (localAudioPeakMatch) maxLocalAudioPeak = Math.max(maxLocalAudioPeak, Number(localAudioPeakMatch[1]));
    const localAudioDecodedMatch = line.match(/\blocal_audio_(?:frame|playback_started)\b.*\bdecoded_nonzero=(\d+)/);
    if (localAudioDecodedMatch) localAudioDecodedNonzeroSamples = Math.max(localAudioDecodedNonzeroSamples, Number(localAudioDecodedMatch[1]));
    const localAudioCallbackPeakMatch = line.match(/\blocal_audio_(?:frame|playback_started)\b.*\bcallback_peak=(\d+)/);
    if (localAudioCallbackPeakMatch) maxLocalAudioCallbackPeak = Math.max(maxLocalAudioCallbackPeak, Number(localAudioCallbackPeakMatch[1]));
    const localAudioCallbackNonzeroMatch = line.match(/\blocal_audio_(?:frame|playback_started)\b.*\bcallback_nonzero=(\d+)/);
    if (localAudioCallbackNonzeroMatch) localAudioCallbackNonzeroSamples = Math.max(localAudioCallbackNonzeroSamples, Number(localAudioCallbackNonzeroMatch[1]));
    if (/\b(FATAL EXCEPTION|SIGSEGV|SIGABRT|local_audio .*failed|media_playback_.*failed)\b/.test(line)) {
      fatalLines.push(line.trim());
    }
  }
  const localAudioNonSilent = maxLocalAudioCallbackPeak > 0 && localAudioCallbackNonzeroSamples > 0;
  const mediaFramePacing = summarizeFramePacing(mediaFrameTimesMs);
  return {
    lineCount: lines.length,
    maxMediaFrame,
    maxPresentationUs,
    mediaPlaybackEos,
    mediaPlaybackEosPresentationUs,
    cachedMediaRefreshCount,
    mediaSurfaceReady,
    compositorFrame,
    inputInvalidate,
    localAudioConfigured,
    localAudioStarted,
    maxLocalAudioPeak,
    maxLocalAudioCallbackPeak,
    localAudioDecodedNonzeroSamples,
    localAudioCallbackNonzeroSamples,
    localAudioNonSilent,
    audioFocusGranted,
    mediaFramePacing,
    fatalLines,
  };
}

async function evaluateFinalScreenshot(path) {
  if (!path) {
    return {
      path,
      centerPlayOverlayVisible: false,
      maxWhiteComponent: { area: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 },
    };
  }
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const roi = {
    x0: Math.floor(info.width * 0.18),
    y0: Math.floor(info.height * 0.25),
    x1: Math.ceil(info.width * 0.82),
    y1: Math.ceil(info.height * 0.78),
  };
  const roiW = roi.x1 - roi.x0;
  const roiH = roi.y1 - roi.y0;
  const mask = new Uint8Array(roiW * roiH);
  const seen = new Uint8Array(roiW * roiH);
  for (let y = 0; y < roiH; y += 1) {
    for (let x = 0; x < roiW; x += 1) {
      const sourceIndex = ((roi.y0 + y) * info.width + roi.x0 + x) * info.channels;
      const r = data[sourceIndex];
      const g = data[sourceIndex + 1];
      const b = data[sourceIndex + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (r >= 220 && g >= 220 && b >= 220 && max - min <= 28) {
        mask[y * roiW + x] = 1;
      }
    }
  }
  const stack = [];
  let maxComponent = { area: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
  for (let y = 0; y < roiH; y += 1) {
    for (let x = 0; x < roiW; x += 1) {
      const start = y * roiW + x;
      if (!mask[start] || seen[start]) continue;
      seen[start] = 1;
      stack.length = 0;
      stack.push(start);
      let area = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      while (stack.length > 0) {
        const index = stack.pop();
        const cx = index % roiW;
        const cy = Math.floor(index / roiW);
        area += 1;
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;
        for (const next of [index - 1, index + 1, index - roiW, index + roiW]) {
          if (next < 0 || next >= mask.length || seen[next] || !mask[next]) continue;
          const nx = next % roiW;
          if ((nx === 0 && cx === roiW - 1) || (nx === roiW - 1 && cx === 0)) continue;
          seen[next] = 1;
          stack.push(next);
        }
      }
      if (area > maxComponent.area) {
        maxComponent = {
          area,
          minX: minX + roi.x0,
          minY: minY + roi.y0,
          maxX: maxX + roi.x0,
          maxY: maxY + roi.y0,
        };
      }
    }
  }
  const componentW = maxComponent.maxX - maxComponent.minX + 1;
  const componentH = maxComponent.maxY - maxComponent.minY + 1;
  const componentCx = (maxComponent.minX + maxComponent.maxX) / 2;
  const componentCy = (maxComponent.minY + maxComponent.maxY) / 2;
  const aspect = componentH > 0 ? componentW / componentH : 0;
  const minArea = Math.max(7000, Math.floor(info.width * info.height * 0.0035));
  const minDim = Math.floor(info.width * 0.08);
  const maxDim = Math.floor(info.width * 0.36);
  const centerPlayOverlayVisible =
    maxComponent.area >= minArea &&
    componentW >= minDim &&
    componentH >= minDim &&
    componentW <= maxDim &&
    componentH <= maxDim &&
    aspect >= 0.45 &&
    aspect <= 1.65 &&
    componentCx >= info.width * 0.25 &&
    componentCx <= info.width * 0.75 &&
    componentCy >= info.height * 0.28 &&
    componentCy <= info.height * 0.72;
  return {
    path,
    width: info.width,
    height: info.height,
    centerPlayOverlayVisible,
    maxWhiteComponent: maxComponent,
    maxWhiteComponentAspect: aspect,
  };
}

function evaluateAudioDump(audioDump) {
  const music = streamSection(audioDump, "STREAM_MUSIC");
  const currentSpeaker = music.match(/\bCurrent:\s*[^:\n]*:\s*(\d+)/);
  const streamVolume = music.match(/\bstreamVolume:(\d+)/);
  const maxVolume = music.match(/\bMax:\s*(\d+)/);
  const muted = music.match(/^\s*Muted:\s*(true|false)\s*$/m);
  return {
    hasStartedAAudioMedia: /\btype[:=]AAudio\b[^\n]*\bstate:started\b[^\n]*\bUSAGE_MEDIA\b/.test(audioDump),
    hasAAudio: /\btype[:=]AAudio\b/.test(audioDump),
    hasUsageMedia: /\bUSAGE_MEDIA\b/.test(audioDump),
    mediaStreamVolume: currentSpeaker ? Number(currentSpeaker[1]) : (streamVolume ? Number(streamVolume[1]) : -1),
    mediaStreamMaxVolume: maxVolume ? Number(maxVolume[1]) : -1,
    mediaStreamMuted: muted ? muted[1] === "true" : false,
  };
}

function streamSection(audioDump, streamName) {
  const start = audioDump.indexOf(`- ${streamName}:`);
  if (start < 0) return "";
  const rest = audioDump.slice(start);
  const next = rest.slice(1).search(/\n- STREAM_[A-Z_]+:/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

function summarizeFramePacing(timesMs) {
  const deltas = [];
  for (let i = 1; i < timesMs.length; i += 1) {
    const delta = timesMs[i] - timesMs[i - 1];
    if (delta > 0) deltas.push(delta);
  }
  const steady = deltas.slice(Math.min(3, deltas.length));
  return {
    count: timesMs.length,
    minMs: percentile(deltas, 0),
    p50Ms: percentile(deltas, 0.5),
    p95Ms: percentile(deltas, 0.95),
    maxMs: percentile(deltas, 1),
    steadyP95Ms: percentile(steady, 0.95),
    steadyMaxMs: percentile(steady, 1),
    over67Ms: deltas.filter((delta) => delta > 67).length,
  };
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

async function adb(deviceArgs, args, runOptions = {}) {
  return await runCommand(options.adb, [...deviceArgs, ...args], {
    encoding: "utf8",
    timeout: runOptions.timeout ?? options.adbTimeoutMs,
    maxBuffer: runOptions.maxBuffer ?? 16 * 1024 * 1024,
  });
}

function baseReport(status, expectedVersionCode, installed) {
  return {
    schema: "unimaker.android_playback_smoke.v1",
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

async function resetMediaTraceIfNeeded() {
  if (!mediaTracePropertyEnabled) return;
  mediaTracePropertyEnabled = false;
  try {
    await adb(mediaTraceDeviceArgs, ["shell", "setprop", "debug.cheng.media.trace", "0"], { timeout: options.adbTimeoutMs });
  } catch {
    // The smoke has already collected its decisive evidence; avoid masking the real result.
  }
}

function publicOptions() {
  return {
    taps: options.taps,
    minMediaFrames: options.minMediaFrames,
    minMediaRefreshes: options.minMediaRefreshes,
    minMediaVolume: options.minMediaVolume,
    minEosPresentationUs: options.minEosPresentationUs,
    maxSteadyMediaFrameP95Ms: options.maxSteadyMediaFrameP95Ms,
    maxSteadyMediaFrameMaxMs: options.maxSteadyMediaFrameMaxMs,
    requireAudio: options.requireAudio,
    requireAudioFocus: options.requireAudioFocus,
    requireEos: options.requireEos,
    mediaTraceProperty: "debug.cheng.media.trace=1",
    initialWaitMs: options.initialWaitMs,
    afterTapWaitMs: options.afterTapWaitMs,
    playbackWaitMs: options.playbackWaitMs,
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
  return `Usage: node scripts/unimaker-android-playback-smoke.mjs --apk <app-debug.apk> [options]

Validates installed UniMaker Android playback by launching the app, tapping the video flow,
capturing screenshots, and hard-failing unless logcat proves video frames, audio, and compositor refresh.

Options:
  --device <serial>                 adb serial; defaults to ANDROID_SERIAL or adb default
  --package <id>                    package id; default org.cheng.unimaker.scene
  --apk <path>                      target APK used only to derive expected versionCode
  --expected-version-code <n>        target installed versionCode when --apk is omitted
  --out-dir <path>                  report/screenshot output directory
  --replace-default-taps            clear built-in taps before adding --tap entries
  --tap <x,y>                       tap coordinate; may be repeated
  --min-media-frames <n>            default 12
  --min-media-refreshes <n>         default 2
  --min-media-volume <n>            default 0; disabled unless explicitly set
  --min-eos-presentation-us <n>     require final presentation_us lower bound
  --max-steady-media-frame-p95-ms <n> default 60
  --max-steady-media-frame-max-ms <n> default 90
  --no-require-audio                skip local_audio checks
  --no-require-audio-focus          skip AudioFocus grant check
  --require-eos                     require media_playback_eos in logcat
  --dry-run                         only verify installed target version; does not set debug.cheng.media.trace
`;
}
