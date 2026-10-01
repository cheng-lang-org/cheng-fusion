#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startManagedProcess } from "./process-runner.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const defaultProjectRoot = "/Users/lbcheng/UniMaker/React.js";
const storageKey = "unimaker_distributed_contents_v1";
const snapshotSchema = "unimaker.pwa.content_snapshot.v1";

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(helpText());
  process.exit(0);
}

let server = null;
let browser = null;

try {
  if (!existsSync(resolve(options.projectRoot, "package.json"))) {
    fail(`missing PWA package.json: ${resolve(options.projectRoot, "package.json")}`);
  }
  const baseUrl = options.baseUrl || `http://127.0.0.1:${options.port}/`;
  if (!options.baseUrl) {
    server = startManagedProcess("npm", [
      "run",
      "dev",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      String(options.port),
      "--strictPort",
    ], {
      cwd: options.projectRoot,
      env: { ...process.env, BROWSER: "none" },
    });
    await waitForHttp(baseUrl, options.serverTimeoutMs);
  }

  const puppeteer = (await import("puppeteer")).default;
  browser = await puppeteer.launch({
    headless: options.headless,
    executablePath: options.chromePath || chromeExecutablePath(),
    pipe: true,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
    timeout: options.browserTimeoutMs,
  });
  const page = await browser.newPage();
  await page.setViewport({
    width: options.viewport.width,
    height: options.viewport.height,
    deviceScaleFactor: 1,
    isMobile: true,
  });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: options.navigationTimeoutMs });
  await page.evaluate(async () => {
    if (!("fonts" in document)) throw new Error("document.fonts is not available");
    await document.fonts.ready;
  });

  const result = await page.evaluate(async (input) => {
    const distributed = await import("/app/data/distributedContent.ts");
    const media = await import("/app/data/p2pMedia.ts");

    function bytesToBase64(bytes) {
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    }

    async function fetchBytes(path) {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`fetch failed ${response.status}: ${path}`);
      const mime = response.headers.get("content-type") || "";
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        mime,
      };
    }

    async function fetchDataUrl(path, fallbackMime) {
      const payload = await fetchBytes(path);
      const mime = payload.mime || fallbackMime;
      if (!mime.startsWith("image/")) throw new Error(`not an image response for ${path}: ${mime}`);
      return `data:${mime};base64,${bytesToBase64(payload.bytes)}`;
    }

    localStorage.removeItem(input.storageKey);
    distributed.seedSmokePublishLocationFromCoordinates(
      input.location.latitude,
      input.location.longitude,
      input.location.accuracy,
    );

    const videoPayload = await fetchBytes(input.videoPath);
    const videoEntry = await media.stageVideoBytesForSegmentedPublish({
      bytes: videoPayload.bytes,
      fileName: input.videoFileName,
      mimeType: input.videoMime,
      slot: "primary",
    });
    const videoFastOpen = media.serializeFastOpenForCore(
      media.tryExtractFastPlaybackReference(videoEntry),
    );
    const videoPosterDataUrl = await fetchDataUrl(input.videoPosterPath, "image/png");
    const videoExtra = {
      contentKind: "content",
      contentKindLabel: "视频",
      rightsType: "original",
      isOriginal: true,
      copyrightConfirmed: true,
      mediaTransfer: media.serializeMediaTransferEntries([videoEntry]),
      ...(videoFastOpen ? { fastOpen: videoFastOpen } : {}),
      // sourcePeer = this publish run's own LAN IP + media fetch port, supplied explicitly
      // by the caller via --source-peer-host/--source-peer-port (this desktop puppeteer
      // process has no device identity of its own, so it never guesses one). Cross-device
      // consumer generators (unimaker-one-click.mjs contentWithMediaManifest) read this to
      // emit a non-empty slot.peerHost for direct device-to-device media fetch.
      ...(input.sourcePeerHost ? {
        sourcePeer: {
          host: input.sourcePeerHost,
          port: input.sourcePeerPort,
          ...(input.sourcePeerRole ? { role: input.sourcePeerRole } : {}),
        },
      } : {}),
    };
    const video = await distributed.publishDistributedContent({
      publishCategory: "content",
      type: "video",
      title: input.videoTitle,
      content: input.videoContent,
      locationHint: input.locationHint,
      locationDisplayLevel: "city",
      tinyPreview: videoPosterDataUrl,
      coverMedia: videoPosterDataUrl,
      media: videoEntry.publishedUri,
      mediaItems: [videoEntry.publishedUri],
      mediaAspectRatio: input.videoAspectRatio,
      extra: videoExtra,
    });

    const imagePayload = await fetchBytes(input.imagePath);
    const imageEntry = await media.stageImageBytesForSegmentedPublish({
      bytes: imagePayload.bytes,
      fileName: input.imageFileName,
      mimeType: input.imageMime,
      slot: "primary",
    });
    const image = await distributed.publishDistributedContent({
      publishCategory: "graphic",
      type: "image",
      title: input.imageTitle,
      content: input.imageContent,
      locationHint: input.locationHint,
      locationDisplayLevel: "city",
      media: imageEntry.publishedUri,
      mediaItems: [imageEntry.publishedUri],
      mediaAspectRatio: input.imageAspectRatio,
      extra: {
        contentKind: "graphic",
        contentKindLabel: "图文",
        rightsType: "original",
        isOriginal: true,
        copyrightConfirmed: true,
        mediaTransfer: media.serializeMediaTransferEntries([imageEntry]),
      },
    });

    let storageJson = "";
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      storageJson = localStorage.getItem(input.storageKey) || "";
      if (storageJson) {
        try {
          const pendingContents = JSON.parse(storageJson);
          if (Array.isArray(pendingContents) && pendingContents.length >= 2) break;
        } catch {
          storageJson = "";
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!storageJson) throw new Error(`${input.storageKey} was not written`);
    const contents = JSON.parse(storageJson);
    if (!Array.isArray(contents) || contents.length < 2) {
      throw new Error(`unexpected snapshot content count: ${Array.isArray(contents) ? contents.length : -1}`);
    }
    return {
      videoId: video.id,
      imageId: image.id,
      storageJson,
      contents,
      videoEntry: {
        publishedUri: videoEntry.publishedUri,
        deliveryMode: videoEntry.deliveryMode || "",
        segmentCount: videoEntry.segmentedManifest?.segments?.length || 0,
        fastOpenBytes: videoEntry.fastOpen?.sizeBytes || 0,
      },
      imageEntry: {
        publishedUri: imageEntry.publishedUri,
        deliveryMode: imageEntry.deliveryMode || "",
        segmentCount: imageEntry.segmentedManifest?.segments?.length || 0,
      },
    };
  }, {
    storageKey,
    videoPath: options.videoPath,
    videoPosterPath: options.videoPosterPath,
    imagePath: options.imagePath,
    videoFileName: options.videoFileName,
    imageFileName: options.imageFileName,
    videoMime: options.videoMime,
    imageMime: options.imageMime,
    videoTitle: options.videoTitle,
    videoContent: options.videoContent,
    imageTitle: options.imageTitle,
    imageContent: options.imageContent,
    videoAspectRatio: options.videoAspectRatio,
    imageAspectRatio: options.imageAspectRatio,
    location: options.location,
    locationHint: options.locationHint,
    sourcePeerHost: options.sourcePeerHost,
    sourcePeerPort: options.sourcePeerPort,
    sourcePeerRole: options.sourcePeerRole,
  });

  const snapshot = {
    schema: snapshotSchema,
    storageKey,
    capturedAt: new Date().toISOString(),
    source: "pwa-publish",
    videoId: result.videoId,
    imageId: result.imageId,
    videoEntry: result.videoEntry,
    imageEntry: result.imageEntry,
    [storageKey]: result.storageJson,
    contents: result.contents,
  };
  mkdirSync(dirname(resolve(options.out)), { recursive: true });
  writeFileSync(resolve(options.out), JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  process.stdout.write(`unimaker-pwa-publish-snapshot ok\n`);
  process.stdout.write(`snapshot: ${resolve(options.out)}\n`);
  process.stdout.write(`video: ${result.videoId} ${result.videoEntry.deliveryMode} segments=${result.videoEntry.segmentCount} fastOpenBytes=${result.videoEntry.fastOpenBytes}\n`);
  process.stdout.write(`image: ${result.imageId} ${result.imageEntry.deliveryMode} segments=${result.imageEntry.segmentCount}\n`);
} catch (error) {
  process.stderr.write(`unimaker-pwa-publish-snapshot: ${error?.stack || error?.message || String(error)}\n`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await server.stop().catch(() => {});
}

function parseArgs(args) {
  const parsed = {
    help: false,
    projectRoot: defaultProjectRoot,
    out: resolve(repoRoot, "ts-csg", "tmp", "unimaker-pwa-content-snapshot.json"),
    baseUrl: "",
    port: 45221,
    viewport: parseViewport("390x844"),
    headless: true,
    chromePath: "",
    browserTimeoutMs: 120000,
    navigationTimeoutMs: 120000,
    serverTimeoutMs: 120000,
    videoPath: "/pwa-smoke/胡广生.mp4",
    videoPosterPath: "/pwa-smoke/content-smoke-video-cover.png",
    imagePath: "/pwa-smoke/content-smoke-image.png",
    videoFileName: "胡广生.mp4",
    imageFileName: "content-smoke-image.png",
    videoMime: "video/mp4",
    imageMime: "image/png",
    videoTitle: "content-sync-video-android-e2e",
    videoContent: "UniMaker Android smooth playback E2E",
    imageTitle: "content-sync-image-android-e2e",
    imageContent: "UniMaker Android graphic content E2E",
    videoAspectRatio: 1304 / 2320,
    imageAspectRatio: 1,
    location: { latitude: 37.7749, longitude: -122.4194, accuracy: 50 },
    locationHint: { country: "中国", province: "河南省", city: "三门峡市", district: "陕州区" },
    sourcePeerHost: "",
    sourcePeerPort: 0,
    sourcePeerRole: "",
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      i += 1;
      if (i >= args.length) fail(`missing value for ${arg}`);
      return args[i];
    };
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--project-root") parsed.projectRoot = resolve(next());
    else if (arg === "--out") parsed.out = resolve(next());
    else if (arg === "--base-url") parsed.baseUrl = next().trim();
    else if (arg === "--port") parsed.port = positiveInt(next(), arg);
    else if (arg === "--viewport") parsed.viewport = parseViewport(next());
    else if (arg === "--headed") parsed.headless = false;
    else if (arg === "--chrome-path") parsed.chromePath = resolve(next());
    else if (arg === "--video-path") parsed.videoPath = next();
    else if (arg === "--video-poster-path") parsed.videoPosterPath = next();
    else if (arg === "--image-path") parsed.imagePath = next();
    else if (arg === "--video-file-name") parsed.videoFileName = next();
    else if (arg === "--video-title") parsed.videoTitle = next();
    else if (arg === "--video-content") parsed.videoContent = next();
    else if (arg === "--image-title") parsed.imageTitle = next();
    else if (arg === "--image-content") parsed.imageContent = next();
    else if (arg === "--server-timeout-ms") parsed.serverTimeoutMs = positiveInt(next(), arg);
    else if (arg === "--source-peer-host") parsed.sourcePeerHost = next().trim();
    else if (arg === "--source-peer-port") parsed.sourcePeerPort = positiveInt(next(), arg);
    else if (arg === "--source-peer-role") parsed.sourcePeerRole = next().trim();
    else fail(`unknown arg: ${arg}`);
  }
  if (parsed.sourcePeerHost.length > 0 && parsed.sourcePeerPort <= 0) {
    fail("--source-peer-host requires --source-peer-port (this device's own media fetch port; no default is assumed)");
  }
  return parsed;
}

function parseViewport(value) {
  const match = String(value).match(/^([1-9][0-9]*)x([1-9][0-9]*)$/);
  if (!match) fail(`invalid viewport: ${value}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

function positiveInt(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(`${label} must be a positive integer`);
  return parsed;
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fail(`timed out waiting for ${url}`);
}

function chromeExecutablePath() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return "";
}

function helpText() {
  return `Usage: node scripts/unimaker-pwa-publish-snapshot.mjs --out <snapshot.json> [flags]\n`;
}

function fail(message) {
  throw new Error(message);
}
