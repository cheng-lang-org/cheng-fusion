#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand, startManagedProcess } from "./process-runner.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const DEFAULT_REACT_ROOT_SEED = "1111111111111111111111111111111111111111111111111111111111111111";
const DEFAULT_REACT_DEVICE_SEED = "2222222222222222222222222222222222222222222222222222222222222222";

const options = parseArgs(process.argv.slice(2));
const outDir = resolvePath(options.outDir ?? join(packageDir, "tmp", `unimaker-android-frame-oracle-${Date.now()}`));
const buildDir = join(outDir, "build");
const androidDir = join(outDir, "android");
const reactDir = join(outDir, "react");
mkdirSync(buildDir, { recursive: true });
mkdirSync(androidDir, { recursive: true });
mkdirSync(reactDir, { recursive: true });

const projectRoot = resolvePath(options.projectRoot);
const chengSource = resolvePath(options.chengSource);
if (!existsSync(chengSource)) fail(`missing Cheng mobile source: ${chengSource}`);
if (!existsSync(join(projectRoot, "package.json"))) fail(`missing UniMaker React.js package: ${projectRoot}`);
const reactPeerId = resolveReactPeerIdOption(options.reactPeerId, chengSource);

const [viewportWidth, viewportHeight] = parseViewport(options.viewport);
const objectPath = join(buildDir, "unimaker-routes.mobile.o");
const reportPath = join(buildDir, "unimaker-routes.mobile.report.txt");
const soPath = join(buildDir, "libcheng_smoke_app.so");
const harnessPath = join(buildDir, "android_frame_harness.c");
const harnessBin = join(buildDir, "android_frame_harness");
const deviceDir = options.deviceDir;
const deviceRawPath = `${deviceDir}/frame_home.raw`;
const androidRawPath = join(androidDir, "frame_home.raw");
const androidPngPath = join(androidDir, "frame_home.png");
const androidBoxesPath = join(androidDir, "layout_boxes.json");
const reactRawPath = join(reactDir, "screenshot_react.raw");
const reactPngPath = join(reactDir, "screenshot_react.png");
const reactMetricsPath = join(reactDir, "layout_metrics.json");
const oracleReportPath = join(outDir, "android-frame-oracle.report.json");
const reactUrl = buildReactUrl(options);

writeFileSync(harnessPath, harnessSource({
  framePath: "frame_home.raw",
  physicalWidth: viewportWidth * options.scale,
  physicalHeight: viewportHeight * options.scale,
  scale: options.scale,
  touchXMilli: options.touchXMilli,
  touchYMilli: options.touchYMilli,
  dumpBoxes: options.dumpBoxes,
}));

await buildAndroidArtifacts();
const androidRunOutput = await runOnAndroid();
verifyAndroidRoute(androidRunOutput);
writeAndroidLayoutBoxes(androidRunOutput, androidBoxesPath);
await pullAndroidFrame();
await writeRawPng(androidRawPath, androidPngPath, viewportWidth, viewportHeight);

let server;
try {
  server = startManagedProcess("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(options.port), "--strictPort"], {
    cwd: projectRoot,
    env: { ...process.env, BROWSER: "none" },
  });
  await waitForHttp(reactUrl, options.serverTimeoutMs);
  await captureReactScreenshot(reactUrl, viewportWidth, viewportHeight, reactRawPath, reactPngPath, reactMetricsPath);
  await runOracle();
} finally {
  if (server) await server.stop();
}

augmentOracleReport();
const oracleReport = JSON.parse(readFileSync(oracleReportPath, "utf8"));
const diff = oracleReport.screenshotDiff;
const matchRate = diff.totalPixels > 0
  ? ((diff.totalPixels - diff.diffPixels) * 100 / diff.totalPixels)
  : 0;

process.stdout.write(`android_raw=${androidRawPath}\n`);
process.stdout.write(`android_png=${androidPngPath}\n`);
process.stdout.write(`android_boxes=${androidBoxesPath}\n`);
process.stdout.write(`react_raw=${reactRawPath}\n`);
process.stdout.write(`react_png=${reactPngPath}\n`);
process.stdout.write(`react_metrics=${reactMetricsPath}\n`);
process.stdout.write(`report=${oracleReportPath}\n`);
const androidRouteIndex = lastAndroidRouteIndex(androidRunOutput);
if (androidRouteIndex !== undefined) process.stdout.write(`android_route_index=${androidRouteIndex}\n`);
process.stdout.write(`pixel_match_percent=${matchRate.toFixed(4)}\n`);
process.stdout.write(`pixel_diff_percent=${diff.pixelDiffPercent.toFixed(4)}\n`);
process.stdout.write(`diff_pixels=${diff.diffPixels}/${diff.totalPixels}\n`);
process.stdout.write(`max_pixel_diff=${diff.maxPixelDiff}\n`);

if (matchRate < options.threshold) process.exitCode = 1;

async function buildAndroidArtifacts() {
  await runCommand(options.chengBin, [
    "system-link-exec",
    `--root:${repoRoot}`,
    `--in:${chengSource}`,
    "--emit:obj",
    "--target:aarch64-linux-android",
    `--out:${objectPath}`,
    `--report-out:${reportPath}`,
    "--link-providers",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: options.compileTimeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });

  const sysroot = join(options.ndkDir, "toolchains/llvm/prebuilt/darwin-x86_64/sysroot");
  await runCommand(options.lldPath, [
    "-shared",
    "--soname=libcheng_smoke_app.so",
    "--allow-shlib-undefined",
    "-z", "now",
    "-o", soPath,
    objectPath,
    join(sysroot, "usr/lib/aarch64-linux-android/24/libdl.so"),
    join(sysroot, "usr/lib/aarch64-linux-android/24/libc.so"),
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: options.linkTimeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });

  await runCommand(join(options.ndkDir, "toolchains/llvm/prebuilt/darwin-x86_64/bin/aarch64-linux-android24-clang"), [
    `--sysroot=${sysroot}`,
    "-fPIE",
    "-pie",
    "-o", harnessBin,
    harnessPath,
    "-L", buildDir,
    "-lcheng_smoke_app",
    "-Wl,-rpath,$ORIGIN",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: options.linkTimeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
}

async function runOnAndroid() {
  const adb = options.adb;
  const serialArgs = options.device.length > 0 ? ["-s", options.device] : [];
  await runCommand(adb, [...serialArgs, "shell", `mkdir -p ${shellQuote(deviceDir)} && rm -f ${shellQuote(deviceRawPath)}`], {
    encoding: "utf8",
    timeout: options.adbTimeoutMs,
  });
  await runCommand(adb, [...serialArgs, "push", soPath, `${deviceDir}/libcheng_smoke_app.so`], {
    encoding: "utf8",
    timeout: options.adbTimeoutMs,
  });
  await runCommand(adb, [...serialArgs, "push", harnessBin, `${deviceDir}/android_frame_harness`], {
    encoding: "utf8",
    timeout: options.adbTimeoutMs,
  });
  const runOut = await runCommand(adb, [...serialArgs, "shell",
    `cd ${shellQuote(deviceDir)} && chmod 755 android_frame_harness && LD_LIBRARY_PATH=. ./android_frame_harness`,
  ], {
    encoding: "utf8",
    timeout: options.runTimeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (runOut.trim().length > 0) process.stderr.write(runOut);
  return runOut;
}

function verifyAndroidRoute(runOutput) {
  if (options.expectRouteIndex === undefined) return;
  const actual = lastAndroidRouteIndex(runOutput);
  if (actual === undefined) fail("Android harness did not print route index");
  if (actual !== options.expectRouteIndex) {
    fail(`Android route index mismatch: expected ${options.expectRouteIndex}, got ${actual}`);
  }
}

function lastAndroidRouteIndex(runOutput) {
  let actual;
  const re = /stats[^\n]*\broute=(\d+)/g;
  let match;
  while ((match = re.exec(runOutput)) !== null) {
    actual = Number(match[1]);
  }
  return actual;
}

function writeAndroidLayoutBoxes(runOutput, outPath) {
  const boxes = [];
  const byIndex = new Map();
  for (const line of runOutput.split(/\r?\n/)) {
    const boxMatch = line.match(/^box index=(\d+) node=(-?\d+) x=(-?\d+) y=(-?\d+) w=(-?\d+) h=(-?\d+)$/);
    if (boxMatch) {
      const box = {
        index: Number(boxMatch[1]),
        node: Number(boxMatch[2]),
        x: Number(boxMatch[3]),
        y: Number(boxMatch[4]),
        width: Number(boxMatch[5]),
        height: Number(boxMatch[6]),
      };
      boxes.push(box);
      byIndex.set(box.index, box);
      continue;
    }
    const styleMatch = line.match(/^box_style index=(\d+) display=(-?\d+) direction=(-?\d+) align=(-?\d+) position=(-?\d+) height=(-?\d+) flex=(-?\d+) justify=(-?\d+)$/);
    if (styleMatch) {
      const box = byIndex.get(Number(styleMatch[1]));
      if (!box) continue;
      box.style = {
        display: Number(styleMatch[2]),
        direction: Number(styleMatch[3]),
        align: Number(styleMatch[4]),
        position: Number(styleMatch[5]),
        height: Number(styleMatch[6]),
        flex: Number(styleMatch[7]),
        justify: Number(styleMatch[8]),
      };
    }
  }
  writeFileSync(outPath, JSON.stringify({ boxes }, null, 2) + "\n", "utf8");
}

async function pullAndroidFrame() {
  const adb = options.adb;
  const serialArgs = options.device.length > 0 ? ["-s", options.device] : [];
  await runCommand(adb, [...serialArgs, "pull", deviceRawPath, androidRawPath], {
    encoding: "utf8",
    timeout: options.adbTimeoutMs,
  });
  const raw = readFileSync(androidRawPath);
  if (raw.length !== 8 + viewportWidth * viewportHeight * 4) {
    fail(`Android raw byte count mismatch: expected ${8 + viewportWidth * viewportHeight * 4}, got ${raw.length}`);
  }
  const rawW = raw.readUInt32LE(0);
  const rawH = raw.readUInt32LE(4);
  if (rawW !== viewportWidth || rawH !== viewportHeight) {
    fail(`Android raw dimensions mismatch: expected ${viewportWidth}x${viewportHeight}, got ${rawW}x${rawH}`);
  }
}

async function writeRawPng(rawPath, pngPath, width, height) {
  const sharp = (await import("sharp")).default;
  const raw = readFileSync(rawPath);
  await sharp(raw.subarray(8), { raw: { width, height, channels: 4 } }).png().toFile(pngPath);
}

async function captureReactScreenshot(url, width, height, rawPath, pngPath, metricsPath) {
  const puppeteer = (await import("puppeteer")).default;
  const sharp = (await import("sharp")).default;
  const executablePath = await chromeExecutablePath(puppeteer);
  const regionEnv = reactRegionEnvironment(options.reactRegion);
  const peerEnv = reactPeerIdentityEnvironment(reactPeerId);
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath,
    pipe: true,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      ...(regionEnv ? [`--lang=${regionEnv.locale}`] : []),
    ],
    timeout: options.browserTimeoutMs,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: options.mobileViewport });
    if (regionEnv || peerEnv) await installReactPageEnvironment(page, regionEnv, peerEnv);
    await page.goto(url, { waitUntil: "networkidle0", timeout: options.reactTimeoutMs });
    if (regionEnv) await verifyReactRegionEnvironment(page, regionEnv);
    if (peerEnv) await verifyReactPeerIdentityEnvironment(page, peerEnv);
    await new Promise((resolve) => setTimeout(resolve, options.settleMs));
    const metrics = await collectReactLayoutMetrics(page, options.reactMetricsLimit);
    writeFileSync(metricsPath, JSON.stringify(metrics, null, 2) + "\n", "utf8");
    const png = await page.screenshot({ type: "png", fullPage: false });
    writeFileSync(pngPath, png);
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== width || info.height !== height || info.channels !== 4) {
      fail(`React screenshot mismatch: expected ${width}x${height}x4, got ${info.width}x${info.height}x${info.channels}`);
    }
    const header = Buffer.alloc(8);
    header.writeUInt32LE(width, 0);
    header.writeUInt32LE(height, 4);
    writeFileSync(rawPath, Buffer.concat([header, data]));
  } finally {
    await browser.close();
  }
}

async function collectReactLayoutMetrics(page, limit) {
  return page.evaluate((maxRecords) => {
    const records = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let textIndex = 0;
    while (records.length < maxRecords) {
      const node = walker.nextNode();
      if (!node) break;
      const text = (node.nodeValue || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom,
        }));
      range.detach();
      if (rects.length === 0) continue;
      const style = getComputedStyle(parent);
      const first = rects[0];
      records.push({
        index: textIndex,
        text: text.slice(0, 120),
        parentTag: parent.tagName.toLowerCase(),
        parentClass: (parent.getAttribute("class") || "").slice(0, 240),
        x: first.x,
        y: first.y,
        width: first.width,
        height: first.height,
        right: first.right,
        bottom: first.bottom,
        rectCount: rects.length,
        rects,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
        color: style.color,
      });
      textIndex += 1;
    }
    return records;
  }, limit);
}

function reactRegionEnvironment(region) {
  if (region.length === 0) return undefined;
  if (region === "CN") {
    return {
      region,
      timezone: "Asia/Shanghai",
      locale: "zh-CN",
      languages: ["zh-CN", "zh"],
      policy: {
        policyGroupId: "CN",
        isDomestic: true,
        countryCode: "CN",
        source: "locale_fallback",
        updatedAt: Date.now(),
      },
    };
  }
  if (region === "INTL") {
    return {
      region,
      timezone: "UTC",
      locale: "en-US",
      languages: ["en-US", "en"],
      policy: {
        policyGroupId: "INTL",
        isDomestic: false,
        countryCode: "US",
        source: "locale_fallback",
        updatedAt: Date.now(),
      },
    };
  }
  fail(`unsupported React region: ${region}`);
}

function reactPeerIdentityEnvironment(peerId) {
  if (peerId.length === 0) return undefined;
  return {
    peerId,
    identity: {
      version: 1,
      method: "cheng",
      did: `did:cheng:${peerId}`,
      rootPeerId: peerId,
      peerId,
      rootSeed: DEFAULT_REACT_ROOT_SEED,
      deviceSeed: DEFAULT_REACT_DEVICE_SEED,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  };
}

async function installReactPageEnvironment(page, regionEnv, peerEnv) {
  if (regionEnv) await page.emulateTimezone(regionEnv.timezone);
  await page.evaluateOnNewDocument((payload) => {
    const { region, peer } = payload;
    if (region) {
      Object.defineProperty(navigator, "language", { get: () => region.locale });
      Object.defineProperty(navigator, "languages", { get: () => region.languages });
      localStorage.setItem("unimaker_region_policy_v1", JSON.stringify(region.policy));
    }
    if (peer) {
      localStorage.setItem("profile_local_peer_id_v1", peer.peerId);
      localStorage.setItem("profile_local_did_identity_v1", JSON.stringify(peer.identity));
      localStorage.removeItem("profile_browser_bio_did_bundle_v1");
      localStorage.removeItem("profile_browser_bio_did_recovery_v1");
    }
  }, {
    region: regionEnv ? {
      locale: regionEnv.locale,
      languages: regionEnv.languages,
      policy: regionEnv.policy,
    } : null,
    peer: peerEnv,
  });
}

async function verifyReactRegionEnvironment(page, regionEnv) {
  const state = await page.evaluate(() => {
    const raw = localStorage.getItem("unimaker_region_policy_v1");
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const language = navigator.language ?? "";
    let parsed = null;
    if (raw) parsed = JSON.parse(raw);
    return { raw, parsed, timezone, language };
  });
  if (!state.raw || !state.parsed) fail("React region override missing from localStorage");
  if (state.parsed.policyGroupId !== regionEnv.policy.policyGroupId) {
    fail(`React policyGroupId mismatch: expected ${regionEnv.policy.policyGroupId}, got ${state.parsed.policyGroupId}`);
  }
  if (Boolean(state.parsed.isDomestic) !== regionEnv.policy.isDomestic) {
    fail(`React isDomestic mismatch: expected ${regionEnv.policy.isDomestic}, got ${state.parsed.isDomestic}`);
  }
  if (state.timezone !== regionEnv.timezone) {
    fail(`React timezone mismatch: expected ${regionEnv.timezone}, got ${state.timezone}`);
  }
  if (state.language !== regionEnv.locale) {
    fail(`React language mismatch: expected ${regionEnv.locale}, got ${state.language}`);
  }
}

async function verifyReactPeerIdentityEnvironment(page, peerEnv) {
  const state = await page.evaluate(() => {
    const rawIdentity = localStorage.getItem("profile_local_did_identity_v1");
    let identity = null;
    if (rawIdentity) identity = JSON.parse(rawIdentity);
    return {
      peerId: localStorage.getItem("profile_local_peer_id_v1") ?? "",
      identity,
      bioDid: localStorage.getItem("profile_browser_bio_did_bundle_v1") ?? "",
    };
  });
  if (state.peerId !== peerEnv.peerId) {
    fail(`React peerId mismatch: expected ${peerEnv.peerId}, got ${state.peerId}`);
  }
  if (!state.identity || state.identity.peerId !== peerEnv.peerId) {
    fail("React DID identity peerId mismatch");
  }
  if (state.bioDid.length > 0) {
    fail("React Bio DID store must be empty for this oracle");
  }
}

async function runOracle() {
  let oracleStdout = "";
  try {
    oracleStdout = await runCommand(process.execPath, [
      "--experimental-strip-types",
      join(repoRoot, "tools", "cheng-web-oracle.ts"),
      "--cheng-screenshot", androidRawPath,
      "--chrome-screenshot", reactRawPath,
      "--viewport", options.viewport,
      "--format", "json",
      "--threshold", String(options.threshold),
      "--tolerance", String(options.tolerance),
      "--out", oracleReportPath,
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: options.oracleTimeoutMs,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    oracleStdout = err.stdout ?? "";
    if (err.stderr) process.stderr.write(err.stderr);
  }
  if (oracleStdout.trim().length > 0) process.stdout.write(oracleStdout);
  if (!existsSync(oracleReportPath)) fail(`oracle report missing: ${oracleReportPath}`);
}

function augmentOracleReport() {
  const report = JSON.parse(readFileSync(oracleReportPath, "utf8"));
  const reactMetrics = existsSync(reactMetricsPath)
    ? JSON.parse(readFileSync(reactMetricsPath, "utf8"))
    : [];
  const androidBoxes = existsSync(androidBoxesPath)
    ? JSON.parse(readFileSync(androidBoxesPath, "utf8"))
    : { boxes: [] };
  report.artifacts = {
    androidRaw: androidRawPath,
    androidPng: androidPngPath,
    androidBoxes: androidBoxesPath,
    reactRaw: reactRawPath,
    reactPng: reactPngPath,
    reactMetrics: reactMetricsPath,
  };
  report.reactLayoutMetrics = summarizeReactLayoutMetrics(reactMetrics);
  report.androidLayoutBoxDump = {
    count: Array.isArray(androidBoxes.boxes) ? androidBoxes.boxes.length : 0,
  };
  writeFileSync(oracleReportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
}

function summarizeReactLayoutMetrics(metrics) {
  if (!Array.isArray(metrics)) return { count: 0, fractionalCount: 0, examples: [] };
  const examples = [];
  let fractionalCount = 0;
  for (const metric of metrics) {
    if (reactMetricHasFractionalRect(metric)) {
      fractionalCount += 1;
      if (examples.length < 12) {
        examples.push({
          index: metric.index,
          text: metric.text,
          x: metric.x,
          y: metric.y,
          width: metric.width,
          height: metric.height,
          fontSize: metric.fontSize,
          lineHeight: metric.lineHeight,
          fontWeight: metric.fontWeight,
        });
      }
    }
  }
  return {
    count: metrics.length,
    fractionalCount,
    examples,
  };
}

function reactMetricHasFractionalRect(metric) {
  for (const key of ["x", "y", "width", "height", "right", "bottom"]) {
    const value = Number(metric?.[key]);
    if (Number.isFinite(value) && Math.abs(value - Math.round(value)) > 0.001) return true;
  }
  return false;
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail(`React dev server did not become ready at ${url}: ${lastError}`);
}

function harnessSource({ framePath, physicalWidth, physicalHeight, scale, touchXMilli, touchYMilli, dumpBoxes }) {
  const touchCode = touchXMilli === undefined ? "" : `  cheng_app_on_touch_milli(app_id, 1, 0, ${touchXMilli}, ${touchYMilli});
  cheng_app_tick(app_id, 0.016f);
`;
  const dumpBoxCode = dumpBoxes > 0 ? `  for (int32_t i = 0; i < ${dumpBoxes}; i++) {
    printf("box index=%d node=%d x=%d y=%d w=%d h=%d\\n",
           i,
           cheng_app_debug_box_node_at(i),
           cheng_app_debug_box_x_at(i),
           cheng_app_debug_box_y_at(i),
           cheng_app_debug_box_w_at(i),
           cheng_app_debug_box_h_at(i));
    printf("box_style index=%d display=%d direction=%d align=%d position=%d height=%d flex=%d justify=%d\\n",
           i,
           cheng_app_debug_box_style_display_at(i),
           cheng_app_debug_box_style_flex_direction_at(i),
           cheng_app_debug_box_style_align_at(i),
           cheng_app_debug_box_style_position_at(i),
           cheng_app_debug_box_style_height_at(i),
           cheng_app_debug_box_style_flex_at(i),
           cheng_app_debug_box_style_justify_at(i));
  }
` : "";
  return `#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

extern uint64_t cheng_app_init(void);
extern void cheng_app_set_window(uint64_t app_id, uint64_t window_id, int32_t width, int32_t height, float scale);
extern void cheng_app_tick(uint64_t app_id, float delta_seconds);
extern void cheng_app_on_touch_milli(uint64_t app_id, int32_t action, int32_t pointer_id, int32_t x_milli, int32_t y_milli);
extern int32_t cheng_app_debug_last_main_status(void);
extern int32_t cheng_app_debug_route_index(void);
extern int32_t cheng_app_debug_box_count(void);
extern int32_t cheng_app_debug_box_node_at(int32_t index);
extern int32_t cheng_app_debug_box_x_at(int32_t index);
extern int32_t cheng_app_debug_box_y_at(int32_t index);
extern int32_t cheng_app_debug_box_w_at(int32_t index);
extern int32_t cheng_app_debug_box_h_at(int32_t index);
extern int32_t cheng_app_debug_box_style_position_at(int32_t index);
extern int32_t cheng_app_debug_box_style_height_at(int32_t index);
extern int32_t cheng_app_debug_box_style_flex_at(int32_t index);
extern int32_t cheng_app_debug_box_style_display_at(int32_t index);
extern int32_t cheng_app_debug_box_style_flex_direction_at(int32_t index);
extern int32_t cheng_app_debug_box_style_align_at(int32_t index);
extern int32_t cheng_app_debug_box_style_justify_at(int32_t index);
extern int32_t cheng_app_debug_text_box_count(void);
extern int32_t cheng_app_debug_paint_op_count(void);
extern int32_t cheng_app_debug_fill_op_count(void);
extern int32_t cheng_app_debug_text_op_count(void);
extern int32_t cheng_app_debug_icon_op_count(void);
extern int32_t cheng_app_debug_image_op_count(void);
extern int32_t cheng_app_debug_text_op_x_at(int32_t index);
extern int32_t cheng_app_debug_text_op_y_at(int32_t index);
extern int32_t cheng_app_debug_text_op_x_px2_at(int32_t index);
extern int32_t cheng_app_debug_text_op_y_px2_at(int32_t index);
extern int32_t cheng_app_debug_text_op_w_at(int32_t index);
extern int32_t cheng_app_debug_text_op_h_at(int32_t index);
extern int32_t cheng_app_debug_text_op_color_at(int32_t index);
extern int32_t cheng_app_debug_text_op_len_at(int32_t index);
extern int32_t cheng_app_debug_text_op_clip_x_at(int32_t index);
extern int32_t cheng_app_debug_text_op_clip_y_at(int32_t index);
extern int32_t cheng_app_debug_text_op_clip_w_at(int32_t index);
extern int32_t cheng_app_debug_text_op_clip_h_at(int32_t index);
extern int32_t cheng_app_debug_text_op_font_size_at(int32_t index);
extern int32_t cheng_app_debug_text_op_line_height_px2_at(int32_t index);
extern int32_t cheng_app_debug_text_op_codepoint_at(int32_t index);
extern int32_t cheng_app_debug_text_op_face_index_at(int32_t index);
extern int32_t cheng_app_debug_text_op_glyph_index_at(int32_t index);
extern int32_t cheng_app_debug_text_op_outline_points_at(int32_t index);

void* cheng_malloc(int32_t size) {
  if (size <= 0) {
    size = 1;
  }
  return calloc(1u, (size_t)size);
}

void cheng_free(void* p) {
  if (p != NULL) {
    free(p);
  }
}

void cheng_mobile_host_present(const void* pixels, int32_t width, int32_t height, int32_t stride_bytes) {
  if (pixels == NULL || width <= 0 || height <= 0 || stride_bytes < width * 4) {
    printf("present_error width=%d height=%d stride=%d\\n", width, height, stride_bytes);
    fflush(stdout);
    return;
  }
  FILE* f = fopen("${framePath}", "wb");
  if (f == NULL) {
    printf("present_error open_failed=${framePath}\\n");
    fflush(stdout);
    return;
  }
  uint32_t header[2];
  header[0] = (uint32_t)width;
  header[1] = (uint32_t)height;
  fwrite(header, sizeof(uint32_t), 2, f);
  const uint8_t* row = (const uint8_t*)pixels;
  for (int32_t y = 0; y < height; y++) {
    fwrite(row + (int64_t)y * stride_bytes, 1, (size_t)width * 4, f);
  }
  fclose(f);
  printf("present width=%d height=%d stride=%d raw=${framePath}\\n", width, height, stride_bytes);
  fflush(stdout);
}

int main(void) {
  uint64_t app_id = cheng_app_init();
  cheng_app_set_window(app_id, 1u, ${physicalWidth}, ${physicalHeight}, ${scale}.0f);
  cheng_app_tick(app_id, 0.016f);
${touchCode}
  printf("stats main=%d route=%d boxes=%d text_boxes=%d ops=%d fills=%d texts=%d icons=%d images=%d\\n",
         cheng_app_debug_last_main_status(),
         cheng_app_debug_route_index(),
         cheng_app_debug_box_count(),
         cheng_app_debug_text_box_count(),
         cheng_app_debug_paint_op_count(),
         cheng_app_debug_fill_op_count(),
         cheng_app_debug_text_op_count(),
         cheng_app_debug_icon_op_count(),
         cheng_app_debug_image_op_count());
${dumpBoxCode}
  int32_t text_op_count = cheng_app_debug_text_op_count();
  for (int32_t i = 0; i < text_op_count; i++) {
    int32_t y = cheng_app_debug_text_op_y_at(i);
    if (y < 130 || y >= 760) {
      printf("text_op index=%d x=%d y=%d x2=%d y2=%d w=%d h=%d color=%d len=%d clip=%d,%d,%d,%d font=%d line2=%d cp=%d face=%d glyph=%d points=%d\\n",
             i,
             cheng_app_debug_text_op_x_at(i),
             y,
             cheng_app_debug_text_op_x_px2_at(i),
             cheng_app_debug_text_op_y_px2_at(i),
             cheng_app_debug_text_op_w_at(i),
             cheng_app_debug_text_op_h_at(i),
             cheng_app_debug_text_op_color_at(i),
             cheng_app_debug_text_op_len_at(i),
             cheng_app_debug_text_op_clip_x_at(i),
             cheng_app_debug_text_op_clip_y_at(i),
             cheng_app_debug_text_op_clip_w_at(i),
             cheng_app_debug_text_op_clip_h_at(i),
             cheng_app_debug_text_op_font_size_at(i),
             cheng_app_debug_text_op_line_height_px2_at(i),
             cheng_app_debug_text_op_codepoint_at(i),
             cheng_app_debug_text_op_face_index_at(i),
             cheng_app_debug_text_op_glyph_index_at(i),
             cheng_app_debug_text_op_outline_points_at(i));
    }
  }
  fflush(stdout);
  return cheng_app_debug_last_main_status() == 0 ? 0 : 1;
}
`;
}

function buildReactUrl(parsed) {
  const base = `http://127.0.0.1:${parsed.port}`;
  if (parsed.path) return `${base}${parsed.path}`;
  const params = new URLSearchParams();
  params.set("r2c_truth", "1");
  params.set("r2c_route", parsed.reactRoute);
  return `${base}/?${params.toString()}`;
}

async function chromeExecutablePath(puppeteer) {
  if (options.chromePath.length > 0) return resolvePath(options.chromePath);
  try {
    const bundled = await puppeteer.executablePath();
    if (bundled && existsSync(bundled)) return bundled;
  } catch {
    // fall through to system browser candidates
  }
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function parseArgs(args) {
  const parsed = {
    adb: "adb",
    chengBin: join(repoRoot, "artifacts/backend_driver/cheng"),
    chengSource: join(repoRoot, ".tmp-exec/unimaker-android-routes/unimaker-routes.mobile.cheng"),
    device: process.env.ANDROID_SERIAL ?? "",
    deviceDir: "/data/local/tmp/chengprobe",
    lldPath: "/Users/lbcheng/Library/OpenHarmony/Sdk/23/native/llvm/bin/ld.lld",
    ndkDir: process.env.ANDROID_NDK_HOME ?? "/Users/lbcheng/Library/Android/sdk/ndk/26.1.10909125",
    projectRoot: "/Users/lbcheng/UniMaker/React.js",
    chromePath: process.env.CHROME_PATH ?? "",
    viewport: "390x844",
    scale: 3,
    reactRoute: "home_default",
    reactRegion: "",
    reactPeerId: "auto",
    path: "",
    port: 45217,
    threshold: 95,
    tolerance: 1,
    mobileViewport: true,
    compileTimeoutMs: 180000,
    linkTimeoutMs: 60000,
    adbTimeoutMs: 30000,
    runTimeoutMs: 60000,
    serverTimeoutMs: 60000,
    browserTimeoutMs: 120000,
    reactTimeoutMs: 30000,
    oracleTimeoutMs: 60000,
    settleMs: 1500,
    touchXMilli: undefined,
    touchYMilli: undefined,
    expectRouteIndex: undefined,
    dumpBoxes: 0,
    reactMetricsLimit: 400,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      i += 1;
      if (i >= args.length) fail(`missing value for ${arg}`);
      return args[i];
    };
    if (arg === "--adb") parsed.adb = next();
    else if (arg === "--cheng-bin") parsed.chengBin = next();
    else if (arg === "--cheng-source") parsed.chengSource = next();
    else if (arg === "--device") parsed.device = next();
    else if (arg === "--device-dir") parsed.deviceDir = next();
    else if (arg === "--lld") parsed.lldPath = next();
    else if (arg === "--ndk") parsed.ndkDir = next();
    else if (arg === "--project-root") parsed.projectRoot = next();
    else if (arg === "--chrome-path") parsed.chromePath = next();
    else if (arg === "--out-dir") parsed.outDir = next();
    else if (arg === "--viewport") parsed.viewport = next();
    else if (arg === "--scale") parsed.scale = positiveInteger(next(), "--scale");
    else if (arg === "--react-route") parsed.reactRoute = next();
    else if (arg === "--react-region") parsed.reactRegion = parseReactRegion(next());
    else if (arg === "--react-peer-id") parsed.reactPeerId = parseReactPeerId(next());
    else if (arg === "--touch-milli") {
      const [x, y] = parsePair(next(), "--touch-milli");
      parsed.touchXMilli = x;
      parsed.touchYMilli = y;
    }
    else if (arg === "--touch-px") {
      const [x, y] = parsePair(next(), "--touch-px");
      parsed.touchXMilli = x * 1000;
      parsed.touchYMilli = y * 1000;
    }
    else if (arg === "--expect-route-index") parsed.expectRouteIndex = nonNegativeInteger(next(), "--expect-route-index");
    else if (arg === "--dump-boxes") parsed.dumpBoxes = nonNegativeInteger(next(), "--dump-boxes");
    else if (arg === "--react-metrics-limit") parsed.reactMetricsLimit = nonNegativeInteger(next(), "--react-metrics-limit");
    else if (arg === "--path") parsed.path = normalizePathArg(next());
    else if (arg === "--port") parsed.port = positiveInteger(next(), "--port");
    else if (arg === "--threshold") parsed.threshold = Number(next());
    else if (arg === "--tolerance") parsed.tolerance = nonNegativeInteger(next(), "--tolerance");
    else if (arg === "--desktop-viewport") parsed.mobileViewport = false;
    else if (arg === "--settle-ms") parsed.settleMs = nonNegativeInteger(next(), "--settle-ms");
    else if (arg === "--browser-timeout-ms") parsed.browserTimeoutMs = positiveInteger(next(), "--browser-timeout-ms");
    else if (arg === "--react-timeout-ms") parsed.reactTimeoutMs = positiveInteger(next(), "--react-timeout-ms");
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(parsed.threshold) || parsed.threshold < 0 || parsed.threshold > 100) {
    fail("--threshold must be in range 0..100");
  }
  if (parsed.touchXMilli !== undefined && parsed.touchYMilli === undefined) fail("--touch requires both coordinates");
  if (parsed.touchYMilli !== undefined && parsed.touchXMilli === undefined) fail("--touch requires both coordinates");
  parseViewport(parsed.viewport);
  return parsed;
}

function parseReactRegion(value) {
  if (value === "CN" || value === "INTL") return value;
  fail("--react-region must be CN or INTL");
}

function parseReactPeerId(value) {
  const peerId = value.trim();
  if (peerId === "auto" || peerId.length === 0) return peerId;
  if (!/^12D3Koo[1-9A-HJ-NP-Za-km-z]{45}$/.test(peerId)) {
    fail("--react-peer-id must be a 52-character 12D3Koo* peer id");
  }
  return peerId;
}

function resolveReactPeerIdOption(value, sourcePath) {
  if (value !== "auto") return value;
  const source = readFileSync(sourcePath, "utf8");
  const matches = new Set(source.match(/12D3Koo[1-9A-HJ-NP-Za-km-z]{45}/g) ?? []);
  if (matches.size === 0) return "";
  if (matches.size > 1) fail(`--react-peer-id auto found multiple peer ids in ${sourcePath}`);
  return [...matches][0];
}

function parsePair(value, flag) {
  const parts = value.split(",");
  if (parts.length !== 2) fail(`${flag} must be formatted as x,y`);
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) fail(`${flag} must contain numeric x,y`);
  return [Math.trunc(x), Math.trunc(y)];
}

function parseViewport(value) {
  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) fail(`invalid viewport: ${value}`);
  return [Number(match[1]), Number(match[2])];
}

function normalizePathArg(value) {
  return value.startsWith("/") ? value : `/${value}`;
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(`${name} must be a positive integer`);
  return parsed;
}

function nonNegativeInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) fail(`${name} must be a non-negative integer`);
  return parsed;
}

function resolvePath(value) {
  if (!value) return value;
  return resolve(process.cwd(), value);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function helpText() {
  return `unimaker-android-frame-oracle — run pure Cheng UniMaker on Android and compare its frame against React

Usage:
  node scripts/unimaker-android-frame-oracle.mjs [options]

Options:
  --cheng-source <path>     Generated mobile Cheng source
  --device <serial>         adb device serial
  --viewport <WxH>          Logical viewport (default: 390x844)
  --scale <n>               Physical scale passed to cheng_app_set_window
  --react-route <id>        r2c_route query value (default: home_default)
  --react-region <CN|INTL>  Seed React region policy before page load
  --react-peer-id <id>      Seed React peer identity (default: auto from Cheng source)
  --touch-px <x,y>          Tap logical pixel coordinate after first frame
  --touch-milli <x,y>       Tap milli coordinate after first frame
  --expect-route-index <n>  Required Android route index after tap
  --dump-boxes <n>          Print first n layout boxes from Android
  --react-metrics-limit <n> Capture up to n React text rects (default: 400)
  --path <path>             Full React path instead of r2c query route
  --project-root <dir>      UniMaker React.js root
  --chrome-path <path>      Explicit Chrome/Chromium executable
  --out-dir <dir>           Output directory
  --threshold <pct>         Required pixel match percentage (default: 95)
  --tolerance <channel>     Per-channel pixel tolerance (default: 1)
  --browser-timeout-ms <n>  Puppeteer browser launch timeout (default: 120000)
  --react-timeout-ms <n>    React page navigation timeout (default: 30000)
  --desktop-viewport        Disable Puppeteer mobile viewport flag
`;
}

function fail(message) {
  process.stderr.write(`unimaker-android-frame-oracle: ${message}\n`);
  process.exit(1);
}
