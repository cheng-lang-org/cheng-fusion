#!/usr/bin/env node
/**
 * localize-snapshot.mjs — LIVE_MIRROR_CAMPAIGN: 快照页一次性全量本地化。
 *
 * 输入 chrome-snapshot 产出的 snapshot.html, 把仍指向官网的渲染资源一次性抓齐
 * 并内联, 输出完全离线可渲染的快照页(此后不再访问官网):
 *   1. <link rel=stylesheet> → 抓全部 CSS, 抽 @font-face, 字体转 data: 内联
 *      (图标字体 FA/Material/custom + 文本 webfont);
 *   2. style 属性里的 background-image 官网 URL → 抓取转 data:(HTML 实体编码
 *      双向处理: 原文 url(&quot;...&quot;) 形态精确替换);
 *   3. 已内联的 <img data:> 不动; 跨域失败资源如实计数跳过(不静默)。
 *
 * 用法: node scripts/localize-snapshot.mjs --in <snapshot.html> --out <out.html> \
 *         [--base https://services.bahrain.bh]
 */
import { writeFileSync, readFileSync } from "node:fs";

function fail(m) { console.error("localize-snapshot: " + m); process.exit(1); }

const args = process.argv.slice(2);
const opt = { in: "", out: "", base: "https://services.bahrain.bh", css: [] };
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--in") { opt.in = args[i + 1]; i += 1; }
  else if (args[i] === "--out") { opt.out = args[i + 1]; i += 1; }
  else if (args[i] === "--base") { opt.base = args[i + 1].replace(/\/$/, ""); i += 1; }
  else if (args[i] === "--css") { opt.css.push(args[i + 1]); i += 1; }
  else fail("unknown argument: " + args[i]);
}
if (!opt.in || !opt.out) fail("pass --in <snapshot.html> --out <localized.html>");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15";
// 字体文件用旧 UA: Google Fonts 按客户端能力协商, 新 UA 发 woff2, CoreText 无法
// 直接注册; 旧 UA 拿 TTF, 右栏 FONT| 通道才能注册页面真实网络字体。
const FONT_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/534.30 (KHTML, like Gecko) Version/5.0 Safari/534.30";

function fetchBuf(url) {
  return new Promise((resolve) => {
    let mod;
    try { mod = url.startsWith("https:") ? "node:https" : "node:http"; } catch { return resolve(null); }
    const isFont = /\.(woff2|woff|ttf|otf|eot)(\?|$)/i.test(url);
    import(mod).then((h) => {
      const req = h.get(url, { headers: { "User-Agent": isFont ? FONT_UA : UA } }, (res) => {
        if (res.statusCode !== 200) { res.resume(); return resolve(null); }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", () => resolve(null));
      });
      req.on("error", () => resolve(null));
      req.setTimeout(20000, () => { req.destroy(); resolve(null); });
    }).catch(() => resolve(null));
  });
}

const decodeEntities = (t) => t.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const toDataUri = (buf, mime) => "data:" + (mime || "application/octet-stream") + ";base64," + buf.toString("base64");
const encodeAttr = (t) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const resolveUrl = (u, base) => { try { return new URL(u, base).href; } catch { return null; } };
const mimeOf = (url) => {
  const m = /\.(woff2|woff|ttf|otf|svg|png|jpe?g|gif|webp|eot)(\?|$)/i.exec(url);
  const map = { woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", eot: "application/vnd.ms-fontobject" };
  return m ? map[m[1].toLowerCase()] : "application/octet-stream";
};

async function main() {
  let html = readFileSync(opt.in, "utf8");
  const cssUrls = opt.css.length > 0
    ? opt.css
    : (() => {
        const found = [];
        const re = /<link[^>]*href="([^"]+)"[^>]*>/g;
        let mm;
        while ((mm = re.exec(html))) {
          const href = decodeEntities(mm[1]);
          if (/css|font/i.test(href) || /contenthandler/.test(href)) found.push(resolveUrl(href, opt.base + "/"));
        }
        return found;
      })();
  const stats = { css: 0, cssFail: 0, fontFaces: 0, fonts: 0, fontsFail: 0, bg: 0, bgFail: 0 };

  // 1. 输入页 <link rel=stylesheet> → 抓全 CSS, 抽 @font-face, 字体内联
  const fontFaces = [];
  const seen = new Set();
  for (const abs of cssUrls) {
    if (!abs || seen.has(abs)) continue;
    seen.add(abs);
    const buf = await fetchBuf(abs);
    if (!buf) { stats.cssFail += 1; console.error("localize-snapshot: css fetch failed:", abs); continue; }
    stats.css += 1;
    const css = buf.toString("utf8");
    const ffRe = /@font-face\s*\{[^}]*\}/g;
    let fm;
    while ((fm = ffRe.exec(css))) {
      let rule = fm[0];
      const urlRe = /url\((['"]?)([^'")]+)\1\)/g;
      const subs = [];
      let um;
      let ok = true;
      while ((um = urlRe.exec(rule))) {
        const abs2 = resolveUrl(decodeEntities(um[2]), abs);
        if (!abs2) { ok = false; break; }
        subs.push([um[0], abs2]);
      }
      if (!ok) continue;
      for (const [tok, abs2] of subs) {
        const fb = await fetchBuf(abs2);
        if (!fb) { ok = false; break; }
        stats.fonts += 1;
        rule = rule.split(tok).join("url(" + JSON.stringify(toDataUri(fb, mimeOf(abs2))).slice(1, -1) + ")");
      }
      if (ok) { fontFaces.push(rule); stats.fontFaces += 1; }
    }
  }
  if (fontFaces.length > 0) {
    html = html.replace(/<head([^>]*)>/i, "<head$1>\n<style id=\"localized-fonts\">\n" + fontFaces.join("\n") + "\n</style>");
  }

  // 2. style 属性里官网 background-image → data:(实体编码精确替换)
  const decoded = decodeEntities(html);
  const bgSeen = new Set();
  const bgRe = /background-image:\s*url\(["']?([^)"']+?)["']?\)/g;
  let bm;
  while ((bm = bgRe.exec(decoded))) {
    const u = bm[1];
    if (!/^https?:\/\//.test(u) || bgSeen.has(u)) continue;
    bgSeen.add(u);
    const buf = await fetchBuf(u);
    if (!buf) { stats.bgFail += 1; continue; }
    const dataUri = toDataUri(buf, mimeOf(u));
    const encOld = "url(&quot;" + encodeAttr(u) + "&quot;)";
    const encNew = "url(&quot;" + encodeAttr(dataUri) + "&quot;)";
    if (html.includes(encOld)) {
      html = html.split(encOld).join(encNew);
      stats.bg += 1;
    } else {
      const encOld2 = "url(&quot;" + encodeAttr(u) + "&quot;)";
      if (html.includes(encOld2)) {
        html = html.split(encOld2).join("url(&quot;" + encodeAttr(dataUri) + "&quot;)");
        stats.bg += 1;
      } else {
        stats.bgFail += 1;
      }
    }
  }

  writeFileSync(opt.out, html);
  console.log("localize-snapshot: css=" + stats.css + "/" + stats.cssFail + " fontFaces=" + stats.fontFaces +
    " fonts=" + stats.fonts + "/" + stats.fontsFail + " bg=" + stats.bg + "/" + stats.bgFail +
    "\nout=" + opt.out);
}

main().catch((e) => fail(e.message));
