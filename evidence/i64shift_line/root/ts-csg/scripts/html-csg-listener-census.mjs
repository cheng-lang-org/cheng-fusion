#!/usr/bin/env node
/**
 * html-csg-listener-census.mjs — 真浏览器事件绑定真值普查。
 *
 * 用 CDP DOMDebugger.getEventListeners 逐元素取出真实绑定(内联 on* 属性与
 * addEventListener 均会被 Chrome 报出),产出结构化清单供纯 Cheng 侧 1:1 对齐
 * 与命中计数核对。
 *
 * 用法:
 *   node scripts/html-csg-listener-census.mjs --url <http-url> [--out <json>] [--viewport 1280x800]
 */
import { mkdirSync, accessSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// 必须与 html-csg-render.mjs 的取值一致: 该站点按 UA 返回不同标记,
// UA 不一致则抓到的 DOM 与管线消费的 snapshot.html 不是同一个页面。
const DEFAULT_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const options = (() => {
  const p = { url: "", out: "", viewport: "1280x800", timeoutMs: 90000, ua: DEFAULT_UA };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const next = () => { i += 1; if (i >= args.length) fail("missing value for " + args[i - 1]); return args[i]; };
    if (args[i] === "--url") p.url = next();
    else if (args[i] === "--out") p.out = next();
    else if (args[i] === "--ua") p.ua = next();
    else if (args[i] === "--viewport") p.viewport = next();
    else if (args[i] === "--timeout") p.timeoutMs = Number(next());
    else fail("unknown argument: " + args[i]);
  }
  if (!p.url) fail("pass --url <http-url>");
  return p;
})();

function fail(m) { process.stderr.write("html-csg-listener-census: " + m + "\n"); process.exit(1); }

function chromeExecutablePath() {
  for (const p of [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ]) { try { accessSync(p); return p; } catch { } }
  return undefined;
}

const puppeteer = (await import("puppeteer")).default;
const [vw, vh] = options.viewport.split("x").map(Number);

const browser = await puppeteer.launch({
  headless: true,
  executablePath: chromeExecutablePath(),
  pipe: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
         "--disable-blink-features=AutomationControlled", `--window-size=${vw},${vh}`],
  defaultViewport: { width: vw, height: vh },
});
const page = await browser.newPage();
await page.setUserAgent(options.ua);
await page.goto(options.url, { waitUntil: "networkidle2", timeout: options.timeoutMs });
await new Promise((r) => setTimeout(r, 2500));

const client = await page.createCDPSession();
await client.send("DOM.enable");
await client.send("Runtime.enable");
// DOMDebugger.enable is not exposed on a page-scoped session in current
// Chrome; getEventListeners works without it.

// Walk the node tree from getDocument: describeNode does not carry
// `attributes` on a page-scoped session, the tree returned by getDocument does.
const { root } = await client.send("DOM.getDocument", { depth: -1, pierce: false });
const docOrder = [];
(function walk(node) {
  if (!node) return;
  if (node.nodeType === 1) docOrder.push(node);
  for (const child of node.children ?? []) walk(child);
  for (const child of node.contentDocument?.children ?? []) walk(child);
})(root);

const elements = [];
let inlineAttrCount = 0;
let queryFailures = 0;

for (let index = 0; index < docOrder.length; index += 1) {
  const desc = docOrder[index];
  const nodeId = desc.nodeId;
  const attrs = {};
  const raw = desc.attributes ?? [];
  for (let k = 0; k + 1 < raw.length; k += 2) attrs[raw[k]] = raw[k + 1];
  const inlineHandlers = Object.keys(attrs).filter((k) => /^on[a-z]+$/i.test(k));
  inlineAttrCount += inlineHandlers.length;

  let listeners = [];
  try {
    const { object } = await client.send("DOM.resolveNode", { nodeId });
    const res = await client.send("DOMDebugger.getEventListeners", { objectId: object.objectId });
    listeners = (res.listeners ?? []).map((l) => ({
      type: l.type,
      useCapture: Boolean(l.useCapture),
      passive: Boolean(l.passive),
      once: Boolean(l.once),
      handlerName: l.handler?.description?.split("\n")[0]?.slice(0, 120) ?? "",
      scriptId: l.scriptId ?? "",
      lineNumber: l.lineNumber ?? -1,
    }));
  } catch { queryFailures += 1; }

  const hasInline = inlineHandlers.length > 0;
  if (listeners.length === 0 && !hasInline) continue;
  elements.push({
    index,
    backendNodeId: desc.backendNodeId,
    tag: (desc.nodeName || "").toLowerCase(),
    id: attrs.id ?? "",
    className: attrs.class ?? "",
    inlineHandlerAttrs: inlineHandlers,
    listeners,
  });
}

// document / window 级委托绑定单独统计: 它们不是元素级绑定,不能计入元素 1:1
const delegated = [];
for (const target of ["document", "window"]) {
  try {
    const { result } = await client.send("Runtime.evaluate", { expression: target, returnByValue: false });
    const res = await client.send("DOMDebugger.getEventListeners", { objectId: result.objectId });
    for (const l of res.listeners ?? []) {
      delegated.push({ target, type: l.type, useCapture: Boolean(l.useCapture), handlerName: l.handler?.description?.split("\n")[0]?.slice(0, 120) ?? "" });
    }
  } catch { /* target unavailable */ }
}

const byType = {};
let elementBindingCount = 0;
for (const e of elements) {
  for (const l of e.listeners) {
    byType[l.type] = (byType[l.type] ?? 0) + 1;
    elementBindingCount += 1;
  }
}
const inlineByType = {};
for (const e of elements) {
  for (const a of e.inlineHandlerAttrs) {
    const t = a.slice(2).toLowerCase();
    inlineByType[t] = (inlineByType[t] ?? 0) + 1;
  }
}

const report = {
  schema: "html_csg_listener_census.v1",
  url: options.url,
  viewport: options.viewport,
  userAgent: options.ua,
  capturedAt: new Date().toISOString(),
  domNodeCount: docOrder.length,
  elementsWithBindings: elements.length,
  elementBindingCount,
  bindingsByType: byType,
  inlineHandlerAttrCount: inlineAttrCount,
  inlineByType,
  delegatedOnDocumentOrWindow: delegated,
  queryFailures,
  elements,
};

await browser.close();

const text = JSON.stringify(report, null, 2) + "\n";
if (options.out) {
  mkdirSync(dirname(resolve(options.out)), { recursive: true });
  writeFileSync(options.out, text);
}
process.stdout.write(JSON.stringify({
  domNodeCount: report.domNodeCount,
  elementsWithBindings: report.elementsWithBindings,
  elementBindingCount: report.elementBindingCount,
  bindingsByType: report.bindingsByType,
  inlineByType: report.inlineByType,
  delegated: report.delegatedOnDocumentOrWindow.length,
  out: options.out,
}, null, 2) + "\n");
