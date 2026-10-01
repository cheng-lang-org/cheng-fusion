#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommand, startManagedProcess } from "./process-runner.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");

const options = parseArgs(process.argv.slice(2));
const projectRoot = resolvePath(options.projectRoot);
const outDir = resolvePath(options.outDir ?? join(packageDir, "tmp", `unimaker-android-pixel-oracle-${Date.now()}`));
const androidDir = join(outDir, "android");
const reactDir = join(outDir, "react");
mkdirSync(androidDir, { recursive: true });
mkdirSync(reactDir, { recursive: true });

if (!existsSync(options.androidPng)) fail(`missing Android screenshot: ${options.androidPng}`);
if (!existsSync(join(projectRoot, "package.json"))) fail(`missing UniMaker React.js package: ${projectRoot}`);

const [viewportWidth, viewportHeight] = parseViewport(options.viewport);
const androidRawPath = join(androidDir, "screenshot_android.raw");
const androidCropPngPath = join(androidDir, "screenshot_android_surface.png");
const reactRawPath = join(reactDir, "screenshot_react.raw");
const reactPngPath = join(reactDir, "screenshot_react.png");
const reportPath = join(outDir, "android-pixel-oracle.report.json");
const url = buildReactUrl(options);

await writeAndroidSurfaceRaw({
  pngPath: options.androidPng,
  left: options.surfaceLeft,
  top: options.surfaceTop,
  width: viewportWidth,
  height: viewportHeight,
  rawPath: androidRawPath,
  cropPngPath: androidCropPngPath,
});

let server;
try {
  server = startManagedProcess("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(options.port), "--strictPort"], {
    cwd: projectRoot,
    env: { ...process.env, BROWSER: "none" },
  });
  await waitForHttp(url, options.serverTimeoutMs);
  await captureReactScreenshot(url, viewportWidth, viewportHeight, reactRawPath, reactPngPath);

  let oracleStatus = 0;
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
      "--out", reportPath,
      "--tolerance", String(options.tolerance),
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: options.oracleTimeoutMs,
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    oracleStatus = err.status ?? err.code ?? 1;
    oracleStdout = err.stdout ?? "";
    if (err.stderr) process.stderr.write(err.stderr);
  }

  if (oracleStdout.trim().length > 0) process.stdout.write(oracleStdout);
  const report = readOracleReport(reportPath);
  const screenshot = report?.screenshotDiff;
  if (!screenshot) fail(`oracle report missing screenshotDiff: ${reportPath}`);
  const matchRate = screenshot.totalPixels > 0
    ? ((screenshot.totalPixels - screenshot.diffPixels) * 100 / screenshot.totalPixels)
    : 0;

  process.stdout.write(`android_crop_png=${androidCropPngPath}\n`);
  process.stdout.write(`android_raw=${androidRawPath}\n`);
  process.stdout.write(`react_png=${reactPngPath}\n`);
  process.stdout.write(`react_raw=${reactRawPath}\n`);
  process.stdout.write(`report=${reportPath}\n`);
  process.stdout.write(`pixel_match_percent=${matchRate.toFixed(4)}\n`);
  process.stdout.write(`pixel_diff_percent=${screenshot.pixelDiffPercent.toFixed(4)}\n`);
  process.stdout.write(`diff_pixels=${screenshot.diffPixels}/${screenshot.totalPixels}\n`);
  process.stdout.write(`max_pixel_diff=${screenshot.maxPixelDiff}\n`);

  process.exitCode = oracleStatus;
} finally {
  if (server) await server.stop();
}

async function writeAndroidSurfaceRaw({ pngPath, left, top, width, height, rawPath, cropPngPath }) {
  const sharp = (await import("sharp")).default;
  const image = sharp(pngPath);
  const meta = await image.metadata();
  if (!meta.width || !meta.height) fail(`cannot read Android PNG dimensions: ${pngPath}`);
  if (left < 0 || top < 0) fail(`surface crop origin must be non-negative: left=${left} top=${top}`);
  if (left + width > meta.width || top + height > meta.height) {
    fail(`surface crop ${left},${top},${width}x${height} exceeds Android PNG ${meta.width}x${meta.height}`);
  }

  const surface = sharp(pngPath).extract({ left, top, width, height }).ensureAlpha();
  const png = await surface.png().toBuffer();
  writeFileSync(cropPngPath, png);

  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== width || info.height !== height || info.channels !== 4) {
    fail(`Android crop raw mismatch: expected ${width}x${height}x4, got ${info.width}x${info.height}x${info.channels}`);
  }
  writeRawRgba(rawPath, width, height, data);
}

async function captureReactScreenshot(url, width, height, rawPath, pngPath) {
  const puppeteer = (await import("puppeteer")).default;
  const sharp = (await import("sharp")).default;
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromeExecutablePath(),
    args: ["--no-sandbox", "--disable-gpu", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: options.mobileViewport });
    await page.goto(url, { waitUntil: "networkidle0", timeout: options.reactTimeoutMs });
    await new Promise((resolve) => setTimeout(resolve, options.settleMs));
    const png = await page.screenshot({ type: "png", fullPage: false });
    writeFileSync(pngPath, png);
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== width || info.height !== height || info.channels !== 4) {
      fail(`React screenshot mismatch: expected ${width}x${height}x4, got ${info.width}x${info.height}x${info.channels}`);
    }
    writeRawRgba(rawPath, width, height, data);
  } finally {
    await browser.close();
  }
}

function writeRawRgba(path, width, height, pixels) {
  if (pixels.length !== width * height * 4) {
    fail(`raw RGBA byte count mismatch: expected ${width * height * 4}, got ${pixels.length}`);
  }
  const header = Buffer.alloc(8);
  header.writeUInt32LE(width, 0);
  header.writeUInt32LE(height, 4);
  writeFileSync(path, Buffer.concat([header, pixels]));
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

function buildReactUrl(parsed) {
  const base = `http://127.0.0.1:${parsed.port}`;
  if (parsed.path) return `${base}${parsed.path}`;
  const params = new URLSearchParams();
  params.set("r2c_truth", "1");
  params.set("r2c_route", parsed.reactRoute);
  return `${base}/?${params.toString()}`;
}

function chromeExecutablePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function readOracleReport(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseArgs(args) {
  const parsed = {
    androidPng: "",
    projectRoot: "/Users/lbcheng/UniMaker/React.js",
    viewport: "",
    surfaceLeft: 0,
    surfaceTop: 0,
    reactRoute: "home_default",
    path: "",
    port: 45217,
    threshold: 100,
    tolerance: 1,
    mobileViewport: true,
    serverTimeoutMs: 60000,
    reactTimeoutMs: 30000,
    oracleTimeoutMs: 60000,
    settleMs: 1500,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      i += 1;
      if (i >= args.length) fail(`missing value for ${arg}`);
      return args[i];
    };
    if (arg === "--android-png") parsed.androidPng = resolvePath(next());
    else if (arg === "--project-root") parsed.projectRoot = next();
    else if (arg === "--out-dir") parsed.outDir = next();
    else if (arg === "--viewport") parsed.viewport = next();
    else if (arg === "--surface-left") parsed.surfaceLeft = nonNegativeInteger(next(), "--surface-left");
    else if (arg === "--surface-top") parsed.surfaceTop = nonNegativeInteger(next(), "--surface-top");
    else if (arg === "--react-route") parsed.reactRoute = next();
    else if (arg === "--path") parsed.path = normalizePathArg(next());
    else if (arg === "--port") parsed.port = positiveInteger(next(), "--port");
    else if (arg === "--threshold") parsed.threshold = Number(next());
    else if (arg === "--tolerance") parsed.tolerance = nonNegativeInteger(next(), "--tolerance");
    else if (arg === "--desktop-viewport") parsed.mobileViewport = false;
    else if (arg === "--server-timeout-ms") parsed.serverTimeoutMs = positiveInteger(next(), "--server-timeout-ms");
    else if (arg === "--react-timeout-ms") parsed.reactTimeoutMs = positiveInteger(next(), "--react-timeout-ms");
    else if (arg === "--oracle-timeout-ms") parsed.oracleTimeoutMs = positiveInteger(next(), "--oracle-timeout-ms");
    else if (arg === "--settle-ms") parsed.settleMs = nonNegativeInteger(next(), "--settle-ms");
    else if (arg === "--help" || arg === "-h") {
      process.stdout.write(helpText());
      process.exit(0);
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }
  if (!parsed.androidPng) fail("--android-png is required");
  if (!parsed.viewport) fail("--viewport is required");
  parseViewport(parsed.viewport);
  if (!Number.isFinite(parsed.threshold) || parsed.threshold < 0 || parsed.threshold > 100) {
    fail("--threshold must be in range 0..100");
  }
  return parsed;
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

function helpText() {
  return `unimaker-android-pixel-oracle — compare Android SurfaceView pixels against UniMaker React oracle

Usage:
  node scripts/unimaker-android-pixel-oracle.mjs --android-png <png> --viewport <WxH> [options]

Options:
  --android-png <path>      Full adb screencap PNG
  --surface-left <px>       Surface crop x offset in Android PNG (default: 0)
  --surface-top <px>        Surface crop y offset in Android PNG (default: 0)
  --viewport <WxH>          Exact crop and React screenshot size
  --react-route <id>        r2c_route query value (default: home_default)
  --path <path>             Full React path instead of r2c query route
  --project-root <dir>      UniMaker React.js root
  --out-dir <dir>           Output directory
  --threshold <pct>         Oracle pass threshold percentage (default: 100)
  --tolerance <channel>     Per-channel pixel tolerance (default: 1)
  --desktop-viewport        Disable Puppeteer mobile viewport flag
`;
}

function fail(message) {
  process.stderr.write(`unimaker-android-pixel-oracle: ${message}\n`);
  process.exit(1);
}
