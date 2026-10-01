#!/usr/bin/env node
/**
 * html-csg-chrome-snapshot.mjs — 真浏览器真值快照。
 * Chrome(无头)加载目标页(过防红/会话/JS),等待网络空闲后把每个元素的
 * 计算样式内联为 style 属性,产出单文件 snapshot.html 供 html-csg-render 消费。
 * 运行时 CSS 匹配子集的缺口由此被绕开:样式以每元素具体值落地。
 */
import { mkdirSync, accessSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const options = (() => {
  const parsed = {
    url: "", out: "", viewport: "1024x768", ua: DEFAULT_UA, timeoutMs: 60000,
    connect: "", noNav: false, headed: false, debugPort: 0, waitToolbar: false, screenshotAt: "inlined",
  };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => { i += 1; if (i >= args.length) fail("missing value for " + arg); return args[i]; };
    if (arg === "--url") parsed.url = next();
    else if (arg === "--out") parsed.out = next();
    else if (arg === "--viewport") parsed.viewport = next();
    else if (arg === "--ua") parsed.ua = next();
    else if (arg === "--timeout") parsed.timeoutMs = Number(next());
    else if (arg === "--screenshot") parsed.screenshot = next();
    else if (arg === "--connect") parsed.connect = next();
    else if (arg === "--no-nav") parsed.noNav = true;
    else if (arg === "--headed") parsed.headed = true;
    else if (arg === "--debug-port") parsed.debugPort = Number(next());
    else if (arg === "--wait-toolbar") parsed.waitToolbar = true;
    else if (arg === "--screenshot-at") parsed.screenshotAt = next();
    else fail("unknown argument: " + arg);
  }
  if (!parsed.url) fail("pass --url <http-url-or-file>");
  if (!parsed.out) parsed.out = join(resolve(parsed.url).replace(/\\.[^.]*$/, "") + ".snapshot.html");
  if (parsed.screenshotAt !== "live" && parsed.screenshotAt !== "inlined") fail("--screenshot-at must be live|inlined");
  if (parsed.noNav && !parsed.connect) fail("--no-nav requires --connect");
  return parsed;
})();

function fail(message) {
  process.stderr.write("html-csg-chrome-snapshot: " + message + "\n");
  process.exit(1);
}

function chromeExecutablePath() {
  for (const p of [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ]) { try { accessSync(p); return p; } catch {} }
  return undefined;
}

function pickExistingPage(pages, url) {
  const httpPages = pages.filter((p) => {
    const u = p.url();
    return u && u !== "about:blank" && !u.startsWith("chrome://") && !u.startsWith("devtools://");
  });
  if (url) {
    const exact = httpPages.find((p) => p.url() === url || p.url().startsWith(url));
    if (exact) return exact;
    try {
      const host = new URL(url).host;
      const sameHost = httpPages.find((p) => { try { return new URL(p.url()).host === host; } catch { return false; } });
      if (sameHost) return sameHost;
    } catch {}
  }
  return httpPages[0] || pages[0];
}

async function waitToolbarStable(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  let stableAt = 0;
  while (Date.now() < deadline) {
    const cur = await page.evaluate(() => document.body ? String(document.body.className || "") : "");
    if (cur === last && cur !== "") {
      if (!stableAt) stableAt = Date.now();
      if (Date.now() - stableAt >= 1200) {
        process.stdout.write("toolbar-stable class=" + cur + "\n");
        return cur;
      }
    } else {
      last = cur;
      stableAt = 0;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  process.stdout.write("WARN toolbar-wait timeout class=" + last + "\n");
  return last;
}

async function takeViewportShot(page, dest, width, height) {
  const brokenImgs = await page.evaluate(async () => {
    const imgs = [...document.images];
    await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
    return imgs.filter((i) => !i.complete || i.naturalWidth === 0).length;
  });
  if (brokenImgs > 0) process.stdout.write("WARN broken-imgs-before-shot=" + brokenImgs + "\n");
  await page.screenshot({ path: dest, clip: { x: 0, y: 0, width, height } });
  process.stdout.write("chrome-screenshot ok -> " + dest + "\n");
}

const KEEP_PROPS = [
  "display", "float", "clear", "box-sizing", "position", "top", "right", "bottom", "left", "z-index",
  "width", "height", "min-width", "min-height", "max-width", "max-height",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "color", "background-color", "background-image", "opacity",
  "font-size", "font-weight", "font-family", "font-style", "line-height", "letter-spacing",
  "text-align", "text-decoration-line", "text-transform", "white-space", "word-break",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-style", "border-top-color", "border-bottom-color",
  "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius",
  "box-shadow", "overflow-x", "overflow-y", "flex-direction", "flex-wrap", "justify-content", "align-items", "gap",
];

let puppeteerMod = null;
try { puppeteerMod = await import("puppeteer"); } catch {}
if (!puppeteerMod) puppeteerMod = await import("puppeteer-core");
const puppeteer = puppeteerMod.default;
const sharp = (await import("sharp")).default;
const https = await import("node:https");
const http = await import("node:http");
const [vw, vh] = options.viewport.split("x").map(Number);
let htmlOut = "";
let retryCount = 0;
const connected = Boolean(options.connect);
const launchArgs = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"];
if (!options.headed) launchArgs.splice(1, 0, "--disable-gpu");
if (options.debugPort > 0) launchArgs.push("--remote-debugging-port=" + options.debugPort);
const browser = connected
  ? await puppeteer.connect({ browserURL: options.connect, defaultViewport: null })
  : await puppeteer.launch({
    headless: !options.headed,
    ...(process.env.CSG_USER_DATA_DIR ? { userDataDir: process.env.CSG_USER_DATA_DIR } : {}),
    executablePath: chromeExecutablePath(),
    pipe: !options.headed && options.debugPort <= 0,
    args: launchArgs,
    defaultViewport: null,
  });
let tNav = 0; let tInline = 0;
const t0 = Date.now();
try {
  let page;
  if (connected) {
    page = pickExistingPage(await browser.pages(), options.url);
    if (!page) fail("no attachable page on " + options.connect);
  } else {
    page = await browser.newPage();
  }
  await page.setUserAgent(options.ua);
  await page.setViewport({ width: vw, height: vh });
  const gotoTarget = options.url.startsWith("http") ? options.url : "file://" + resolve(options.url);
  if (!options.noNav) {
    await page.goto(gotoTarget, { waitUntil: "networkidle2", timeout: options.timeoutMs });
  }
  // 保真: 字体就绪 + 全页滚动触发懒加载 + 回顶后网络静默, 确保与真实浏览器一致
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.evaluate(async () => {
    const step = Math.max(400, window.innerHeight);
    const total = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
  });
  await page.waitForNetworkIdle({ idleTime: 400, timeout: options.timeoutMs }).catch(() => {});
  if (options.waitToolbar) await waitToolbarStable(page, options.timeoutMs);
  tNav = Date.now() - t0;
  process.stdout.write("sameframe-state url=" + page.url() + " title=" + (await page.title()) + " bodyClass=" + (await page.evaluate(() => document.body ? document.body.className : "")) + "\n");
  if (options.screenshot && options.screenshotAt === "live") {
    await takeViewportShot(page, options.screenshot, vw, vh);
  }
  // 图标字体接入: 抓取 Material Icons woff2 供字体子集管线(失败不阻断, 门禁兜底)
  try {
    const cssText = await new Promise((res9, rej9) => {
      const req9 = https.get("https://fonts.googleapis.com/icon?family=Material+Icons", { headers: { "User-Agent": options.ua } }, (resp9) => {
        if (resp9.statusCode !== 200) { rej9(new Error("http " + resp9.statusCode)); return; }
        const chunks9 = []; resp9.on("data", (c) => chunks9.push(c)); resp9.on("end", () => res9(Buffer.concat(chunks9).toString("utf8")));
      });
      req9.on("error", rej9); req9.setTimeout(15000, () => { req9.destroy(); rej9(new Error("timeout")); });
    });
    const um = /url\((https:[^)]+\.woff2)\)/.exec(cssText);
    if (um) {
      const fontBuf = await new Promise((resA, rejA) => {
        const reqA = https.get(um[1], { headers: { "User-Agent": options.ua } }, (respA) => {
          if (respA.statusCode !== 200) { rejA(new Error("http " + respA.statusCode)); return; }
          const chunksA = []; respA.on("data", (c) => chunksA.push(c)); respA.on("end", () => resA(Buffer.concat(chunksA)));
        });
        reqA.on("error", rejA); reqA.setTimeout(20000, () => { reqA.destroy(); rejA(new Error("timeout")); });
      });
      const dataUri = "data:font/woff2;base64," + fontBuf.toString("base64");
      const injectedFam = await page.evaluate((src) => {
        const st = document.createElement("style");
        st.textContent = "@font-face{font-family:'Material Icons';font-style:normal;font-weight:400;src:url(" + src + ") format('woff2')}\n.material-icons,.material-icons-outlined,.material-icons-round,.material-icons-sharp,.material-icons-two-tone{font-family:'Material Icons'}";
        document.head.appendChild(st);
        document.querySelectorAll(".material-icons,.material-icons-outlined,.material-icons-round,.material-icons-sharp,.material-icons-two-tone").forEach((icEl) => { icEl.style.fontFamily = "Material Icons"; });
        const probeEl = document.querySelector(".material-icons");
        return probeEl ? String(getComputedStyle(probeEl).fontFamily) : "NO-ELEMENT";
      }, dataUri);
      process.stdout.write("icon-inject computed=" + injectedFam.slice(0, 60) + "\n");
      const fsMod = await import("node:fs");
      const extraDir = resolve(options.out, "..", "fonts-extra");
      fsMod.mkdirSync(extraDir, { recursive: true });
      fsMod.writeFileSync(resolve(extraDir, "material-icons.woff2"), fontBuf);
      process.stdout.write("icon-font ok bytes=" + fontBuf.length + "\n");
    }
  } catch (eIcon) {
    process.stdout.write("WARN icon-font fetch failed: " + eIcon.message + "\n");
  }

  retryCount = await page.evaluate(async (keepProps) => {
    const els = document.querySelectorAll("*");
    const shortColor = (v) => {
      let m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(v.trim());
      if (!m) return v;
      const hex = "#" + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("");
      if (m[4] === undefined || m[4] === "1") return hex;
      const a = Number(m[4]);
      if (!(a > 0)) return "transparent";
      return hex + Math.round(Math.min(1, a) * 255).toString(16).padStart(2, "0");
    };
    // 先在活 stylesheet 上读 computed + 盒，再拆表。先拆再读会落到 UA 无样式流，
    // live 截图与 snapshot 不再同帧。
    for (const el of els) {
      if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) continue;
      const cs = getComputedStyle(el);
      const parts = [];
      const own = el.style;
      for (const prop of keepProps) {
        const val = cs.getPropertyValue(prop);
        if (!val || val === "") continue;
        parts.push(prop + ":" + (/^rgb/.test(val) ? shortColor(val) : val));
      }
      const prev = own.cssText.replace(/;\s*$/, "");
      const merged = prev ? parts.join(";") + ";" + prev : parts.join(";");
      if (merged) el.setAttribute("style", merged);
      else el.removeAttribute("style");
    }
    for (const el of document.querySelectorAll("*")) {
      const r3 = el.getBoundingClientRect();
      if (r3.width === 0 && r3.height === 0) continue;
      el.setAttribute("data-csg-rect", [Math.round(r3.left), Math.round(r3.top), Math.round(r3.width), Math.round(r3.height)].join(","));
    }
    document.querySelectorAll("script,noscript").forEach((el) => el.remove());
    document.querySelectorAll('link[rel~="stylesheet"]').forEach((el) => el.remove());
    document.querySelectorAll("style").forEach((el) => el.remove());
    // 内联 SVG: currentColor 以计算色替换后栅格化为 x-raw img(元素计数换型, 视觉 1:1)
    for (const sv of document.querySelectorAll("svg")) {
      try {
        const cs2 = getComputedStyle(sv);
        const r2 = sv.getBoundingClientRect();
        const sw = Math.max(1, Math.round(r2.width || parseFloat(cs2.fontSize)));
        const sh = Math.max(1, Math.round(r2.height || parseFloat(cs2.fontSize)));
        const clone = sv.cloneNode(true);
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        clone.setAttribute("width", String(sw));
        clone.setAttribute("height", String(sh));
        let txt = new XMLSerializer().serializeToString(clone);
        txt = txt.replace(/currentColor/g, shortColor(cs2.color));
        const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(txt);
        const sim = new Image();
        await new Promise((res3, rej3) => { sim.onload = () => res3(true); sim.onerror = () => rej3(new Error("svg")); sim.src = svgUrl; });
        const scv = document.createElement("canvas");
        scv.width = sw; scv.height = sh;
        const scx = scv.getContext("2d");
        scx.drawImage(sim, 0, 0);
        const sd = scx.getImageData(0, 0, sw, sh).data;
        let sbin = "";
        for (let q = 0; q < sd.length; q += 1) sbin += String.fromCharCode(sd[q]);
        const replacement = document.createElement("img");
        replacement.setAttribute("src", scv.toDataURL("image/png"));
        replacement.setAttribute("data-csg-raw", sw + "x" + sh + ";" + btoa(sbin));
        const inheritedStyle = sv.getAttribute("style");
        if (inheritedStyle) replacement.setAttribute("style", inheritedStyle);
        if (sv.getAttribute("class")) replacement.setAttribute("class", sv.getAttribute("class"));
        sv.replaceWith(replacement);
      } catch (e3) { window.__inlineFailedImages = (window.__inlineFailedImages || 0) + 1; }
    }
    // 内联图片: 同源 fetch → 按原始尺寸绘制 → 原始 RGBA base64(整数 px 引擎友好,
    // 避免 PNG 解码与逐像素语句爆炸; 失败回退 blob data-URI 并计数)
    window.__inlinedImages = 0;
    window.__inlineFailedImages = 0;
    const imgs = document.querySelectorAll("img[src]");
    for (const im of imgs) {
      const s = im.getAttribute("src") || "";
      if (s.startsWith("data:image/png") && im.getAttribute("data-csg-raw")) continue;
      try {
        const res = await fetch(im.src, { credentials: "include" });
        if (!res.ok) { im.setAttribute("data-csg-retry", "1"); window.__inlineFailedImages += 1; continue; }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const probe = new Image();
        const loaded = await new Promise((resolve2) => {
          probe.onload = () => resolve2(true);
          probe.onerror = () => resolve2(false);
          probe.src = url;
        });
        let dataUrl = null;
        let rawAttr = null;
        if (loaded && probe.naturalWidth > 0 && probe.naturalHeight > 0) {
          try {
            let rw = probe.naturalWidth;
            let rh = probe.naturalHeight;
            const MAXD = 512;
            if (rw > MAXD || rh > MAXD) {
              const sc = Math.min(MAXD / rw, MAXD / rh);
              rw = Math.max(1, Math.round(rw * sc));
              rh = Math.max(1, Math.round(rh * sc));
            }
            const cv = document.createElement("canvas");
            cv.width = rw;
            cv.height = rh;
            const cx = cv.getContext("2d");
            cx.drawImage(probe, 0, 0, rw, rh);
            const d = cx.getImageData(0, 0, cv.width, cv.height).data;
            let bin = "";
            for (let q = 0; q < d.length; q += 1) bin += String.fromCharCode(d[q]);
            dataUrl = cv.toDataURL("image/png");
            rawAttr = cv.width + "x" + cv.height + ";" + btoa(bin);
          } catch (e2) { dataUrl = null; }
        }
        URL.revokeObjectURL(url);
        if (dataUrl) { im.setAttribute("src", dataUrl); if (rawAttr) im.setAttribute("data-csg-raw", rawAttr); window.__inlinedImages += 1; }
        else { im.setAttribute("data-csg-retry", "1"); window.__inlineFailedImages += 1; }
      } catch (e) { im.setAttribute("data-csg-retry", "1"); window.__inlineFailedImages += 1; }
    }
    return document.querySelectorAll("img[data-csg-retry]").length;
  }, KEEP_PROPS);
  // Node 侧跨域重取: 页内 fetch 被 CORS 拦下的图改由本地直取(无同源限制)
  if (retryCount > 0) {
    const retrySrcs = await page.evaluate(() => [...new Set([...document.querySelectorAll("img[data-csg-retry]")].map((im) => im.getAttribute("src")))]);
    const fetchedPairs = [];
    for (const srcUrl of retrySrcs) {
      try {
        const buf = await new Promise((resolve3, reject3) => {
          const mod = srcUrl.startsWith("https:") ? https : http;
          const req = mod.get(srcUrl, { headers: { "User-Agent": options.ua } }, (resp) => {
            if (resp.statusCode !== 200) { reject3(new Error("http " + resp.statusCode)); return; }
            const chunks = [];
            resp.on("data", (c) => chunks.push(c));
            resp.on("end", () => resolve3(Buffer.concat(chunks)));
          });
          req.on("error", reject3);
          req.setTimeout(15000, () => { req.destroy(); reject3(new Error("timeout")); });
        });
        const raw = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const pngBuf = await sharp(buf).ensureAlpha().png({ compressionLevel: 9 }).toBuffer();
        const rw = raw.info.width, rh = raw.info.height;
        const b64 = Buffer.from(raw.data).toString("base64");
        fetchedPairs.push([srcUrl, rw + "x" + rh + ";" + b64, pngBuf.toString("base64")]);
      } catch (e4) { /* 保持 data-csg-retry 标记, 走占位路径 */ }
    }
    if (fetchedPairs.length > 0) {
      await page.evaluate((pairs) => {
        for (const im of document.querySelectorAll("img[data-csg-retry]")) {
          const hit = pairs.find((p) => p[0] === im.getAttribute("src"));
          if (hit) { im.setAttribute("src", "data:image/png;base64," + hit[2]); im.setAttribute("data-csg-raw", hit[1]); im.removeAttribute("data-csg-retry"); }
        }
      }, fetchedPairs);
    }
  }
  // 序列化(最终 DOM)+ 截图同帧
  // 固化 CSS white-space:normal 折叠语义: 纯空白文本节点删除, 其余内部 run 折叠+首尾修剪
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const dropNodes = [];
    const editPairs = [];
    let tn;
    while ((tn = walker.nextNode())) {
      const t = tn.nodeValue;
      if (!/\S/.test(t)) { dropNodes.push(tn); continue; }
      let anc = tn.parentElement;
      let preformatted = false;
      while (anc) {
        if (/^(pre|textarea)$/.test(anc.tagName) || getComputedStyle(anc).whiteSpace.startsWith("pre")) { preformatted = true; break; }
        anc = anc.parentElement;
      }
      if (preformatted) continue;
      const collapsed = t.replace(/\s+/g, " ").replace(/^ | $/g, "");
      if (collapsed !== t) editPairs.push([tn, collapsed]);
    }
    dropNodes.forEach((dn) => dn.remove());
    editPairs.forEach(([nd, v]) => { nd.nodeValue = v; });
  });
  // 复杂文式(Arabic 等)整形实测: 全部文本子节点(含空白, 与引擎序数严格对齐)
  await page.evaluate(() => {
    const w3 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const byParent = new Map();
    let t3;
    while ((t3 = w3.nextNode())) {
      const v = t3.nodeValue;
      if (!v || v.length === 0) continue;
      const rng = document.createRange();
      rng.selectNodeContents(t3);
      const wd = Math.round(rng.getBoundingClientRect().width);
      if (!(wd > 0)) continue;
      const pe = t3.parentElement;
      if (!pe) continue;
      if (!byParent.has(pe)) byParent.set(pe, []);
      byParent.get(pe).push(wd);
    }
    byParent.forEach((list, el) => el.setAttribute("data-csg-tw", list.join(",")));
  });
  htmlOut = await page.evaluate(() => "<!DOCTYPE html>\n" + document.documentElement.outerHTML);
  tInline = Date.now() - t0 - tNav;
  // 真机基准截图: 默认在内联后拍, 与快照 DOM 同帧; --screenshot-at live 则在内联前已拍
  if (options.screenshot && options.screenshotAt === "inlined") {
    await takeViewportShot(page, options.screenshot, vw, vh);
  }
} finally {
  if (connected) await browser.disconnect().catch(() => {});
  else await browser.close().catch(() => {});
}
mkdirSync(dirname(options.out), { recursive: true });
writeFileSync(options.out, htmlOut);
process.stdout.write("chrome-snapshot ok: nav=" + tNav + "ms inline=" + tInline + "ms bytes=" + Buffer.byteLength(htmlOut) + "\n  -> " + options.out + "\n");
