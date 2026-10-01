#!/usr/bin/env node
// Batch-capture UniMaker React PWA routes to raw RGBA files (8-byte header + RGBA)
// reusing ONE dev server and ONE headless Chrome for all routes. Seeds the
// distributed-content store from a current PWA snapshot so captures stay
// comparable with the Cheng retained scene without static demo content.
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startManagedProcess } from "./process-runner.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}

const projectRoot = arg("--project-root", "/Users/lbcheng/UniMaker/React.js");
const outDir = arg("--out-dir", "/tmp/react_truth_batch");
const routesFile = arg("--routes-file", "");
const [width, height] = arg("--viewport", "390x844").split("x").map(Number);
const port = Number(arg("--port", "45219"));
const chromePath = arg("--chrome-path", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
const settleMs = Number(arg("--settle-ms", "1500"));
const RANDOM_SEED = 0x52c32;
const huiwenCjkFontPath = "/Users/lbcheng/Library/Fonts/匯文明朝體.ttf";
const contentSnapshotFile = arg("--content-snapshot-file", arg("--mobile-content-snapshot-file", ""));
const contentSnapshotJson = arg("--content-snapshot-json", arg("--mobile-content-snapshot-json", ""));
const writeContentSnapshotFile = arg("--write-content-snapshot-file", "");
const cjkFontFile = arg("--cjk-font-file", huiwenCjkFontPath);
const cjkFontBase64 = readFileSync(resolve(cjkFontFile)).toString("base64");
const distributedContentStorageKey = "unimaker_distributed_contents_v1";
const contentSnapshotSchema = "unimaker.pwa.content_snapshot.v1";

const routes = readFileSync(routesFile, "utf8").split("\n").map((line) => line.trim()).filter(Boolean);
if (routes.length === 0) {
  process.stderr.write("no routes\n");
  process.exit(1);
}
const contentSnapshot = resolveContentSnapshotOption();

function resolveContentSnapshotOption() {
  if (contentSnapshotJson.trim().length > 0) return parseContentSnapshotText(contentSnapshotJson, "cli-json");
  if (contentSnapshotFile.trim().length > 0) {
    const path = resolve(contentSnapshotFile.trim());
    if (!existsSync(path)) throw new Error(`missing PWA content snapshot file: ${path}`);
    return parseContentSnapshotText(readFileSync(path, "utf8"), path);
  }
  throw new Error("--content-snapshot-file or --content-snapshot-json is required; static demo feed is forbidden");
}

function parseContentSnapshotText(text, source) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid PWA content snapshot JSON from ${source}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const contents = extractSnapshotContents(parsed, source);
  validateSnapshotContents(contents, source);
  return { source, contents, storageJson: JSON.stringify(contents) };
}

function extractSnapshotContents(parsed, source) {
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "string") return parseStorageJson(parsed, source);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`PWA content snapshot ${source} must be an array or object`);
  }
  if (Array.isArray(parsed.contents)) return parsed.contents;
  if (Array.isArray(parsed.items)) return parsed.items;
  if (typeof parsed[distributedContentStorageKey] === "string") return parseStorageJson(parsed[distributedContentStorageKey], source);
  if (parsed.localStorage && typeof parsed.localStorage === "object" && typeof parsed.localStorage[distributedContentStorageKey] === "string") {
    return parseStorageJson(parsed.localStorage[distributedContentStorageKey], source);
  }
  throw new Error(`PWA content snapshot ${source} does not contain contents/items/${distributedContentStorageKey}`);
}

function parseStorageJson(value, source) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`invalid ${distributedContentStorageKey} JSON from ${source}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${distributedContentStorageKey} from ${source} is not an array`);
  return parsed;
}

function validateSnapshotContents(contents, source) {
  if (!Array.isArray(contents) || contents.length === 0) throw new Error(`PWA content snapshot ${source} has no contents`);
  const video = contents.find((item) => item && item.type === "video");
  const image = contents.find((item) => item && item.type === "image");
  if (!video) throw new Error(`PWA content snapshot ${source} has no video item`);
  if (!image) throw new Error(`PWA content snapshot ${source} has no image item`);
  for (let index = 0; index < contents.length; index += 1) {
    const item = contents[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`PWA content snapshot ${source} item ${index} must be an object`);
    for (const key of ["id", "type", "publishCategory", "userId", "userName", "avatar", "content"]) {
      if (typeof item[key] !== "string") throw new Error(`PWA content snapshot ${source} item ${index} missing string ${key}`);
    }
    for (const key of ["likes", "comments", "timestamp"]) {
      if (typeof item[key] !== "number" || !Number.isFinite(item[key])) throw new Error(`PWA content snapshot ${source} item ${index} missing finite number ${key}`);
    }
  }
}

async function writeCurrentContentSnapshot(page, outPath) {
  if (!outPath.trim()) return;
  const storageJson = await page.evaluate((key) => window.localStorage.getItem(key) ?? "", distributedContentStorageKey);
  if (!storageJson) throw new Error(`PWA localStorage missing ${distributedContentStorageKey}; cannot write snapshot`);
  const contents = parseStorageJson(storageJson, "browser-localStorage");
  validateSnapshotContents(contents, "browser-localStorage");
  writeFileSync(resolve(outPath), JSON.stringify({
    schema: contentSnapshotSchema,
    storageKey: distributedContentStorageKey,
    capturedAt: new Date().toISOString(),
    contents,
  }, null, 2) + "\n", "utf8");
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`React dev server did not come up at ${url}`);
}

let server;
try {
  process.stderr.write(`[1/3] dev server (port ${port})...\n`);
  server = startManagedProcess("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: projectRoot,
    env: { ...process.env },
  });
  const base = `http://127.0.0.1:${port}`;
  await waitForHttp(`${base}/`, 60000);

  const puppeteer = (await import("puppeteer")).default;
  const sharp = (await import("sharp")).default;
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: chromePath,
    pipe: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    timeout: 120000,
  });
  try {
    let done = 0;
    for (const route of routes) {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: true });
        const seedJson = contentSnapshot.storageJson;
        await page.evaluateOnNewDocument((json, seed) => {
          window.localStorage.setItem("unimaker_distributed_contents_v1", json);
          let a = seed >>> 0;
          Math.random = () => {
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
        }, seedJson, RANDOM_SEED);
        if (done === 0) {
          process.stderr.write(`  seeded PWA content snapshot: ${contentSnapshot.contents.length} items from ${contentSnapshot.source}\n`);
        }
        await page.goto(`${base}/?r2c_truth=1&r2c_route=${route}`, { waitUntil: "networkidle0", timeout: 45000 });
        if (cjkFontBase64) {
          // Mirror the scene-side font cascade: CJK -> injected face, latin falls
          // through to the system stack (same split as SFNS + 匯文明朝體 faces).
          await page.addStyleTag({ content: [
            "@font-face { font-family: 'ChengTruthCJK'; font-weight: 100 900;",
            `  src: url(data:font/ttf;base64,${cjkFontBase64}) format('truetype');`,
            "  unicode-range: U+2E80-303F, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FE30-FE4F, U+FF00-FFEF; }",
            "html, body, * { font-family: 'ChengTruthCJK', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif !important; }",
          ].join("\n") });
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
        }
        await new Promise((r) => setTimeout(r, settleMs));
        if (done === 0) await writeCurrentContentSnapshot(page, writeContentSnapshotFile);
        const png = await page.screenshot({ type: "png", fullPage: false });
        const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        if (info.width !== width || info.height !== height || info.channels !== 4) {
          throw new Error(`size mismatch ${info.width}x${info.height}x${info.channels}`);
        }
        const header = Buffer.alloc(8);
        header.writeUInt32LE(width, 0);
        header.writeUInt32LE(height, 4);
        writeFileSync(join(outDir, `${route}.raw`), Buffer.concat([header, data]));
        done += 1;
        process.stderr.write(`[${done}/${routes.length}] ${route} ok\n`);
      } catch (error) {
        process.stderr.write(`[!] ${route} FAILED: ${String(error).slice(0, 120)}\n`);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  if (server) {
    try { server.kill?.(); } catch {}
    try { process.kill(-server.pid, "SIGKILL"); } catch {}
    try { process.kill(server.pid, "SIGKILL"); } catch {}
  }
}
process.stdout.write("batch capture done\n");
process.exit(0);
