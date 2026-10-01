#!/usr/bin/env node
/**
 * html-csg-navigate.mjs — 入口页渲染 + 按跳转链接 BFS 逐页实时渲染(冷态全链)。
 * 每页调用 html-csg-render.mjs 子进程(编译/字体缓存落盘跨进程共享),
 * 汇总 navigate-summary.json。
 *
 * 用法:
 *   node scripts/html-csg-navigate.mjs --url http://host/gdt/GDT.html [--follow 1] [--max-pages 8]
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");

const options = (() => {
  const parsed = { url: "", outDir: "", follow: 1, maxPages: 8, viewport: "1024x768", engine: "chrome" };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => { i += 1; if (i >= args.length) fail("missing value for " + arg); return args[i]; };
    if (arg === "--url") parsed.url = next();
    else if (arg === "--out-dir") parsed.outDir = next();
    else if (arg === "--follow") parsed.follow = Number(next());
    else if (arg === "--max-pages") parsed.maxPages = Number(next());
    else if (arg === "--viewport") parsed.viewport = next();
    else if (arg === "--user-agent") parsed.userAgent = next();
    else if (arg === "--engine") parsed.engine = next();
    else if (arg === "--help" || arg === "-h") { process.stdout.write(helpText()); process.exit(0); }
    else fail("unknown argument: " + arg);
  }
  if (!parsed.url) fail("pass --url <entry-url>");
  if (!parsed.outDir) parsed.outDir = join(packageDir, "tmp", "html-csg-navigate");
  parsed.outDir = resolve(parsed.outDir);
  if (parsed.engine !== "chrome" && parsed.engine !== "direct") fail("--engine must be chrome|direct");
  return parsed;
})();

function fail(message) {
  process.stderr.write("html-csg-navigate: " + message + "\n");
  process.exit(1);
}

function helpText() {
  return [
    "html-csg-navigate",
    "",
    "Usage:",
    "  node scripts/html-csg-navigate.mjs --url <entry-url> [--engine chrome|direct]",
    "    [--follow <depth>] [--max-pages <n>] [--viewport <WxH>] [--user-agent <ua>]",
    "",
    "Renders the entry page, then follows same-origin <a href> links BFS-style.",
    "",
    "  --engine chrome (default): headless-Chrome snapshot each page into",
    "    pageDir/snapshot.html (real computed styles inlined), then render the snapshot.",
    "  --engine direct: render each fetched URL directly (previous behavior).",
    "",
  ].join("\n");
}

function slugFor(url, index) {
  let path = "/";
  try { path = new URL(url).pathname; } catch {}
  const base = path.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "index";
  return String(index).padStart(2, "0") + "-" + base;
}

// 渲染引擎仅在 --url 是 http(s) 时才走它自己的链接 walker;chrome 模式喂给它的是
// 本地 snapshot.html,它不会发现任何链接。快照是 Chrome outerHTML 序列化的文档,
// 这里在导航层从它找回同源 <a href>,维持 BFS 多页跟随。
function decodeEntityText(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function extractSameOriginLinks(htmlText, baseUrl) {
  let base;
  try { base = new URL(baseUrl); } catch { return []; }
  const found = [];
  const seen = new Set();
  const hrefRe = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m;
  while ((m = hrefRe.exec(htmlText)) !== null) {
    const raw = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3];
    if (!raw) continue;
    const href = decodeEntityText(raw);
    if (!href || /^(?:javascript:|mailto:|tel:|#)/i.test(href)) continue;
    try {
      const resolved = new URL(href, base);
      resolved.hash = "";
      if ((resolved.protocol === "http:" || resolved.protocol === "https:") && resolved.host === base.host && !seen.has(resolved.href)) {
        seen.add(resolved.href);
        found.push(resolved.href);
      }
    } catch {}
  }
  return found;
}

mkdirSync(options.outDir, { recursive: true });
const enginePath = join(scriptDir, "html-csg-render.mjs");
const snapshotEnginePath = join(scriptDir, "html-csg-chrome-snapshot.mjs");
const queue = [{ url: options.url, depth: 0 }];
const renderedUrls = new Set();
const pages = [];

// 渲染引擎参数:chrome 模式把 --url 指向本地 snapshot.html,direct 模式指向原始 url。
const renderRunArgs = (targetUrl, pageDir) => [
  enginePath,
  "--url", targetUrl,
  "--out-dir", pageDir,
  "--font-cache-dir", join(options.outDir, "font-cache"),
  "--viewport", options.viewport,
  "--links-out", join(pageDir, "links.json"),
  ...(options.userAgent ? ["--user-agent", options.userAgent] : []),
];

while (queue.length > 0 && renderedUrls.size < options.maxPages) {
  const { url, depth } = queue.shift();
  if (renderedUrls.has(url)) continue;
  renderedUrls.add(url);
  const slug = slugFor(url, renderedUrls.size);
  const pageDir = join(options.outDir, slug);
  process.stderr.write("\n=== [" + renderedUrls.size + "/" + options.maxPages + "] depth=" + depth + " " + url + "\n");

  let status = "rendered";
  let snapshotMs = null;
  let snapshotBytes = null;
  let snapshotError = null;

  if (options.engine === "chrome") {
    const snapshotHtml = join(pageDir, "snapshot.html");
    const snapStart = Date.now();
    const snap = spawnSync(process.execPath, [
      snapshotEnginePath,
      "--url", url,
      "--out", snapshotHtml,
      "--viewport", options.viewport,
      ...(options.userAgent ? ["--ua", options.userAgent] : []),
    ], { encoding: "utf8", timeout: 150000, maxBuffer: 64 * 1024 * 1024 });
    snapshotMs = Date.now() - snapStart;
    try { snapshotBytes = statSync(snapshotHtml).size; } catch {}
    if (snap.status !== 0) {
      status = "snapshot_failed";
      snapshotError = ((snap.stderr || "").trim().split("\n").slice(-3).join(" ")) || ("exit " + snap.status);
    } else {
      const child = spawnSync(process.execPath, renderRunArgs(snapshotHtml, pageDir), { encoding: "utf8", timeout: 900000, maxBuffer: 64 * 1024 * 1024 });
      status = child.status === 0 ? "rendered" : "render_failed";
    }
  } else {
    const child = spawnSync(process.execPath, renderRunArgs(url, pageDir), { encoding: "utf8", timeout: 900000, maxBuffer: 64 * 1024 * 1024 });
    status = child.status === 0 ? "rendered" : "render_failed";
  }

  let timings = null;
  let links = [];
  try { timings = JSON.parse(readFileSync(join(pageDir, "render-timings.json"), "utf8")); } catch {}
  if (status === "rendered") {
    // chrome 模式:渲染引擎只对 http url 走链接 walker,喂本地 snapshot 会得到空链接,
    // 从快照序列化 DOM 找回同源 <a href>,维持 BFS 多页跟随。
    if (options.engine === "chrome") {
      try {
        links = extractSameOriginLinks(readFileSync(join(pageDir, "snapshot.html"), "utf8"), url);
        writeFileSync(join(pageDir, "links.json"), JSON.stringify({ schema: "html_csg_navigate.links.v1", source: url, links }, null, 2) + "\n");
      } catch {}
    } else {
      try { links = JSON.parse(readFileSync(join(pageDir, "links.json"), "utf8")).links ?? []; } catch {}
    }
  }

  const page = {
    url,
    slug,
    depth,
    engine: options.engine,
    status,
    snapshotMs,
    snapshotBytes,
    title: timings ? (timings.outputs ? undefined : undefined) : undefined,
    totalMs: timings ? timings.totalMs : null,
    failedStage: timings ? timings.failedStage ?? null : null,
    httpStatus: timings ? (timings.stages.find((s) => s.name === "fetch") ?? {}).httpStatus ?? null : null,
    links,
    pageDir,
  };
  if (snapshotError) page.snapshotError = snapshotError;
  pages.push(page);

  if (status === "rendered") {
    process.stderr.write("    ok totalMs=" + (timings ? timings.totalMs : "?") + " links=" + links.length + "\n");
    if (depth < options.follow) {
      for (const link of links) {
        if (!renderedUrls.has(link) && renderedUrls.size + queue.length < options.maxPages + queue.length) {
          if (![...renderedUrls, ...queue.map((q) => q.url)].includes(link)) queue.push({ url: link, depth: depth + 1 });
        }
      }
    }
  } else {
    process.stderr.write("    " + status + (snapshotError ? " " + snapshotError : " stage=" + (timings ? timings.failedStage : "?")) + "\n");
  }
}

const summary = {
  schema: "html_csg_navigate.summary.v1",
  engine: options.engine,
  entry: options.url,
  follow: options.follow,
  maxPages: options.maxPages,
  viewport: options.viewport,
  pages,
  renderedCount: pages.filter((p) => p.status === "rendered").length,
  failedCount: pages.filter((p) => p.status !== "rendered").length,
};
writeFileSync(join(options.outDir, "navigate-summary.json"), JSON.stringify(summary, null, 2) + "\n");
process.stdout.write("\nhtml-csg-navigate ok: rendered=" + summary.renderedCount + " failed=" + summary.failedCount + "\n");
for (const page of pages) {
  process.stdout.write("  [" + page.status + "] " + page.url + "  totalMs=" + page.totalMs + "  -> " + page.pageDir + "\n");
}
process.stdout.write("  summary: " + join(options.outDir, "navigate-summary.json") + "\n");