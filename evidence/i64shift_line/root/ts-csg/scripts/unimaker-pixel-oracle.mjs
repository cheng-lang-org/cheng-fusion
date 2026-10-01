#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { runCommand, startManagedProcess } from "./process-runner.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");
const projectRoot = "/Users/lbcheng/UniMaker/React.js";
const distributedContentStorageKey = "unimaker_distributed_contents_v1";
const currentPwaContentRoutes = new Set([
  "home_default",
  "home_graphic_channel",
  // Per-card fan-out (v5, 2026-07-10): pinned fixture's per-content routes, see the
  // matching comment in unimaker-functional-coverage-gate.mjs.
  "home_content_detail_open_vid_hgs",
  "home_content_detail_open_vid1",
  "home_image_detail_open_img1",
  "node_published_content",
  "content_detail",
]);
const routeDefaults = new Map([
  ["home_default", { rootSource: "app/components/HomePage.tsx" }],
  ["home_app_channel", { rootSource: "app/components/HomePage.tsx" }],
  ["home_graphic_channel", { rootSource: "app/components/HomePage.tsx" }],
  ["home_search_open", { rootSource: "app/components/HomePage.tsx" }],
  ["home_sort_open", { rootSource: "app/components/HomePage.tsx" }],
  ["home_sidebar_open", { rootSource: "app/components/HomePage.tsx" }],
  ["home_channel_manager_open", { rootSource: "app/components/HomePage.tsx" }],
  ["home_content_detail_open_vid_hgs", { rootSource: "app/components/HomePage.tsx" }],
  ["home_content_detail_open_vid1", { rootSource: "app/components/HomePage.tsx" }],
  ["home_image_detail_open_img1", { rootSource: "app/components/HomePage.tsx" }],
  ["content_detail", { rootSource: "app/components/ContentDetailPage.tsx" }],
  ["marketplace_main", { rootSource: "app/components/AppMarketplace.tsx", rootText: "应用市场" }],
  ["publish_selector", { rootSource: "app/components/PublishTypeSelector.tsx" }],
  ["tab_messages", { rootSource: "app/components/MessagesPage.tsx" }],
  ["tab_nodes", { rootSource: "app/components/NodesPage.tsx" }],
  ["tab_profile", { rootSource: "app/components/ProfilePage.tsx" }],
]);
const defaultCjkFontFile = "/Users/lbcheng/Library/Fonts/匯文明朝體.ttf";
const ANDROID_HOST_CAPTURE_REQUIRED_SYMBOLS = [
  "cheng_mobile_host_begin_offscreen_capture",
  "cheng_mobile_host_read_offscreen_pixels",
  "cheng_mobile_host_end_offscreen_capture",
];

const options = parseArgs(process.argv.slice(2));
const outDir = resolvePath(options.outDir ?? join(packageDir, "tmp", `unimaker-pixel-oracle-${Date.now()}-${process.pid}-${randomUUID()}`));
const workDir = options.keepIntermediates
  ? outDir
  : join(outDir, `.unimaker-pixel-oracle-work-${process.pid}-${Date.now()}`);
const reactDir = join(workDir, "react");
const chengDir = join(workDir, "cheng");
const [viewportWidth, viewportHeight] = parseViewport(options.viewport);
const reactRawPath = join(reactDir, "screenshot_react.raw");
const reactPngPath = join(reactDir, "screenshot_react.png");
const chengRawPath = join(chengDir, "screenshot_cheng.raw");
const chengRunOutputPath = join(chengDir, "unimaker-react.run.stdout.txt");
const chengSummaryPath = join(chengDir, "one-click.summary.json");
const reportPath = join(outDir, "pixel-oracle.report.json");
const port = options.port;
process.once("exit", () => {
  cleanupPixelOracleArtifacts();
});
const pixelSignalExitCode = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 };
for (const signal of Object.keys(pixelSignalExitCode)) {
  process.once(signal, () => {
    if (process.listenerCount(signal) === 0) {
      process.exit(pixelSignalExitCode[signal]);
    }
    setTimeout(() => process.exit(pixelSignalExitCode[signal]), 3500);
  });
}
mkdirSync(reactDir, { recursive: true });
mkdirSync(chengDir, { recursive: true });

if (!existsSync(join(projectRoot, "package.json"))) {
  fail(`missing UniMaker React.js package: ${projectRoot}`);
}

const contentSnapshot = await resolveContentSnapshot(options);
const url = buildReactUrl(options, port);

let server;
try {
  if (options.oracleLayer === "retained-compositor") {
    const retained = await runRetainedCompositorOracle();
    if (retained.oracleStdout?.trim().length > 0) process.stdout.write(retained.oracleStdout);
    if (retained.failureMessage) fail(retained.failureMessage);
    process.exitCode = retained.oracleStatus ?? 0;
  } else {
    server = startManagedProcess("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
      cwd: projectRoot,
      env: { ...process.env, BROWSER: "none" },
    });
    await waitForHttp(url, options.serverTimeoutMs);
    await captureReactScreenshot(url, viewportWidth, viewportHeight, reactRawPath, reactPngPath, contentSnapshot);

    const oneClickArgs = [
      "scripts/unimaker-one-click.mjs",
      "--out-dir", chengDir,
      "--viewport", options.viewport,
      "--mobile-scene-initial-route", options.reactRoute,
      "--frame-limit", "1",
      "--glyph-sdf-precompute-timeout-ms", String(options.glyphSdfPrecomputeTimeoutMs),
      "--run-timeout-ms", String(options.runTimeoutMs),
      "--raw-pixels",
      "--run-output-file", chengRunOutputPath,
      "--require-dom-css-coverage",
      "--root-text", options.rootText,
      "--root-source", options.rootSource,
      ...(options.keepIntermediates ? ["--keep-intermediate-facts", "--keep-glyph-sdf-precompute-debug"] : []),
      ...mobileSceneRouteOneClickArgs(options),
      ...(options.requireGlyphCacheHit ? ["--require-glyph-sdf-precompute-cache-hit"] : []),
      ...(options.fontFile ? ["--font-file", options.fontFile] : []),
      ...options.fontFallbackFiles.flatMap((fontFile) => ["--font-fallback-file", fontFile]),
      ...contentSnapshotOneClickArgs(contentSnapshot),
    ];
    const chengOutput = await runCommand(process.execPath, oneClickArgs, {
      cwd: packageDir,
      encoding: "utf8",
      timeout: options.pipelineTimeoutMs,
      maxBuffer: 512 * 1024 * 1024,
    });
    if (chengOutput.trim().length > 0) process.stderr.write(chengOutput);
    await writeChengRawPixelsFromFile(chengRunOutputPath, viewportWidth, viewportHeight, chengRawPath);

    const oracle = await runPixelCompare(chengRawPath, reactRawPath);
    const chengSummary = readJsonIfExists(chengSummaryPath);
    const cleanup = options.keepIntermediates
      ? keptOneClickIntermediates(chengSummary)
      : defaultOneClickCleanupSummary();
    augmentPixelReport(reportPath, {
      schema: "unimaker.pixel_oracle.cheng_one_click.v1",
      oracleLayer: "legacy-dom-raw-pixels",
      retainedScenePixelOracle: false,
      summaryPath: options.keepIntermediates ? chengSummaryPath : "",
      available: Boolean(chengSummary),
      elapsedMs: chengSummary?.elapsedMs ?? null,
      viewport: chengSummary?.viewport ?? options.viewport,
      scene: chengSummary?.scene ?? null,
      domCss: chengSummary?.domCss ? {
        complete: chengSummary.domCss.complete,
        hardFailureCount: chengSummary.domCss.hardFailureCount,
      } : null,
      routeReachability: chengSummary?.routeReachability ? {
        complete: chengSummary.routeReachability.complete,
        routeCount: chengSummary.routeReachability.routeCount,
        reachableRouteCount: chengSummary.routeReachability.reachableRouteCount,
        edgeCount: chengSummary.routeReachability.edgeCount,
        unreachableWithoutIncomingEdgeRouteCount: chengSummary.routeReachability.unreachableWithoutIncomingEdgeRouteCount,
        unreachableWithIncomingEdgeRouteCount: chengSummary.routeReachability.unreachableWithIncomingEdgeRouteCount,
      } : null,
      glyphSdfPrecompute: summarizeGlyphSdfPrecompute(chengSummary?.glyphSdfPrecompute, cleanup),
      cleanup,
    });

    if (oracle.stdout.trim().length > 0) process.stdout.write(oracle.stdout);
    process.stdout.write(`react_raw=${options.keepIntermediates ? reactRawPath : ""}\n`);
    process.stdout.write(`cheng_raw=${options.keepIntermediates ? chengRawPath : ""}\n`);
    process.stdout.write(`react_route=${options.reactRoute}\n`);
    process.stdout.write(`report=${reportPath}\n`);
    process.exitCode = oracle.status;
  }
} finally {
  try {
    if (server) await server.stop();
  } finally {
    const cleanup = cleanupPixelOracleArtifacts();
    recordPixelArtifactCleanup(cleanup);
  }
}

async function captureReactScreenshot(url, width, height, rawPath, pngPath, snapshot) {
  const puppeteer = (await import("puppeteer")).default;
  const sharp = (await import("sharp")).default;
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromeExecutablePath(),
    args: ["--no-sandbox", "--disable-gpu", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: true });
    if (snapshot) {
      await page.evaluateOnNewDocument((key, json) => {
        window.localStorage.setItem(key, json);
      }, distributedContentStorageKey, snapshot.storageJson);
    }
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    await injectReactCjkFont(page, options.reactCjkFontFile || options.fontFile);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const png = await page.screenshot({ type: "png", fullPage: false });
    writeFileSync(pngPath, png);
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== width || info.height !== height) {
      fail(`React screenshot size mismatch: expected ${width}x${height}, got ${info.width}x${info.height}`);
    }
    const header = Buffer.alloc(8);
    header.writeUInt32LE(width, 0);
    header.writeUInt32LE(height, 4);
    writeFileSync(rawPath, Buffer.concat([header, data]));
    // Ground-truth per-line text-run boxes in the exact screenshot coordinate space (dsf=1, no
    // scroll between screenshot and read). The pixel-parity-matrix gate uses these to mask CJK
    // (匯文明朝體) glyph pixels — Han判定 is done downstream by font-subset.isHanCodePoint, so
    // this side just reports geometry+text for every non-empty text run. Purely additive: any
    // failure yields an empty list and never disturbs the screenshot/diff path above.
    const textNodeBoxes = await extractTextRunBoxes(page);
    return { textNodeBoxes };
  } finally {
    await browser.close();
  }
}

async function extractTextRunBoxes(page) {
  try {
    const boxes = await page.evaluate(() => {
      const out = [];
      const root = document.body;
      if (!root) return out;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const value = node.nodeValue;
        const text = value ? value.trim() : "";
        if (text.length > 0) {
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (rect.width > 0 && rect.height > 0) {
              out.push({
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                text: text.slice(0, 64),
              });
            }
          }
        }
        node = walker.nextNode();
      }
      return out;
    });
    return Array.isArray(boxes) ? boxes : [];
  } catch (err) {
    process.stderr.write(`text-run box extraction failed (non-fatal): ${String(err?.message ?? err)}\n`);
    return [];
  }
}

async function runRetainedCompositorOracle() {
  const gateReportPath = options.retainedGateReport
    ? resolvePath(options.retainedGateReport)
    : await buildRetainedGateReport();
  if (!existsSync(gateReportPath)) fail(`missing retained gate report: ${gateReportPath}`);
  const gate = readJsonIfExists(gateReportPath);
  const apkBuild = options.apkBuildSummary ? readApkBuildSummary(options.apkBuildSummary) : null;
  const androidCapture = options.androidCaptureReport ? readAndroidCaptureReport(options.androidCaptureReport) : null;
  const hostCapture = summarizeApkHostCapture(apkBuild?.summary ?? null);
  const digest = gate?.digest ?? {};
  const materialize = gate?.materialize ?? {};
  const retainedFrameAvailable =
    materialize.domCssComplete === true &&
    materialize.routeInventoryComplete === true &&
    materialize.routeReachabilityComplete === true &&
    Number(digest.routeCount ?? -1) > 0 &&
    Number(digest.renderedRoutes ?? -2) === Number(digest.routeCount ?? -1) &&
    Number(digest.renderBlockedCount ?? -1) === 0 &&
    Number(digest.runtimeEdgeCount ?? -1) > 0 &&
    Number(digest.verifiedEdges ?? -2) === Number(digest.runtimeEdgeCount ?? -1) &&
    Number(digest.stateGatedCount ?? -1) === 0 &&
    Number(digest.issueCount ?? -1) === 0;
  const rendererAvailable = retainedFrameAvailable && hostCapture.supported === true;
  const captureAvailable = androidCapture?.report?.available === true && androidCapture.rawValid === true;
  const pixelAvailable = rendererAvailable && captureAvailable;
  const blockedReason = !retainedFrameAvailable
    ? "retained_frame_unavailable"
    : !rendererAvailable
      ? "retained_host_capture_missing"
      : captureAvailable
        ? ""
        : "retained_capture_execution_missing";
  const retainedContext = {
    schema: "unimaker.pixel_oracle.retained_compositor.v1",
    oracleLayer: "retained-compositor",
    retainedScenePixelOracle: pixelAvailable,
    retainedFrameAvailable,
    rendererAvailable,
    pixelAvailable,
    blockedReason,
    rendererRequired: "host renderer must execute cheng_mobile_host_present_compositor_frame through the packaged offscreen EGL pbuffer capture path and emit top-left RGBA pixels from the same retained compositor commands",
    viewport: options.viewport,
    reactRoute: options.reactRoute,
    retainedGateReport: (options.retainedGateReport || options.keepIntermediates) ? gateReportPath : "",
    apkBuildSummary: apkBuild?.path ?? "",
    hostCapture,
    androidCapture: androidCapture?.summary ?? null,
    retainedGate: {
      elapsedMs: gate?.elapsedMs ?? null,
      domCssComplete: materialize.domCssComplete === true,
      routeInventoryComplete: materialize.routeInventoryComplete === true,
      routeReachabilityComplete: materialize.routeReachabilityComplete === true,
      routeCount: Number(materialize.routeCount ?? 0),
      edgeCount: Number(materialize.edgeCount ?? 0),
      scene: materialize.scene ?? null,
      glyphCacheHit: materialize.glyphCacheHit === true,
      chtInvokeSites: Number(gate?.cht?.invokeSites ?? -1),
      chtRemainingUncompiledUnique: Number(gate?.cht?.remainingUncompiledUnique ?? -1),
      digest,
      cleanup: gate?.cleanup ?? null,
    },
  };
  if (!pixelAvailable) {
    writeFileSync(reportPath, JSON.stringify(retainedContext, null, 2) + "\n", "utf8");
    process.stdout.write(`report=${reportPath}\n`);
    return {
      failureMessage: rendererAvailable
        ? "retained-compositor pixel oracle has packaged offscreen RGBA capture, but still needs Android/headless execution to emit pixels for comparison"
        : "retained-compositor pixel oracle requires APK host capture ABI proof plus execution that emits RGBA pixels; digest/command batches are not a pixel oracle",
    };
  }

  server = startManagedProcess("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: projectRoot,
    env: { ...process.env, BROWSER: "none" },
  });
  await waitForHttp(url, options.serverTimeoutMs);
  const react = await captureReactScreenshot(url, viewportWidth, viewportHeight, reactRawPath, reactPngPath, contentSnapshot);
  const oracle = await runPixelCompare(androidCapture.report.rawPath, reactRawPath);
  augmentPixelReport(reportPath, retainedContext, "retainedCompositor");
  // React ground-truth text-run boxes for the CJK (匯文明朝體) exemption — consumed by
  // scripts/unimaker-pixel-parity-matrix.mjs. Emitted after the diff so it can never affect it.
  augmentPixelReport(reportPath, react?.textNodeBoxes ?? [], "textNodeBoxes");
  process.stdout.write(`react_raw=${options.keepIntermediates ? reactRawPath : ""}\n`);
  process.stdout.write(`cheng_raw=${androidCapture.report.rawPath}\n`);
  process.stdout.write(`android_capture_report=${androidCapture.path}\n`);
  process.stdout.write(`react_route=${options.reactRoute}\n`);
  process.stdout.write(`report=${reportPath}\n`);
  return {
    oracleStatus: oracle.status,
    oracleStdout: oracle.stdout,
  };
}

async function runPixelCompare(chengRaw, reactRaw) {
  let status = 0;
  let stdout = "";
  try {
    stdout = await runCommand(process.execPath, [
      "--experimental-strip-types",
      join(repoRoot, "tools", "cheng-web-oracle.ts"),
      "--cheng-screenshot", chengRaw,
      "--chrome-screenshot", reactRaw,
      "--viewport", options.viewport,
      "--format", "json",
      "--threshold", String(options.threshold),
      "--out", reportPath,
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: options.oracleTimeoutMs,
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    status = err.status ?? 1;
    stdout = err.stdout ?? "";
    if (err.stderr) process.stderr.write(err.stderr);
  }
  return { status, stdout };
}

async function buildRetainedGateReport() {
  const retainedDir = join(workDir, "retained");
  mkdirSync(retainedDir, { recursive: true });
  await runCommand(process.execPath, [
    "scripts/unimaker-retained-parity-gate.mjs",
    "--out-dir", retainedDir,
    "--viewport", options.viewport,
    ...(options.keepIntermediates ? ["--keep-intermediates"] : []),
  ], {
    cwd: packageDir,
    encoding: "utf8",
    timeout: options.pipelineTimeoutMs,
    maxBuffer: 128 * 1024 * 1024,
  });
  return join(retainedDir, "unimaker-retained-parity-gate.report.json");
}

async function injectReactCjkFont(page, fontFile) {
  if (!fontFile || !existsSync(fontFile)) return;
  const cjkFontBase64 = readFileSync(fontFile).toString("base64");
  await page.addStyleTag({ content: [
    "@font-face { font-family: 'ChengTruthCJK'; font-weight: 100 900;",
    `  src: url(data:font/ttf;base64,${cjkFontBase64}) format('truetype');`,
    "  unicode-range: U+2E80-303F, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FE30-FE4F, U+FF00-FFEF; }",
    "html, body, * { font-family: 'ChengTruthCJK', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif !important; }",
  ].join("\n") });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
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

async function writeChengRawPixelsFromFile(inputPath, width, height, outPath) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(width, 0);
  header.writeUInt32LE(height, 4);
  const pixels = Buffer.alloc(width * height * 4);
  let offset = 0;
  let rows = 0;
  let inDump = false;
  const lines = createInterface({
    input: createReadStream(inputPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (line === "---CHENG_SCREENSHOT_DUMP---") {
      inDump = true;
      continue;
    }
    if (line === "---CHENG_DUMP_END---") break;
    if (!inDump || !line.startsWith("row: ")) continue;
    const values = line.slice("row: ".length).split(",").map((value) => Number(value));
    if (values.length !== width * 4) {
      fail(`Cheng screenshot row width mismatch: expected ${width * 4} channels, got ${values.length}`);
    }
    for (let i = 0; i < values.length; i += 4) {
      pixels[offset++] = values[i];
      pixels[offset++] = values[i + 1];
      pixels[offset++] = values[i + 2];
      pixels[offset++] = values[i + 3];
    }
    rows += 1;
  }
  if (!inDump) fail("missing Cheng screenshot dump");
  if (rows !== height) {
    fail(`Cheng screenshot row count mismatch: expected ${height}, got ${rows}`);
  }
  writeFileSync(outPath, Buffer.concat([header, pixels]));
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

function parseArgs(args) {
  const parsed = {
    viewport: "390x844",
    path: "",
    reactRoute: "home_default",
    port: 45217,
    threshold: 100,
    rootText: "",
    rootSource: "",
    fontFile: "",
    reactCjkFontFile: defaultCjkFontFile,
    fontFallbackFiles: [],
    oracleLayer: "retained-compositor",
    retainedGateReport: "",
    mobileContentSnapshotFile: "",
    mobileContentSnapshotJson: "",
    mobileContentSnapshotCdpBaseUrl: "",
    mobileContentSnapshotCdpWsEndpoint: "",
    mobileContentSnapshotCdpTimeoutMs: 120000,
    serverTimeoutMs: 60000,
    runTimeoutMs: 60000,
    pipelineTimeoutMs: 900000,
    glyphSdfPrecomputeTimeoutMs: 180000,
    requireGlyphCacheHit: false,
    oracleTimeoutMs: 60000,
    keepIntermediates: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      i += 1;
      if (i >= args.length) fail(`missing value for ${arg}`);
      return args[i];
    };
    if (arg === "--out-dir") parsed.outDir = next();
    else if (arg === "--viewport") parsed.viewport = next();
    else if (arg === "--path") parsed.path = next();
    else if (arg === "--react-route") parsed.reactRoute = next();
    else if (arg === "--port") parsed.port = positiveInteger(next(), "--port");
    else if (arg === "--threshold") parsed.threshold = Number(next());
    else if (arg === "--root-text") parsed.rootText = next();
    else if (arg === "--no-root-text") parsed.rootText = "";
    else if (arg === "--root-source") parsed.rootSource = next();
    else if (arg === "--font-file") parsed.fontFile = next();
    else if (arg === "--react-cjk-font-file") parsed.reactCjkFontFile = next();
    else if (arg === "--font-fallback-file") parsed.fontFallbackFiles.push(next());
    else if (arg === "--oracle-layer") parsed.oracleLayer = next();
    else if (arg === "--legacy-dom-raw-pixels") parsed.oracleLayer = "legacy-dom-raw-pixels";
    else if (arg === "--retained-gate-report") parsed.retainedGateReport = next();
    else if (arg === "--apk-build-summary") parsed.apkBuildSummary = next();
    else if (arg === "--android-capture-report") parsed.androidCaptureReport = next();
    else if (arg === "--mobile-content-snapshot-file" || arg === "--pwa-content-snapshot-file" || arg === "--content-snapshot-file") parsed.mobileContentSnapshotFile = next();
    else if (arg === "--mobile-content-snapshot-json" || arg === "--pwa-content-snapshot-json" || arg === "--content-snapshot-json") parsed.mobileContentSnapshotJson = next();
    else if (arg === "--mobile-content-snapshot-cdp-base-url" || arg === "--pwa-content-snapshot-cdp-base-url" || arg === "--content-snapshot-cdp-base-url") parsed.mobileContentSnapshotCdpBaseUrl = next().trim();
    else if (arg === "--mobile-content-snapshot-cdp-ws-endpoint" || arg === "--pwa-content-snapshot-cdp-ws-endpoint" || arg === "--content-snapshot-cdp-ws-endpoint") parsed.mobileContentSnapshotCdpWsEndpoint = next().trim();
    else if (arg === "--mobile-content-snapshot-cdp-timeout-ms" || arg === "--pwa-content-snapshot-cdp-timeout-ms" || arg === "--content-snapshot-cdp-timeout-ms") parsed.mobileContentSnapshotCdpTimeoutMs = positiveInteger(next(), arg);
    else if (arg === "--run-timeout-ms") parsed.runTimeoutMs = positiveInteger(next(), "--run-timeout-ms");
    else if (arg === "--pipeline-timeout-ms") parsed.pipelineTimeoutMs = positiveInteger(next(), "--pipeline-timeout-ms");
    else if (arg === "--glyph-sdf-precompute-timeout-ms") parsed.glyphSdfPrecomputeTimeoutMs = positiveInteger(next(), "--glyph-sdf-precompute-timeout-ms");
    else if (arg === "--require-glyph-cache-hit" || arg === "--require-glyph-sdf-precompute-cache-hit") parsed.requireGlyphCacheHit = true;
    else if (arg === "--oracle-timeout-ms") parsed.oracleTimeoutMs = positiveInteger(next(), "--oracle-timeout-ms");
    else if (arg === "--keep-intermediates" || arg === "--keep-debug-artifacts") parsed.keepIntermediates = true;
    else fail(`unknown argument: ${arg}`);
  }
  if (parsed.path.length > 0 && !parsed.path.startsWith("/")) parsed.path = `/${parsed.path}`;
  parsed.reactRoute = parsed.reactRoute.trim();
  if (parsed.reactRoute.length === 0) fail("--react-route must be non-empty");
  if (parsed.oracleLayer !== "retained-compositor" && parsed.oracleLayer !== "legacy-dom-raw-pixels") {
    fail("--oracle-layer must be retained-compositor or legacy-dom-raw-pixels");
  }
  applyRouteDefaults(parsed);
  return parsed;
}

function applyRouteDefaults(parsed) {
  const defaults = routeDefaults.get(parsed.reactRoute);
  if (!defaults) return;
  if (!parsed.rootSource && defaults.rootSource) parsed.rootSource = defaults.rootSource;
  if (!parsed.rootText && defaults.rootText) parsed.rootText = defaults.rootText;
}

function buildReactUrl(parsed, port) {
  const base = `http://127.0.0.1:${port}`;
  if (parsed.path) return `${base}${parsed.path}`;
  const params = new URLSearchParams();
  params.set("r2c_truth", "1");
  params.set("r2c_route", parsed.reactRoute);
  return `${base}/?${params.toString()}`;
}

function mobileSceneRouteOneClickArgs(parsed) {
  if (!parsed.rootSource) return [];
  let route = `${parsed.reactRoute}:${parsed.rootSource}`;
  if (parsed.rootText) route = `${route}::${parsed.rootText}`;
  return ["--mobile-scene-route", route];
}

async function resolveContentSnapshot(parsed) {
  const json = String(parsed.mobileContentSnapshotJson ?? "").trim();
  if (json.length > 0) return parseContentSnapshotText(json, "cli-json");

  const envJson = String(process.env.UNIMAKER_PWA_CONTENT_SNAPSHOT_JSON ?? "").trim();
  if (envJson.length > 0) return parseContentSnapshotText(envJson, "env-json");

  const explicitFile = String(parsed.mobileContentSnapshotFile ?? "").trim();
  if (explicitFile.length > 0) return readContentSnapshotFile(resolvePath(explicitFile), "cli-file");

  const envFile = String(process.env.UNIMAKER_PWA_CONTENT_SNAPSHOT_FILE ?? "").trim();
  if (envFile.length > 0) return readContentSnapshotFile(resolvePath(envFile), "env-file");

  if (!currentPwaContentRoutes.has(parsed.reactRoute)) return null;
  const cdpSnapshot = await resolveContentSnapshotViaCdp(parsed);
  if (cdpSnapshot !== null) return cdpSnapshot;
  fail(`route ${parsed.reactRoute} requires --mobile-content-snapshot-file/json or CDP base-url/ws-endpoint`);
}

async function resolveContentSnapshotViaCdp(parsed) {
  const baseUrl = String(parsed.mobileContentSnapshotCdpBaseUrl || process.env.UNIMAKER_PWA_CONTENT_SNAPSHOT_CDP_BASE_URL || "").trim();
  const browserWsEndpoint = String(parsed.mobileContentSnapshotCdpWsEndpoint || process.env.UNIMAKER_PWA_CONTENT_SNAPSHOT_CDP_WS_ENDPOINT || "").trim();
  if (baseUrl.length === 0 && browserWsEndpoint.length === 0) return null;
  if (baseUrl.length === 0 || browserWsEndpoint.length === 0) {
    fail("CDP PWA content snapshot requires both base URL and browser websocket endpoint");
  }
  const snapshotPath = join(workDir, "unimaker-pwa-content-snapshot.json");
  const factsPath = join(workDir, "unimaker-cdp-content-snapshot.jsonl");
  await runCommand(process.execPath, [
    join(scriptDir, "unimaker-cdp-resolved-facts.mjs"),
    "--base-url", baseUrl,
    "--browser-ws-endpoint", browserWsEndpoint,
    "--route", parsed.reactRoute,
    "--viewport", parsed.viewport,
    "--out", factsPath,
    "--write-content-snapshot-file", snapshotPath,
    "--settle-ms", "1200",
  ], {
    cwd: packageDir,
    timeout: parsed.mobileContentSnapshotCdpTimeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!existsSync(snapshotPath)) fail(`CDP PWA content snapshot was not written: ${snapshotPath}`);
  return readContentSnapshotFile(snapshotPath, "cdp");
}

function readContentSnapshotFile(path, sourceKind) {
  if (!existsSync(path)) fail(`missing PWA content snapshot file: ${path}`);
  const parsed = parseContentSnapshotText(readFileSync(path, "utf8"), `${sourceKind}:${path}`);
  parsed.filePath = path;
  return parsed;
}

function parseContentSnapshotText(text, source) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(`invalid PWA content snapshot JSON from ${source}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const contents = extractContentSnapshotContents(parsed, source);
  validateContentSnapshotContents(contents, source);
  return {
    source,
    contents,
    storageJson: JSON.stringify(contents),
    rawJson: text,
    filePath: "",
  };
}

function extractContentSnapshotContents(parsed, source) {
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "string") return parseStorageJson(parsed, source);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(`PWA content snapshot ${source} must be an array or object`);
  }
  if (Array.isArray(parsed.contents)) return parsed.contents;
  if (Array.isArray(parsed.items)) return parsed.items;
  if (typeof parsed[distributedContentStorageKey] === "string") return parseStorageJson(parsed[distributedContentStorageKey], source);
  if (parsed.localStorage && typeof parsed.localStorage === "object" && typeof parsed.localStorage[distributedContentStorageKey] === "string") {
    return parseStorageJson(parsed.localStorage[distributedContentStorageKey], source);
  }
  fail(`PWA content snapshot ${source} does not contain contents/items/${distributedContentStorageKey}`);
}

function parseStorageJson(value, source) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) fail(`${distributedContentStorageKey} from ${source} is not an array`);
    return parsed;
  } catch (error) {
    fail(`invalid ${distributedContentStorageKey} JSON from ${source}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateContentSnapshotContents(contents, source) {
  if (!Array.isArray(contents) || contents.length === 0) fail(`PWA content snapshot ${source} has no contents`);
  if (!contents.some((item) => item && item.type === "video")) fail(`PWA content snapshot ${source} has no video item`);
  if (!contents.some((item) => item && item.type === "image")) fail(`PWA content snapshot ${source} has no image item`);
}

function contentSnapshotOneClickArgs(snapshot) {
  if (!snapshot) return [];
  if (snapshot.filePath) return ["--mobile-content-snapshot-file", snapshot.filePath];
  return ["--mobile-content-snapshot-json", snapshot.rawJson];
}

function parseViewport(value) {
  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) fail(`invalid viewport: ${value}`);
  return [Number(match[1]), Number(match[2])];
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

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function readApkBuildSummary(path) {
  const resolved = resolvePath(path);
  if (!existsSync(resolved)) fail(`missing APK build summary: ${resolved}`);
  const summary = readJsonIfExists(resolved);
  if (summary?.schema !== "unimaker.apk_build.v1") {
    fail(`unexpected APK build summary schema: ${summary?.schema ?? "missing"}`);
  }
  return { path: resolved, summary };
}

function readAndroidCaptureReport(path) {
  const resolved = resolvePath(path);
  if (!existsSync(resolved)) fail(`missing Android capture report: ${resolved}`);
  const report = readJsonIfExists(resolved);
  if (report?.schema !== "unimaker.android_headless_capture.v1") {
    fail(`unexpected Android capture report schema: ${report?.schema ?? "missing"}`);
  }
  const [width, height] = parseViewport(options.viewport);
  const rawPath = resolvePath(report.rawPath ?? "");
  const rawValid =
    report.available === true &&
    report.status === "ok" &&
    rawPath.length > 0 &&
    existsSync(rawPath) &&
    validateRawHeader(rawPath, width, height, Number(report.rawByteCount ?? 0), String(report.rawSha256 ?? ""));
  return {
    path: resolved,
    report: { ...report, rawPath },
    rawValid,
    summary: {
      path: resolved,
      available: report.available === true,
      status: report.status ?? "",
      reason: report.reason ?? "",
      error: report.error ?? "",
      routeState: report.routeState ?? "",
      viewport: report.viewport ?? "",
      rawPath,
      rawByteCount: Number(report.rawByteCount ?? 0),
      rawSha256: report.rawSha256 ?? "",
      device: report.device ?? "",
      deviceDir: report.deviceDir ?? "",
      command: report.command ?? "",
    },
  };
}

function validateRawHeader(path, width, height, expectedBytes, expectedSha256) {
  const payload = readFileSync(path);
  const byteCount = payload.length;
  const requiredBytes = 8 + width * height * 4;
  if (byteCount !== requiredBytes) return false;
  if (expectedBytes > 0 && byteCount !== expectedBytes) return false;
  if (payload.readUInt32LE(0) !== width || payload.readUInt32LE(4) !== height) return false;
  if (expectedSha256.length > 0) {
    const hash = (awaitlessSha256(payload));
    if (hash !== expectedSha256) return false;
  }
  return true;
}

function awaitlessSha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function summarizeApkHostCapture(summary) {
  const hostEntry = "lib/arm64-v8a/libcheng_generated_android_host.so";
  if (!summary) {
    return {
      supported: false,
      reason: "apk_build_summary_missing",
      requiredSymbols: ANDROID_HOST_CAPTURE_REQUIRED_SYMBOLS,
    };
  }
  const androidHostCapture = summary.android?.hostCapture ?? null;
  const androidHeadlessCapture = summary.android?.headlessCapture ?? null;
  const verified = Array.isArray(summary.verifiedApkPayloads) ? summary.verifiedApkPayloads : [];
  const hostDynsym = verified.find((record) =>
    record?.entry === hostEntry &&
    record?.verification === "elf-dynsym"
  ) ?? null;
  const dynsymSymbols = Array.isArray(hostDynsym?.requiredSymbols) ? hostDynsym.requiredSymbols : [];
  const dynsymSupported = ANDROID_HOST_CAPTURE_REQUIRED_SYMBOLS.every((symbol) => dynsymSymbols.includes(symbol));
  const androidSummarySupported =
    androidHostCapture?.supported === true &&
    ANDROID_HOST_CAPTURE_REQUIRED_SYMBOLS.every((symbol) =>
      Array.isArray(androidHostCapture.requiredSymbols) && androidHostCapture.requiredSymbols.includes(symbol)
    );
  const supported = dynsymSupported || androidSummarySupported;
  return {
    supported,
    reason: supported ? "" : "apk_host_capture_symbols_not_verified",
    apk: summary.apk ?? "",
    backend: supported ? (androidHostCapture?.backend ?? "egl_pbuffer_gles3") : "not_verified",
    output: supported ? (androidHostCapture?.output ?? "rgba_top_left") : "not_verified",
    hostLibraryEntry: hostEntry,
    headlessCaptureSupported: androidHeadlessCapture?.supported === true,
    headlessCaptureExecutable: androidHeadlessCapture?.executable ?? "",
    headlessCaptureRunCommand: androidHeadlessCapture?.runCommand ?? "",
    dynsymSupported,
    androidSummarySupported,
    requiredSymbols: ANDROID_HOST_CAPTURE_REQUIRED_SYMBOLS,
  };
}

function augmentPixelReport(path, payload, key = "chengOneClick") {
  const report = readJsonIfExists(path);
  if (!report) fail(`pixel oracle did not write report: ${path}`);
  report[key] = payload;
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n", "utf8");
}

function summarizeGlyphSdfPrecompute(glyph, cleanup = null) {
  if (!glyph) return null;
  const artifactsKept = options.keepIntermediates;
  return {
    source: artifactsKept ? (glyph.source ?? "") : "",
    report: artifactsKept ? (glyph.report ?? "") : "",
    output: artifactsKept && !cleanup?.glyphPrecomputeOutputRemoved ? (glyph.output ?? "") : "",
    sceneDataAsset: artifactsKept ? (glyph.sceneDataAsset ?? "") : "",
    pixelAsset: artifactsKept ? (glyph.pixelAsset ?? "") : "",
    cache: glyph.cache ? {
      schema: glyph.cache.schema,
      cacheHit: glyph.cache.cacheHit,
      cacheKey: glyph.cache.cacheKey,
      cacheOutputPath: glyph.cache.cacheOutputPath,
    } : null,
  };
}

function defaultOneClickCleanupSummary() {
  return {
    glyphPrecomputeOutputRemoved: true,
    intermediateFactsRemoved: true,
    removedFiles: [],
  };
}

function keptOneClickIntermediates(summary) {
  return {
    glyphPrecomputeOutputRemoved: false,
    intermediateFactsRemoved: false,
    removedFiles: [],
    glyphPrecomputeOutput: String(summary?.glyphSdfPrecompute?.output ?? ""),
  };
}

function cleanupPixelOracleArtifacts() {
  if (options.keepIntermediates) {
    return {
      intermediatesKept: true,
      workDirectoryRemoved: false,
      reactPixelsRemoved: false,
      chengPixelsRemoved: false,
      generatedSourcesAndExecutablesRemoved: false,
      digestBuildObjectsRemoved: false,
      fontSubsetsRemoved: false,
      runtimeSceneDataAndPixelsRemoved: false,
    };
  }

  const reactPixelsRemoved = existsSync(reactRawPath) || existsSync(reactPngPath);
  const chengPixelsRemoved = existsSync(chengRawPath) || existsSync(chengRunOutputPath);
  const generatedSourcesAndExecutablesRemoved = [
    "unimaker-react.cheng",
    "unimaker-react.scene-runtime.cheng",
    "unimaker-react.scene-runtime.digest.cheng",
    "unimaker-react.scene-glyph-sdf-precompute.cheng",
    "unimaker-react.scene-glyph-sdf-precompute",
    "unimaker-react",
  ].some((name) => existsSync(join(chengDir, name)));
  const digestBuildObjectsRemoved = existsSync(join(chengDir, "digest-desktop"));
  const fontSubsetsRemoved = existsSync(join(chengDir, "font-subsets"));
  const runtimeSceneDataAndPixelsRemoved =
    existsSync(join(chengDir, "runtime", "unimaker_scene_data.bin")) ||
    existsSync(join(chengDir, "runtime", "unimaker_glyph_sdf_pixels.bin"));
  rmSync(workDir, { recursive: true, force: true });

  return {
    intermediatesKept: false,
    workDirectoryRemoved: !existsSync(workDir),
    reactPixelsRemoved,
    chengPixelsRemoved,
    generatedSourcesAndExecutablesRemoved,
    digestBuildObjectsRemoved,
    fontSubsetsRemoved,
    runtimeSceneDataAndPixelsRemoved,
  };
}

function recordPixelArtifactCleanup(cleanup) {
  const report = readJsonIfExists(reportPath);
  if (!report) return;
  report.artifactCleanup = cleanup;
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
}

function fail(message) {
  process.stderr.write(`unimaker-pixel-oracle: ${message}\n`);
  process.exit(1);
}
