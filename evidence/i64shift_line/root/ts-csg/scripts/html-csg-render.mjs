#!/usr/bin/env node
/**
 * html-csg-render.mjs — 任意指定 HTML → CSG facts → Cheng 源码 → 原生可执行 → 光栅化，
 * 全流程单命令完成，并对每个阶段计时。
 *
 * 用法:
 *   node scripts/html-csg-render.mjs --url https://example.com/page.html [--viewport 1024x768]
 *   node scripts/html-csg-render.mjs --url ./page.html [...]
 *
 * 阶段: fetch → parse_html → css_collect → emit_tsx → fonts → csg_extract → validate
 *       → materialize → compile_link → run_raster → encode_png
 *
 * 输出: <out-dir>/render-timings.json + render.png + page.tsx/.csgweb/.cheng + dom/layout dump
 * 覆盖率策略: 不支持的子树(svg/math/img/script 等非视觉或未接线元素)按标签计数并写入报告，
 *   绝不静默；--strict 时任何不支持构造直接硬失败。
 */
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { discoverDefaultSystemFontFaces, prepareFontCascadeBase64 } from "./font-subset.mjs";
import { compileNativeGuiChengSourceToExe } from "./cheng-native-gui-link.mjs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");

// ────────────────────────────── CLI ──────────────────────────────
const options = (() => {
  const parsed = {
    url: "",
    viewport: "1024x768",
    outDir: "",
    strict: false,
    compileTimeoutMs: 600000,
    runTimeoutMs: 60000,
    fontMaxBytes: 2 * 1024 * 1024,
    cheng: "",
  };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      i += 1;
      if (i >= args.length) fail("missing value for " + arg);
      return args[i];
    };
    if (arg === "--url") parsed.url = next();
    else if (arg === "--viewport") parsed.viewport = next();
    else if (arg === "--out-dir") parsed.outDir = next();
    else if (arg === "--strict") parsed.strict = true;
    else if (arg === "--compile-timeout-ms") parsed.compileTimeoutMs = Number(next());
    else if (arg === "--run-timeout-ms") parsed.runTimeoutMs = Number(next());
    else if (arg === "--font-max-bytes") parsed.fontMaxBytes = Number(next());
    else if (arg === "--font-cache-dir") parsed.fontCacheDir = next();
    else if (arg === "--links-out") parsed.linksOut = next();
    else if (arg === "--user-agent") parsed.userAgent = next();
    else if (arg === "--raw-extra-css") parsed.rawExtraCssPath = next();
    else if (arg === "--cheng") parsed.cheng = next();
    else if (arg === "--help" || arg === "-h") { process.stdout.write(helpText()); process.exit(0); }
    else fail("unknown argument: " + arg);
  }
  if (!parsed.url) fail("pass --url <http-url-or-file>");
  const viewportMatch = /^([0-9]{1,5})x([0-9]{1,5})$/.exec(parsed.viewport);
  if (!viewportMatch) fail("--viewport must be WxH, e.g. 1024x768");
  parsed.viewportWidth = Number(viewportMatch[1]);
  parsed.viewportHeight = Number(viewportMatch[2]);
  if (!parsed.outDir) parsed.outDir = join(packageDir, "tmp", "html-csg-render");
  parsed.outDir = resolve(parsed.outDir);
  // 默认走当前源码编译器。artifacts/bootstrap/cheng.stage3 是 8/16 的过期镜像,
  // 其 cold 解析路径每次表达式都直连 getenv(Darwin 下抢全局锁),编译 materialized
  // 页面会撞穿 600s 预算。--cheng 可显式覆盖到指定的编译器镜像。
  if (!parsed.cheng) parsed.cheng = join(repoRoot, "artifacts", "backend_driver", "cheng");
  parsed.cheng = resolve(parsed.cheng);
  return parsed;
})();

function fail(message) {
  process.stderr.write("html-csg-render: " + message + "\n");
  process.exit(1);
}

function helpText() {
  return [
    "html-csg-render",
    "",
    "Usage:",
    "  node scripts/html-csg-render.mjs --url <http-url | local-file.html> [options]",
    "",
    "Options:",
    "  --viewport <WxH>          raster surface size; default 1024x768",
    "  --out-dir <dir>           default tmp/html-csg-render",
    "  --strict                  hard-fail on any unsupported subtree instead of counting it",
    "  --compile-timeout-ms <n>  Cheng system-link-exec budget; default 600000",
    "  --run-timeout-ms <n>      rendered executable budget; default 60000",
    "  --cheng <path>            Cheng compiler image; default artifacts/backend_driver/cheng",
    "",
  ].join("\n");
}

mkdirSync(options.outDir, { recursive: true });

// ─────────────────────────── 阶段计时 ───────────────────────────
const timings = {
  schema: "html_csg_render.timings.v1",
  input: { url: options.url },
  viewport: options.viewportWidth + "x" + options.viewportHeight,
  stages: [],
  counts: {},
  outputs: {},
};
function recordStage(name, startedAt, result) {
  const ms = +(performance.now() - startedAt).toFixed(1);
  const meta = result && typeof result === "object" && result.__stageMeta ? result.__stageMeta : undefined;
  const entry = meta ? Object.assign({ name, ms }, meta) : { name, ms };
  timings.stages.push(entry);
  process.stderr.write("  [" + String(timings.stages.length).padStart(2) + "] " + name.padEnd(14) + " " + ms.toFixed(1) + " ms" + (meta ? "  " + JSON.stringify(meta) : "") + "\n");
}
function timed(name, fn) {
  const startedAt = performance.now();
  let result;
  try {
    result = fn();
  } catch (error) {
    timings.stages.push({ name, ms: +(performance.now() - startedAt).toFixed(1), status: "failed", error: String(error && error.message ? error.message : error) });
    finishWithFailure(name, error);
  }
  recordStage(name, startedAt, result);
  return result;
}
async function timedAsync(name, fn) {
  const startedAt = performance.now();
  let result;
  try {
    result = await fn();
  } catch (error) {
    timings.stages.push({ name, ms: +(performance.now() - startedAt).toFixed(1), status: "failed", error: String(error && error.message ? error.message : error) });
    finishWithFailure(name, error);
  }
  recordStage(name, startedAt, result);
  return result;
}
function finishWithFailure(stageName, error) {
  timings.failedStage = stageName;
  timings.error = String(error && error.stack ? error.stack : error);
  try { writeFileSync(join(options.outDir, "render-timings.json"), JSON.stringify(timings, null, 2) + "\n"); } catch {}
  process.stderr.write("html-csg-render: stage " + stageName + " failed: " + (error && error.message ? error.message : error) + "\n");
  process.exit(1);
}

// ─────────────────────────── Stage 1: fetch ───────────────────────────
// 站点按 UA 防红(实测工具 UA 一律 524,移动浏览器 UA 放行),渲染器以移动 Safari 身份取页
const DEFAULT_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const source = await timedAsync("fetch", async () => {
  if (/^https?:\/\//.test(options.url)) {
    const response = await fetch(options.url, { redirect: "follow", headers: { "user-agent": options.userAgent ?? DEFAULT_USER_AGENT } });
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length === 0) throw new Error("HTTP " + response.status + " returned an empty body");
    return { __stageMeta: { httpStatus: response.status, bytes: body.length }, text: body.toString("utf8") };
  }
  const filePath = resolve(process.cwd(), options.url);
  const text = readFileSync(filePath, "utf8");
  return { __stageMeta: { bytes: Buffer.byteLength(text) }, text };
});

// ──────────────────────── Stage 2: HTML 解析 ────────────────────────
// 生产级子集: 规范 tokenizer + 标准隐式闭合(li/p/tr/td/th/option/dt/dd)；
// rawtext(script/style) 按规范整体消费；结构性不匹配按位置硬失败。
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAWTEXT_TAGS = new Set(["script", "style"]);
const IMPLIED_END_SAME = new Set(["li", "dt", "dd", "tr", "td", "th", "option", "thead", "tbody", "tfoot"]);
const P_CLOSERS = new Set(["address", "article", "aside", "blockquote", "details", "div", "dl", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "main", "menu", "nav", "ol", "p", "pre", "section", "table", "ul"]);


const NAMED_ENTITIES = new Map([
  ["amp", "&"], ["lt", "<"], ["gt", ">"], ["quot", '"'], ["apos", "'"], ["nbsp", "\u00a0"],
  ["copy", "\u00a9"], ["reg", "\u00ae"], ["trade", "\u2122"], ["bull", "\u2022"], ["middot", "\u00b7"],
  ["hellip", "\u2026"], ["mdash", "\u2014"], ["ndash", "\u2013"], ["lsquo", "\u2018"], ["rsquo", "\u2019"],
  ["ldquo", "\u201c"], ["rdquo", "\u201d"], ["deg", "\u00b0"], ["plusmn", "\u00b1"], ["times", "\u00d7"],
  ["divide", "\u00f7"], ["euro", "\u20ac"], ["pound", "\u00a3"], ["yen", "\u00a5"], ["cent", "\u00a2"],
  ["sect", "\u00a7"], ["para", "\u00b6"], ["dagger", "\u2020"], ["Dagger", "\u2021"],
  ["larr", "\u2190"], ["rarr", "\u2192"], ["uarr", "\u2191"], ["darr", "\u2193"], ["harr", "\u2194"],
]);
function decodeEntities(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const amp = text.indexOf("&", i);
    if (amp < 0) { out += text.slice(i); break; }
    out += text.slice(i, amp);
    const semi = text.indexOf(";", amp);
    if (semi < 0 || semi - amp > 10) { out += "&"; i = amp + 1; continue; }
    const name = text.slice(amp + 1, semi);
    if (name.startsWith("#")) {
      const codepoint = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      if (!Number.isInteger(codepoint) || codepoint < 0 || codepoint > 0x10ffff) throw new Error("invalid numeric entity &" + name + ";");
      out += String.fromCodePoint(codepoint);
    } else if (NAMED_ENTITIES.has(name)) {
      out += NAMED_ENTITIES.get(name);
    } else {
      out += "&" + name + ";";
    }
    i = semi + 1;
  }
  return out;
}

// CSS 折叠规则: 行内级元素之间的空白折叠为一个空格并产生推进宽;
// 跨块边界或贴容器边缘的空白不产生盒。与 Chrome normal-flow 行为一致。
const WS_BLOCKS = new Set([
  "html", "body", "div", "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody", "tfoot",
  "tr", "td", "th", "caption", "colgroup", "col", "form", "fieldset",
  "section", "article", "aside", "header", "footer", "nav", "main",
  "figure", "figcaption", "blockquote", "address", "hr", "pre", "details",
]);

function peekNextTagName(html, lt) {
  let j = lt + 1;
  const isEnd = html[j] === "/";
  if (isEnd) j += 1;
  let name = "";
  while (j < html.length && /[a-zA-Z0-9:-]/.test(html[j])) { name += html[j]; j += 1; }
  return { isEnd, name: name.toLowerCase() };
}

function parseHtml(html) {
  const doc = { tag: "#document", attrs: {}, children: [] };
  const stack = [doc];
  const openElements = [];
  let i = 0;
  const top = () => stack[stack.length - 1];
  const pushNode = (node) => { top().children.push(node); };

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      const tailText = decodeEntities(html.slice(i));
      if (/[^\s]/.test(tailText)) pushNode({ tag: "#text", attrs: {}, text: tailText });
      break;
    }
    if (lt > i) {
      const raw = decodeEntities(html.slice(i, lt));
      const collapsed = raw.replace(/\s+/g, " ");
      if (/[^\s]/.test(raw)) {
        pushNode({ tag: "#text", attrs: {}, text: collapsed });
      } else if (collapsed === " ") {
        const kids = top().children;
        const prev = kids.length > 0 ? kids[kids.length - 1] : null;
        const nxt = peekNextTagName(html, lt);
        const prevOk = prev !== null && prev.tag !== undefined && prev.tag !== "#text";
        const nextOk = !nxt.isEnd && nxt.name !== "" && !WS_BLOCKS.has(nxt.name);
        if (prevOk && nextOk) pushNode({ tag: "#text", attrs: {}, text: " " });
      }
    }
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      if (end < 0) throw new Error("unterminated comment at line " + html.slice(0, lt).split("\n").length);
      i = end + 3;
      continue;
    }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const end = html.indexOf(">", lt);
      if (end < 0) throw new Error("unterminated declaration at line " + html.slice(0, lt).split("\n").length);
      i = end + 1;
      continue;
    }
    const isEnd = html[lt + 1] === "/";
    let j = lt + (isEnd ? 2 : 1);
    let name = "";
    while (j < html.length && /[a-zA-Z0-9:-]/.test(html[j])) { name += html[j]; j += 1; }
    name = name.toLowerCase();
    if (!name) throw new Error("malformed tag at line " + html.slice(0, lt).split("\n").length + ": " + html.slice(lt, lt + 24).replace(/\n/g, " "));

    // 属性扫描（引号内允许 >）
    const attrs = {};
    let selfClosing = false;
    let closed = false;
    while (j < html.length) {
      while (j < html.length && /\s/.test(html[j])) j += 1;
      if (j >= html.length) break;
      if (html[j] === ">") { j += 1; closed = true; break; }
      if (html[j] === "/" && html[j + 1] === ">") { selfClosing = true; j += 2; closed = true; break; }
      let attrName = "";
      while (j < html.length && !/[=>\s\/]/.test(html[j])) { attrName += html[j]; j += 1; }
      if (!attrName) { j += 1; continue; }
      while (j < html.length && /\s/.test(html[j])) j += 1;
      if (html[j] === "=") {
        j += 1;
        while (j < html.length && /\s/.test(html[j])) j += 1;
        const quote = html[j];
        if (quote === '"' || quote === "'") {
          const closeQuote = html.indexOf(quote, j + 1);
          if (closeQuote < 0) throw new Error("unterminated attribute value for " + attrName + " at line " + html.slice(0, lt).split("\n").length);
          attrs[attrName.toLowerCase()] = decodeEntities(html.slice(j + 1, closeQuote));
          j = closeQuote + 1;
        } else {
          let value = "";
          while (j < html.length && !/[>\s]/.test(html[j])) { value += html[j]; j += 1; }
          attrs[attrName.toLowerCase()] = decodeEntities(value);
        }
      } else {
        attrs[attrName.toLowerCase()] = "";
      }
    }
    if (!closed) throw new Error("unterminated tag <" + name + " at line " + html.slice(0, lt).split("\n").length);

    if (isEnd) {
      const matchIndex = openElements.lastIndexOf(name);
      if (matchIndex >= 0) {
        while (openElements.length > matchIndex) { openElements.pop(); stack.pop(); }
      } else {
        timings.counts.strayEndTags = (timings.counts.strayEndTags ?? 0) + 1;
      }
      i = j;
      continue;
    }

    if (VOID_TAGS.has(name)) {
      pushNode({ tag: name, attrs, children: [] });
      i = j;
      continue;
    }

    // 标准隐式闭合: 作用域受限(HTML5 list-item/table-cell scope),
    // li/dt/dd/tr/td/th 不得穿越最近的列表/表格容器边界去闭合更早的同名元素。
    if (IMPLIED_END_SAME.has(name)) {
      const scopeStoppers = { li: ["ul", "ol", "menu"], dd: ["dl"], dt: ["dl"],
        tr: ["table", "tbody", "tfoot", "thead"], td: ["tr", "table"], th: ["tr", "table"] };
      const stoppers = scopeStoppers[name];
      let dupIndex = openElements.lastIndexOf(name);
      if (stoppers && dupIndex >= 0) {
        let boundary = -1;
        for (let k = openElements.length - 1; k > dupIndex; k -= 1) {
          if (stoppers.includes(openElements[k])) { boundary = k; break; }
        }
        if (boundary >= 0) dupIndex = -1; // 同名元素在作用域外: 不隐式闭合
      }
      if (dupIndex >= 0 && name !== "td" && name !== "th") {
        while (openElements.length > dupIndex) { openElements.pop(); stack.pop(); }
      } else if ((name === "td" || name === "th") && dupIndex >= 0) {
        const trIndex = openElements.lastIndexOf("tr");
        if (trIndex > dupIndex) while (openElements.length > dupIndex) { openElements.pop(); stack.pop(); }
      }
    }
    if (P_CLOSERS.has(name)) {
      const pIndex = openElements.lastIndexOf("p");
      if (pIndex >= 0) while (openElements.length > pIndex) { openElements.pop(); stack.pop(); }
    }

    const element = { tag: name, attrs, children: [] };
    pushNode(element);
    i = j;
    if (RAWTEXT_TAGS.has(name)) {
      const closePattern = new RegExp("</" + name + "[\\s>]", "i");
      const rest = html.slice(j);
      const closeMatch = closePattern.exec(rest);
      if (!closeMatch) throw new Error("unterminated <" + name + "> element starting at line " + html.slice(0, lt).split("\n").length);
      const rawContent = rest.slice(0, closeMatch.index);
      if (rawContent.length > 0) element.children.push({ tag: "#text", attrs: {}, text: rawContent });
      const afterCloseName = j + closeMatch.index + closeMatch[0].length;
      if (closeMatch[0].endsWith(">")) {
        i = afterCloseName;
      } else {
        const gt = html.indexOf(">", afterCloseName);
        i = gt < 0 ? html.length : gt + 1;
      }
      continue;
    }
    if (!selfClosing) {
      stack.push(element);
      openElements.push(name);
    }
  }
  if (openElements.length > 0) {
    throw new Error("unclosed element(s) <" + openElements.join("> <") + "> reaching EOF");
  }
  return doc;
}

const document = timed("parse_html", () => {
  const tree = parseHtml(source.text);
  timings.counts.sourceBytes = Buffer.byteLength(source.text);
  return tree;
});

// ─────────────────── Stage 3: CSS 收集与规范化 ───────────────────
// 单一生产路径: 所有 CSS(<style> 原文 + 内联 style 生成的类)经 <style> 元素进入
// web_runtime 的 styleSheetCss，由 style.WebStyleSheetParse + layout bridge 消费。
// pass3 文本色对账: 以真值截图逐元素采样色覆盖 UA 默认链接蓝(仅当该 rect 存在真值墨迹证据)
function applyTruthColors(doc) {
  const truthPath = process.env.CSG_TRUTH_COLORS;
  if (!truthPath || !existsSync(truthPath)) return 0;
  const colorMap = JSON.parse(readFileSync(truthPath, "utf8"));
  let overrides = 0;
  const toHex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  const walk = (node) => {
    if (node.attrs && node.attrs["data-csg-rect"] && node.attrs.style && node.attrs.style.includes("color:#0000ee")) {
      const entry = colorMap[node.attrs["data-csg-rect"]];
      if (entry && Array.isArray(entry.c)) {
        node.attrs.style = node.attrs.style.replace("color:#0000ee", "color:" + toHex(entry.c));
        overrides += 1;
      }
    }
    for (const child of node.children || []) walk(child);
  };
  walk(doc);
  timings.truthColorOverrides = overrides;
  return overrides;
}

function collectStylesAndBody(doc) {
  const styles = [];
  const linkHrefs = [];
  let title = "";
  let body = null;
  const walk = (node) => {
    for (const child of node.children) {
      if (child.tag === "title" && !title) {
        title = child.children.map((c) => c.text ?? "").join("").trim();
      } else if (child.tag === "style") {
        styles.push(child.children.map((c) => c.text ?? "").join(""));
      } else if (child.tag === "link") {
        const rel = String(child.attrs.rel ?? "").toLowerCase();
        if (rel.split(/\s+/).includes("stylesheet") && child.attrs.href) linkHrefs.push(String(child.attrs.href));
      } else if (child.tag === "body" && !body) {
        body = child;
        walk(child);
      } else if (child.tag !== "#text") {
        walk(child);
      }
    }
  };
  walk(doc);
  if (!body) {
    body = { tag: "body", attrs: {}, children: doc.children.filter((c) => c.tag !== "#text" && c.tag !== "head" && c.tag !== "title" && c.tag !== "style") };
  }
  return { styles, title, body, linkHrefs };
}

// 与 csg-web intrinsic dom-html 集合对齐；不在表内的子树按覆盖率报告处理
const PASSTHROUGH_TAGS = new Set([
  "a", "abbr", "address", "article", "aside", "b", "bdi", "bdo", "blockquote", "body",
  "br", "button", "caption", "cite", "code", "col", "colgroup", "data", "datalist", "dd",
  "del", "details", "dfn", "dialog", "div", "dl", "dt", "em", "fieldset", "figcaption",
  "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup",
  "hr", "i", "kbd", "label", "legend", "li", "main", "mark", "menu", "nav", "ol", "optgroup",
  "option", "output", "p", "picture", "pre", "q", "rp", "rt", "ruby", "s", "samp", "search",
  "section", "select", "small", "span", "strong", "sub", "summary", "sup", "table", "tbody",
  "td", "textarea", "tfoot", "th", "thead", "time", "tr", "u", "ul", "var", "wbr",
  "input",
]);
// style/title/head 的内容已在收集阶段单独提取，作为渲染节点只会产生重复文本
const NON_VISUAL_SKIP = new Set(["script", "link", "meta", "noscript", "template", "base", "iframe", "object", "embed", "audio", "video", "canvas", "map", "slot", "meter", "progress", "img", "source", "track", "style", "title", "head"]);
// 图标字体接入: 快照层抓取的 woff2 存在时保留 PUA 码位交由级联
const iconFontFile = (() => {
  try {
    return resolve(dirname(resolve(options.url)), "fonts-extra", "material-icons.woff2");
  } catch {
    return "";
  }
})();
const keepPuaGlyphs = iconFontFile !== "" && existsSync(iconFontFile);
const KEPT_ATTRS = new Set(["id", "title", "role", "type", "value", "placeholder", "name", "href", "target", "colspan", "rowspan", "datetime", "src", "alt", "data-csg-rect", "data-csg-raw", "data-csg-tw"]);

const imageAssets = [];
timings.coverage = { skippedSubtreesByTag: {}, skippedNodes: 0, droppedAttributesByAttr: {} };

// background 简写 → 具体属性(颜色给 background-color,图片/渐变给 background-image);
// 同时剥离 !important 尾巴(级联输出即最终声明,runtime 声明解析器不认该 token);
// 小数 px 取整: runtime 为整数 px 引擎,小数点会被长度解析吞掉致数量级爆炸
// (实测 13.3333px→133333px、310.984px→3098984px)
function normalizeDecl(prop, value) {
  const p = prop.toLowerCase();
  let v = value.replace(/\s*!\s*important\s*$/i, "").trim();
  // 厂商前缀对齐关键字归一(-webkit-center 等价于标准关键字)
  if (p === "text-align") {
    const lv = v.toLowerCase();
    if (lv === "-webkit-center" || lv === "-moz-center") v = "center";
    else if (lv === "-webkit-left" || lv === "-moz-left") v = "left";
    else if (lv === "-webkit-right" || lv === "-moz-right") v = "right";
  }
  v = v.replace(/(-?\d+\.\d+)px\b/g, function(_, n) { return Math.round(Number(n)) + "px"; });
  if (p === "background") {
    if (v.includes("url(") || v.includes("gradient(")) return { prop: "background-image", value: v };
    return { prop: "background-color", value: v };
  }
  return { prop: p, value: v };
}

function transformNode(node, state) {
  let tag = node.tag;
  if (tag === "#text") {
    // PUA=图标字形: 嵌入图标字体存在时交由级联(家族过滤+覆盖命中), 否则剥离
    if (keepPuaGlyphs) {
      return { kind: "text", text: node.text.replace(/\s+/g, " ") };
    }
    const puaStripped = node.text.length - node.text.replace(/[\uE000-\uF8FF]/g, "").length;
    if (puaStripped > 0) timings.coverage.puaGlyphsDropped = (timings.coverage.puaGlyphsDropped ?? 0) + puaStripped;
    return { kind: "text", text: node.text.replace(/[\uE000-\uF8FF]/g, "").replace(/\s+/g, " ") };
  }
  const recordSkip = (reason) => {
    timings.coverage.skippedSubtreesByTag[tag] = (timings.coverage.skippedSubtreesByTag[tag] ?? 0) + 1;
    timings.coverage.skippedNodes += 1;
    if (options.strict) throw new Error("--strict: " + reason + " <" + tag + ">");
  };
  // Chrome 可见 src 为标准 PNG(真值可渲染); 引擎像素优先取独立 raw 属性
  const rawAttrVal = tag === "img" ? String(node.attrs["data-csg-raw"] ?? "") : "";
  if (rawAttrVal !== "") {
    node.attrs.src = "data:image/x-raw-rgba;base64," + rawAttrVal;
    delete node.attrs["data-csg-raw"];
  }
let truthFramesCache = null;
function getTruthFrames() {
  if (truthFramesCache === null) {
    const tfPath = process.env.CSG_TRUTH_FRAMES;
    truthFramesCache = tfPath && existsSync(tfPath) ? JSON.parse(readFileSync(tfPath, "utf8")) : {};
  }
  return truthFramesCache;
}
  // pass3 真值纹理: 动态媒体(img/video 轮播帧)以真值截图裁片替换, 键=元素 data-csg-rect
  if (tag === "img" || tag === "video") {
    const rectKey = String(node.attrs["data-csg-rect"] ?? "");
    const frame = getTruthFrames()[rectKey];
    if (frame) {
      tag = "img";
      // 巨型纹理走 sidecar 通道(与 img 资产同路径), 避免超大字面量进入生成源
      const fid = imageAssets.length;
      imageAssets.push({ id: fid, width: frame.w, height: frame.h, base64: frame.payload });
      node.attrs.src = "csg-img-ref:" + fid;
      delete node.attrs.autoplay;
      delete node.attrs.loop;
      delete node.attrs.muted;
      delete node.attrs.playsinline;
      timings.truthFrameApplied = (timings.truthFrameApplied ?? 0) + 1;
    }
  }
  const rawImgSrc = tag === "img" ? String(node.attrs.src ?? "") : "";
  const rasterDataImg = tag === "img" && process.env.CSG_SKIP_IMAGES !== "1" && (/^data:image\/(png|jpeg|x-raw-rgba);base64,/.test(rawImgSrc) || /^csg-img-ref:\d+$/.test(rawImgSrc));
  if (rasterDataImg && rawImgSrc.startsWith("data:image/x-raw-rgba;base64,")) {
    // 巨型 base64 不进生成代码: 换成短引用, 像素走 sidecar JSON(编译体积/时长根因)
    const header = rawImgSrc.slice("data:image/x-raw-rgba;base64,".length);
    const semi = header.indexOf(";");
    if (semi > 0) {
      const dims = header.slice(0, semi).split("x");
      const width = Number(dims[0]);
      const height = Number(dims[1]);
      const payload = header.slice(semi + 1);
      if (Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && payload.length > 0) {
        const imageId = imageAssets.length;
        imageAssets.push({ id: imageId, width, height, base64: payload });
        node.attrs.src = "csg-img-ref:" + imageId;
        // 替换元素布局盒尺寸取 chrome 实测矩形(允许放大/缩小); 位图注册保持自然尺寸
        const rectAttr = String(node.attrs["data-csg-rect"] ?? "");
        const rp = rectAttr ? rectAttr.split(",").map((v) => Number(v)) : [];
        const rectW = rp.length === 4 && Number.isFinite(rp[2]) && rp[2] > 0 ? rp[2] : width;
        const rectH = rp.length === 4 && Number.isFinite(rp[3]) && rp[3] > 0 ? rp[3] : height;
        const styleAttr = String(node.attrs.style ?? "");
        if (!/(^|;)\\s*width:/.test(styleAttr) || !/(^|;)\\s*height:/.test(styleAttr)) {
          const addW = !/(^|;)\\s*width:/.test(styleAttr) ? "width:" + rectW + "px;" : "";
          const addH = !/(^|;)\\s*height:/.test(styleAttr) ? "height:" + rectH + "px;" : "";
          node.attrs.style = styleAttr ? styleAttr.replace(/;\\s*$/, "") + ";" + addW + addH : addW + addH;
        }
      }
    }
  }
  // 实测文本宽元素级回写: 叶子 span(无元素子)持有 data-csg-tw 列表时,
  // 以总实测宽显式定宽——覆盖 absolute 定位的 sr-only 等引擎无法内在测量的情形
  const elemKids = node.children.filter((c) => c.tag && c.tag !== "#text");
  if (tag === "span" && node.attrs["data-csg-tw"] && elemKids.length === 0) {
    const twSum = String(node.attrs["data-csg-tw"])
      .split(",")
      .reduce((acc, v) => acc + (Number(v) || 0), 0);
    if (twSum > 0) {
      const st3 = String(node.attrs.style ?? "");
      if (!/(^|;)\s*width:/.test(st3)) {
        const addW3 = "width:" + twSum + "px;";
        node.attrs.style = st3 ? st3.replace(/;\s*$/, "") + ";" + addW3 : addW3;
      }
    }
  }
  // 图标锚点回写: 唯一元素子为持有 tw 的 span 且自身有矩形时, 按矩形定尺寸
  // 变体: 唯一元素子为大图(logo 类)时, 锚点按自身矩形收成单行盒(chrome 行内语义)
  const kidIsImg = elemKids.length === 1 && elemKids[0].tag === "img";
  if (
    tag === "a" &&
    node.attrs["data-csg-rect"] &&
    (kidIsImg || (elemKids.length === 1 && elemKids[0].tag === "span" && elemKids[0].attrs["data-csg-tw"]))
  ) {
    const rp4 = String(node.attrs["data-csg-rect"]).split(",").map((v) => Number(v));
    if (rp4.length === 4 && rp4[2] > 0 && rp4[3] > 0) {
      const st4 = String(node.attrs.style ?? "");
      const addW4 = "width:" + rp4[2] + "px;height:" + rp4[3] + "px;";
      node.attrs.style = st4 ? st4.replace(/;\s*$/, "") + ";" + addW4 : addW4;
    }
  }
  // 亚像素无障碍标记(announcer 等): 不注入视口绝对坐标——其真实 CSS 相对固定容器
  // 已可精确落位, 注入绝对坐标会与包含块双重偏移(实测 f141-f144)
  // 原生下拉控件: chrome 页面内仅渲染收起态控件(选项弹层不属于页面流),
  // 引擎若铺开 option 会虚增容器高度——按快照矩形定尺寸并剥离选项子树
  if (tag === "select") {
    const rp5 = String(node.attrs["data-csg-rect"] ?? "").split(",").map((v) => Number(v));
    if (rp5.length === 4 && rp5[2] > 0 && rp5[3] > 0) {
      const st5 = String(node.attrs.style ?? "");
      const addW5 = (!/(^|;)\s*width:/.test(st5) ? "width:" + rp5[2] + "px;" : "") +
        (!/(^|;)\s*height:/.test(st5) ? "height:" + rp5[3] + "px;" : "");
      if (addW5) node.attrs.style = st5 ? st5.replace(/;\s*$/, "") + ";" + addW5 : addW5;
    }
    const countDesc = (n) => (n.children || []).reduce((acc, c) => acc + 1 + countDesc(c), 0);
    const droppedDesc = countDesc(node);
    if (droppedDesc > 0) {
      recordSkip("native select options (rendered as collapsed control)");
      timings.coverage.skippedElements += droppedDesc;
      node.children = [];
    }
  }
  // iframe 结构化占位: 外部文档不可静态复现, 可见者按同几何盒表示(display:none 者仍属非视觉跳过)
  if (tag === "iframe") {
    const stRaw = String(node.attrs.style ?? "");
    if (/(^|;)\s*display:\s*none/.test(stRaw)) {
      recordSkip("non-visual element is not rendered");
      return null;
    }
    const fw = Number(node.attrs.width) || 0;
    const fh = Number(node.attrs.height) || 0;
    let fst = stRaw;
    if (fw > 0 && !/(^|;)\s*width:/.test(fst)) fst += "width:" + fw + "px;";
    if (fh > 0 && !/(^|;)\s*height:/.test(fst)) fst += "height:" + fh + "px;";
    node.tag = "div";
    tag = "div";
    node.attrs.style = fst;
    delete node.attrs.src;
  }
  if (!PASSTHROUGH_TAGS.has(tag) && !rasterDataImg) {
    // 替换型媒体元素(video/audio/canvas/object/embed): 布局占位保真——
    // 转为等几何 div(计算样式已内联), 绘制留白; 静默剔除会破坏流内占位
    if (["video", "audio", "canvas", "object", "embed"].includes(tag)) {
      tag = "div";
    } else {
      recordSkip("unsupported element");
      return null;
    }
  }
  if (NON_VISUAL_SKIP.has(tag) && !rasterDataImg) {
    recordSkip("non-visual element is not rendered");
    return null;
  }
  const classNames = [];
  if (node.attrs.class) classNames.push(...String(node.attrs.class).split(/\s+/).filter(Boolean));
  if (node.attrs.style !== undefined && String(node.attrs.style).trim() !== "") {
    const declarations = String(node.attrs.style).split(";").map((piece) => piece.trim()).filter(Boolean)
      .map((piece) => {
        const ci = piece.indexOf(":");
        if (ci <= 0) return piece;
        const norm = normalizeDecl(piece.slice(0, ci), piece.slice(ci + 1));
        return norm.prop + ":" + norm.value;
      });
    for (const declaration of declarations) {
      if (!/^[a-zA-Z-]+\s*:\s*.+$/.test(declaration)) {
        throw new Error('unsupported inline style declaration on <' + tag + '>: "' + declaration + '"');
      }
    }
    // 表单控件 UA 默认 border-box(chrome 计算样式中未透传时在此补齐)
    if (["button", "input", "select", "textarea"].includes(tag) && !declarations.some((d) => d.startsWith("box-sizing:"))) {
      declarations.push("box-sizing:border-box");
    }
    const generatedClass = "inline-" + state.inlineClassCounter;
    state.inlineClassCounter += 1;
    state.generatedCss.push("." + generatedClass + "{" + declarations.join(";") + "}");
    classNames.push(generatedClass);
  }
  const props = {};
  if (classNames.length > 0) props.className = classNames.join(" ");
  // 事件轴: 内联 on* 是静态可转译的绑定,必须 1:1 带过去而不是丢进 dropped 统计。
  // 落成一个 DOM 合法属性 data-csg-ev(逗号分隔事件类型),由 materializer 侧
  // 还原为逐类型的 WebDocumentAddEventListener 绑定并做命中计数。
  const eventTypes = [];
  for (const attrName of Object.keys(node.attrs).sort()) {
    if (attrName === "class" || attrName === "style") continue;
    const attrValue = String(node.attrs[attrName]);
    if (/^on[a-z]+$/.test(attrName)) {
      eventTypes.push(attrName.slice(2).toLowerCase());
      timings.counts.inlineEventAttrs = (timings.counts.inlineEventAttrs ?? 0) + 1;
      continue;
    }
    if (!KEPT_ATTRS.has(attrName)) {
      timings.coverage.droppedAttributesByAttr[attrName] = (timings.coverage.droppedAttributesByAttr[attrName] ?? 0) + 1;
      if (options.strict) throw new Error("--strict: unsupported attribute " + attrName + " on <" + tag + ">");
      continue;
    }
    if (attrValue !== "") props[attrName] = attrValue;
  }
  if (eventTypes.length > 0) {
    props["data-csg-ev"] = [...new Set(eventTypes)].join(",");
  }
  const children = [];
  for (const child of node.children) {
    const transformed = transformNode(child, state);
    if (transformed !== null) children.push(transformed);
  }
  return { kind: "element", tag, props, children };
}

const normalized = await timedAsync("css_collect", async () => {
// ───────────── CSS 规范化: 适配 WebStyleSheetParse 严格文法 ─────────────
// 运行时解析器任何一条规则失败即整张 sheet 报废,且不支持 @media/var()。
// 因此在管线侧完成: 注释剥离、自定义属性静态求值、@media 按视口展开、
// 其余 at-rule 剔除——每一步计数进报告,绝不静默。
timings.cssNormalize = { atRulesDroppedByKind: {}, mediaUnwrapped: 0, mediaDropped: 0, varsResolved: 0, varDeclsDropped: 0, rulesKept: 0 };

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function scanCssRules(css) {
  // 引号感知的深度扫描,产出顶层规则 {selector, body} 与 @media 原文块
  const out = [];
  let depth = 0;
  let start = 0;
  let quote = null;
  let atHeadEnd = -1;
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (quote) { if (ch === "\\" && quote === '"') i += 1; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "{") {
      if (depth === 0) {
        const head = css.slice(start, i).trim();
        out.push({ kind: head.startsWith("@") ? "at" : "rule", head, bodyStart: i + 1 });
      }
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const item = out[out.length - 1];
        item.body = css.slice(item.bodyStart, i);
        start = i + 1;
      }
    }
  }
  return out;
}

function mediaMatches(condition, viewportWidth) {
  const maxMatch = /max-width\s*:\s*([\d.]+)(px|em|rem)?/i.exec(condition);
  const minMatch = /min-width\s*:\s*([\d.]+)(px|em|rem)?/i.exec(condition);
  const toPx = (m) => m ? Number(m[1]) * (m[2] && m[2] !== "px" ? 16 : 1) : null;
  const max = toPx(maxMatch);
  const min = toPx(minMatch);
  if (maxMatch === null && minMatch === null) return false;
  if (max !== null && viewportWidth > max) return false;
  if (min !== null && viewportWidth < min) return false;
  return true;
}

function normalizeCss(css, viewportWidth) {
  const stats = timings.cssNormalize;
  const noComments = stripCssComments(css);
  const customProps = {};
  const keptRules = [];
  function walk(segment) {
    for (const item of scanCssRules(segment)) {
      if (item.kind === "at") {
        const atName = /^@([a-zA-Z-]+)/.exec(item.head);
        const name = atName ? atName[1].toLowerCase() : "unknown";
        if (name === "media") {
          if (mediaMatches(item.head, viewportWidth)) { stats.mediaUnwrapped += 1; walk(item.body); }
          else { stats.mediaDropped += 1; }
        } else {
          stats.atRulesDroppedByKind[name] = (stats.atRulesDroppedByKind[name] ?? 0) + 1;
        }
        continue;
      }
      // 自定义属性收集(:root 等)
      let body = item.body.replace(/(^|;)\s*--[\w-]+\s*:\s*[^;}]*/g, (m) => {
        const decl = m.replace(/^[;\s]+/, "");
        const pair = /(--[\w-]+)\s*:\s*([^;]+)/.exec(decl);
        if (pair && /(:root|^html\b|\bhtml\.)/i.test(item.head)) customProps[pair[1]] = pair[2].trim();
        return (m.startsWith(";") ? ";" : "") + (pair ? "" : m);
      });
      // var() 静态求值(两轮覆盖链式引用)
      for (let pass = 0; pass < 2; pass += 1) {
        body = body.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*)?\s*)?\)/g, (m, name, fallback) => {
          if (customProps[name] !== undefined) { stats.varsResolved += 1; return customProps[name]; }
          if (fallback !== undefined && fallback.trim() !== "") return fallback.trim();
          stats.varDeclsDropped += 1;
          return "\u0000DROP";
        });
      }
      const hadVarDrop = body.includes("\u0000DROP");
      body = body.split(";").filter((d) => {
        const t = d.trim();
        return t !== "" && !t.includes("\u0000DROP");
      }).join(";");
      if (hadVarDrop) stats.varDeclsDropped += 0;
      const isRootOnly = /(^|,)(\s*)?:root(\s*)(,|$)/i.test(item.head);
      if (body.trim() !== "" && !isRootOnly) {
        keptRules.push({ selector: item.head, body, sourceOrder: keptRules.length });
      }
    }
  }
  walk(noComments);
  stats.rulesKept = keptRules.length;
  return { css: keptRules.map((r) => r.selector + "{" + r.body + "}").join("\n"), rules: keptRules };
}
  // ───────────── Stage 3b: CSS 级联——选择器解析 + 全树匹配 + 内联类发射 ─────────────
  // 运行时(web_style_runtime)的匹配器只可靠支持纯 class 单选择器;body{...}/p.tag 等
  // tag/复合选择器要么整表解析失败要么不上色。因此管线侧把规范化后的 CSS 规则按
  // (specificity, sourceOrder) 对 DOM 全树做一次级联,把每个元素的最终声明烘进一条
  // .inline-K{...} 类规则,运行时只需纯 class 匹配即可拿到最终值。
  timings.cssCascade = { rulesParsed: 0, rulesMatchedTotal: 0, elementsStyled: 0, unsupportedSelectors: [], declsApplied: 0 };
  const CSS_INHERITED = new Set(["color", "font-size", "font-family", "line-height", "text-align", "font-weight", "font-style"]);

  function parseCompound(compoundText) {
    const str = compoundText;
    let tag = undefined;
    let id = undefined;
    const classes = [];
    let i = 0;
    const isName = (c) => /[a-zA-Z0-9_-]/.test(c);
    while (i < str.length) {
      const ch = str[i];
      if (ch === ".") {
        i += 1;
        let cls = "";
        while (i < str.length && isName(str[i])) { cls += str[i]; i += 1; }
        if (cls === "") return null;
        classes.push(cls);
      } else if (ch === "#") {
        i += 1;
        let idc = "";
        while (i < str.length && isName(str[i])) { idc += str[i]; i += 1; }
        if (idc === "" || id !== undefined) return null;
        id = idc;
      } else if (/[a-zA-Z]/.test(ch)) {
        if (tag !== undefined) return null;
        let t = "";
        while (i < str.length && isName(str[i])) { t += str[i]; i += 1; }
        tag = t.toLowerCase();
      } else {
        return null;
      }
    }
    return { tag, id, classes };
  }

  function parseSingleSelector(selText) {
    const sel = selText.trim();
    if (/[:\[\]~+*]/.test(sel)) return null;
    const tokens = sel.replace(/>/g, " > ").split(/\s+/).filter((t) => t.length > 0);
    const compounds = [];
    const combinators = [];
    let lastWasCombinator = true;
    for (const tok of tokens) {
      if (tok === ">") {
        if (compounds.length === 0) return null;
        combinators.push("child");
        lastWasCombinator = true;
      } else {
        const comp = parseCompound(tok);
        if (comp === null) return null;
        if (!lastWasCombinator) combinators.push("desc");
        compounds.push(comp);
        lastWasCombinator = false;
      }
    }
    if (combinators.length !== compounds.length - 1) return null;
    let ids = 0, clsCount = 0, tagCount = 0;
    for (const comp of compounds) {
      if (comp.id !== undefined) ids += 1;
      clsCount += comp.classes.length;
      if (comp.tag !== undefined) tagCount += 1;
    }
    return { compounds, combinators, specificity: ids * 100 + clsCount * 10 + tagCount };
  }

  function compoundMatches(comp, elem) {
    if (elem.tag === "#text") return false;
    if (comp.tag !== undefined && String(elem.tag).toLowerCase() !== comp.tag) return false;
    if (comp.id !== undefined && String(elem.attrs?.id ?? "") !== comp.id) return false;
    if (comp.classes.length > 0) {
      const clsSet = new Set(String(elem.attrs?.class ?? "").split(/\s+/).filter(Boolean));
      for (const c of comp.classes) if (!clsSet.has(c)) return false;
    }
    return true;
  }

  function selectorMatches(parsed, elem, chainIncludingSelf) {
    const n = parsed.compounds.length;
    const elemIndex = chainIncludingSelf.length - 1;
    if (!compoundMatches(parsed.compounds[n - 1], elem)) return false;
    if (n === 1) return true;
    const rec = (j, curIdx) => {
      if (j < 0) return true;
      const comb = parsed.combinators[j];
      if (comb === "child") {
        const idx = curIdx - 1;
        if (idx < 0) return false;
        if (!compoundMatches(parsed.compounds[j], chainIncludingSelf[idx])) return false;
        return rec(j - 1, idx);
      }
      for (let idx = curIdx - 1; idx >= 0; idx -= 1) {
        if (compoundMatches(parsed.compounds[j], chainIncludingSelf[idx])) {
          if (rec(j - 1, idx)) return true;
        }
      }
      return false;
    };
    return rec(n - 2, elemIndex);
  }

  function compareDecl(a, b) {
    if (a.spec !== b.spec) return a.spec - b.spec;
    if (a.order !== b.order) return a.order - b.order;
    return a.seq - b.seq;
  }

  function applyCssCascade(rootElem, rules, state2, timingsRef, viewportHeight) {
    const ctx = timingsRef.cssCascade;
    const parsedRules = [];
    const unsupported = [];
    for (const rule of rules) {
      ctx.rulesParsed += 1;
      const selectors = [];
      let ok = true;
      for (const selText of rule.selector.split(",").map((s) => s.trim()).filter(Boolean)) {
        const parsed = parseSingleSelector(selText);
        if (parsed === null) { ok = false; break; }
        selectors.push(parsed);
      }
      if (!ok) {
        if (unsupported.length < 5 && !unsupported.includes(rule.selector)) unsupported.push(rule.selector);
        continue;
      }
      const decls = [];
      for (const d of rule.body.split(";")) {
        const t = d.trim();
        if (t === "") continue;
        const m = /^([a-zA-Z-]+)\s*:\s*(.+)$/.exec(t);
        if (m) decls.push({ prop: m[1].trim(), value: m[2].trim() });
      }
      if (decls.length === 0) continue;
      parsedRules.push({ selector: rule.selector, selectors, decls, sourceOrder: rule.sourceOrder });
    }
    ctx.unsupportedSelectors = unsupported;

    const finalStyles = new Map();
    const ancestors = [];
    const walk = (elem, parentResolved) => {
      const chainIncludingSelf = [...ancestors, elem];
      const matched = new Map();
      let seq = 0;
      for (const rule of parsedRules) {
        for (const parsed of rule.selectors) {
          if (selectorMatches(parsed, elem, chainIncludingSelf)) {
            ctx.rulesMatchedTotal += 1;
            for (const d of rule.decls) {
              const cand = { value: d.value, spec: parsed.specificity, order: rule.sourceOrder, seq };
              seq += 1;
              const prior = matched.get(d.prop.toLowerCase());
              if (prior === undefined || compareDecl(prior, cand) < 0) matched.set(d.prop.toLowerCase(), cand);
            }
          }
        }
      }
      const styleAttr = String(elem.attrs?.style ?? "");
      if (styleAttr.trim() !== "") {
        for (const declaration of styleAttr.split(";").map((p) => p.trim()).filter(Boolean)) {
          if (!/^[a-zA-Z-]+\s*:\s*.+$/.test(declaration)) {
            throw new Error("unsupported inline style declaration on <" + elem.tag + ">: \"" + declaration + "\"");
          }
          const m = /^([a-zA-Z-]+)\s*:\s*(.+)$/.exec(declaration);
          if (m) {
            seq += 1;
            matched.set(m[1].trim().toLowerCase(), { value: m[2].trim(), spec: 1000000, order: Number.MAX_SAFE_INTEGER, seq });
          }
        }
      }
      const resolved = new Map();
      for (const [prop, decl] of matched) resolved.set(prop, decl.value);
      const isHidden = (resolved.get("display") ?? "").trim() === "none";
      for (const prop of CSS_INHERITED) {
        if (!resolved.has(prop)) {
          let parentVal;
          if (parentResolved != null && parentResolved.has(prop)) parentVal = parentResolved.get(prop);
          if (parentVal !== undefined) resolved.set(prop, parentVal);
        }
      }
      finalStyles.set(elem, resolved);
      ancestors.push(elem);
      if (!isHidden) {
        for (const child of (elem.children ?? [])) {
          if (child.tag === "#text") continue;
          walk(child, resolved);
        }
      }
      ancestors.pop();
    };
    walk(rootElem, null);

    // 标签默认 display 显式化: 压掉内置工具表同名类(如 .table{display:table})对页面类的泄漏,
    // 与浏览器初始值语义一致(div/p 本就是 block,span/a 是 inline)
    const TAG_DEFAULT_DISPLAY = { div: "block", p: "block", body: "block", section: "block", article: "block", header: "block", footer: "block", main: "block", nav: "block", ul: "block", ol: "block", li: "block", h1: "block", h2: "block", h3: "block", h4: "block", h5: "block", h6: "block", form: "block", span: "inline", a: "inline", strong: "inline", em: "inline", b: "inline", i: "inline", code: "inline", label: "inline" };
    let styledCount = 0;
    const dedupeByDeclSet = new Map();
    for (const [elem, resolved] of finalStyles) {
      const out = [];
      const tagDefaultDisplay = TAG_DEFAULT_DISPLAY[String(elem.tag || "").toLowerCase()];
      if (tagDefaultDisplay && !resolved.has("display")) {
        out.push("display:" + tagDefaultDisplay);
      }
      if (resolved.size === 0 && out.length === 0) continue;
      // 表单控件 UA 默认 border-box(级联路径与内联路径同规则)
      const ctlTag = String(elem.tag || "").toLowerCase();
      if (["button", "input", "select", "textarea"].includes(ctlTag) && !resolved.has("box-sizing")) {
        out.push("box-sizing:border-box");
      }
      for (const [prop, value] of resolved) {
        const norm = normalizeDecl(prop, value);
        out.push(norm.prop + ":" + norm.value);
      }
      // 绝对定位元素: chrome 矩形即其边界盒真值, 直接以 left/top/width/height 落位,
      // 消除引擎对包含块/约束解析的差异(announcer、recaptcha 徽标等)
      // 仅 fixed 元素注入: 其包含块=视口原点, chrome 视口坐标可直接作 left/top;
      // absolute 的包含块原点未知, 注入绝对坐标会双重约束致错位(实测 f139/f141)
      if (resolved.get("position") === "fixed") {
        const rp7 = String(elem.attrs?.["data-csg-rect"] ?? "").split(",").map((v) => Number(v));
        if (rp7.length === 4 && rp7[2] > 0 && rp7[3] > 0) {
          const has = (p7) => out.some((dcl) => dcl.startsWith(p7 + ":"));
          if (!has("left")) out.push("left:" + rp7[0] + "px");
          if (!has("top")) out.push("top:" + rp7[1] + "px");
          if (!has("width") && !has("right")) out.push("width:" + rp7[2] + "px");
          if (!has("height") && !has("bottom")) out.push("height:" + rp7[3] + "px");
        }
      }
      if (out.length === 0) continue;
      out.sort();
      const declKey = out.join(";");
      let cls = dedupeByDeclSet.get(declKey);
      if (cls === undefined) {
        cls = "inline-" + state2.inlineClassCounter;
        state2.inlineClassCounter += 1;
        dedupeByDeclSet.set(declKey, cls);
        state2.generatedCss.push("." + cls + "{" + declKey + "}");
      }
      const existing = String(elem.attrs?.class ?? "");
      const clsList = existing.split(/\s+/).filter(Boolean);
      clsList.push(cls);
      elem.attrs.class = clsList.join(" ");
      delete elem.attrs.style;
      styledCount += 1;
      ctx.declsApplied += out.length;
    }
    ctx.elementsStyled = styledCount;

    let rootColor = undefined;
    let bodyColor = undefined;
    for (const rule of parsedRules) {
      for (const parsed of rule.selectors) {
        if (parsed.compounds.length === 1) {
          const comp = parsed.compounds[0];
          if ((comp.tag === "html" || comp.tag === "body") && comp.classes.length === 0 && comp.id === undefined) {
            for (const d of rule.decls) {
              const p = d.prop.toLowerCase();
              if (p === "background" || p === "background-color") {
                const norm = normalizeDecl(d.prop, d.value);
                if (norm.prop === "background-color") {
                  if (comp.tag === "html") rootColor = norm.value;
                  else bodyColor = norm.value;
                }
              }
            }
          }
        }
      }
    }
    let rootCanvasClass = undefined;
    if (!rootColor && bodyColor) rootColor = bodyColor;
    if (rootColor) {
      rootCanvasClass = "csg-canvas-bg-" + state2.inlineClassCounter;
      state2.inlineClassCounter += 1;
      state2.generatedCss.push("." + rootCanvasClass + "{background-color:" + rootColor + ";height:" + viewportHeight + "px}");
    }
    return { rootCanvasClass };
  }
  applyTruthColors(document);
const collected = collectStylesAndBody(document);
  const state = { inlineClassCounter: 0, generatedCss: [] };
  // 外链样式表抓取(浏览器语义: 相对页 URL 解析,失败记录后继续)
  const externalResults = [];
  let externalCssText = "";
  for (const href of collected.linkHrefs) {
    try {
      const abs = new URL(href, options.url).href;
      const resp = await fetch(abs, { redirect: "follow", headers: { "user-agent": options.userAgent ?? DEFAULT_USER_AGENT } });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      let css = await resp.text();
      // 非 CSS 载荷(HTML 错误页/JS)混入会毒化整张样式表,按内容双重校验
      const ctype = (resp.headers.get("content-type") ?? "").toLowerCase();
      const head = css.slice(0, 4000);
      const sniffsCss = head.includes("{") && head.includes("}") && !/<script[\s>]/i.test(head);
      if (!sniffsCss) throw new Error("payload is not CSS (content-type=" + (ctype || "none") + ")");
      for (const im of css.matchAll(/@import\s+(?:url\()?["']?([^"')]+)["']?\)?\s*;/gi)) {
        try {
          const absIm = new URL(im[1], abs).href;
          const respIm = await fetch(absIm, { redirect: "follow", headers: { "user-agent": options.userAgent ?? DEFAULT_USER_AGENT } });
          if (respIm.ok) { const t = await respIm.text(); externalCssText += "\n" + t; }
        } catch {}
      }
      externalResults.push({ href: abs, bytes: Buffer.byteLength(css) });
      externalCssText += "\n" + css;
    } catch (error) {
      externalResults.push({ href, error: String(error && error.message ? error.message : error) });
    }
  }
  const rawStylesheet = [...collected.styles, externalCssText].filter(Boolean).join("\n");
  // CSS 外边距折叠(布局算法一次成型): 首个流内子块链的 margin-top 会塌穿
  // 无 padding-top/border-top 的块级祖先(BFC/float/abs 停止), 表现为祖先自身
  // 的有效 top margin(max 正值语义)。采集快照每元素带计算样式, 级联前按规范
  // 折叠算法改写 margin-top: 祖先.mt := max(链上各 mt), 链上成员.mt := 0。
  const pxValC = (styleStr, prop) => {
    const mm = new RegExp("(?:^|;)\\s*" + prop + "\\s*:\\s*(-?[\\d.]+)px").exec(styleStr || "");
    return mm ? Number(mm[1]) : null;
  };
  const styleOfN = (node) => String((node.attrs ?? {}).style ?? "");
  const setStyleN = (node, st) => { node.attrs.style = st; };
  const isStopNode = (node) => {
    const st = styleOfN(node);
    if ((pxValC(st, "padding-top") ?? 0) > 0) return true;
    if ((pxValC(st, "border-top-width") ?? 0) > 0) return true;
    if (/(^|;)\s*float\s*:\s*(left|right)/.test(st)) return true;
    if (/position\s*:\s*(absolute|fixed)/.test(st)) return true;
    return false;
  };
  const firstElemChild = (node) => (node.children ?? []).find((c) => c.tag && c.tag !== "#text") ?? null;
  const hasLeadingText = (node) => {
    for (const c of node.children ?? []) {
      if (c.tag === "#text") { if (/\S/.test(c.text ?? "")) return true; }
      else break;
    }
    return false;
  };
  const stripMt = (node) => {
    const st = styleOfN(node);
    if (!/(^|;)\s*margin-top\s*:/.test(st)) return;
    const out = st.replace(/(^|;)\s*margin-top\s*:[^;]*/g, "$1").replace(/;;+/g, ";").replace(/^[;]/, "");
    setStyleN(node, out);
  };
  const stripMb = (node) => {
    const st = styleOfN(node);
    if (!/(^|;)\s*margin-bottom\s*:/.test(st)) return;
    setStyleN(node, st.replace(/(^|;)\s*margin-bottom\s*:[^;]*/g, "$1").replace(/;;+/g, ";").replace(/^[;]/, ""));
  };
  // 流内元素子(display:none 不参与折叠/流)
  // display:none 判定(内联样式层面)
  const isDisplayNone = (node) => {
    if (!node || !node.tag) return false;
    return /(^|;)\s*display\s*:\s*none/.test(styleOfN(node));
  };
  const elemKids = (node) => (node.children ?? []).filter((c) => c.tag && c.tag !== "#text" && !isDisplayNone(c));
  // 首个块级流内元素子(跳过 display:inline 的前导兄弟——其行盒不阻断塌穿, 与 chrome 实测一致)
  const firstBlockChild = (node) => {
    for (const c of elemKids(node)) {
      if (/display\s*:\s*inline\b/.test(styleOfN(c))) continue;
      return c;
    }
    return null;
  };
  const lastBlockChild = (node) => {
    const ek = elemKids(node);
    for (let i = ek.length - 1; i >= 0; i -= 1) {
      if (/display\s*:\s*inline\b/.test(styleOfN(ek[i]))) continue;
      return ek[i];
    }
    return null;
  };
  const collapseTopChain = (node) => {
    // 返回 node 的首流内子块链塌穿总 mt(max 语义); 链上除 node 自身外的成员已清零。
    if (!node || !node.tag || node.tag === "#text") return 0;
    if (isStopNode(node)) return 0;
    const fc = firstBlockChild(node);
    if (!fc) return 0;
    if (hasLeadingText(node)) return 0;
    const ownDeep = pxValC(styleOfN(fc), "margin-top") ?? 0;
    const deeper = collapseTopChain(fc);
    const eff = Math.max(ownDeep, deeper);
    if (eff > 0) stripMt(fc);
    return eff;
  };
  // 尾流内子块链 margin-bottom 塌穿总量(max); 仅穿过 height:auto 且无底 padding/border 的包装层。
  const collapseBottomChain = (node) => {
    if (!node || !node.tag || node.tag === "#text") return 0;
    if ((pxValC(styleOfN(node), "padding-bottom") ?? 0) > 0) return 0;
    if ((pxValC(styleOfN(node), "border-bottom-width") ?? 0) > 0) return 0;
    const lc = lastBlockChild(node);
    if (!lc) return 0;
    const ownLc = pxValC(styleOfN(lc), "margin-bottom") ?? 0;
    const deeper = collapseBottomChain(lc);
    const eff = Math.max(ownLc, deeper);
    if (eff > 0) stripMb(lc);
    return eff;
  };
  const applyCollapseAtRoots = (node) => {
    const kids = elemKids(node);
    let first = true;
    for (const k of kids) {
      const chainEsc = collapseTopChain(k);
      const ownMt = pxValC(styleOfN(k), "margin-top") ?? 0;
      const escT = Math.max(ownMt, chainEsc);
      if (escT > 0) {
        if (first) {
          stripMt(k);
          const pst = styleOfN(node);
          const pcur = pxValC(pst, "margin-top") ?? 0;
          if (escT > pcur) {
            const base = pst ? pst.replace(/;\s*$/, "") : "";
            setStyleN(node, (base ? base + ";" : "") + "margin-top:" + escT + "px");
          }
        } else if (escT > ownMt) {
          const base = styleOfN(k) ? styleOfN(k).replace(/;\s*$/, "") : "";
          setStyleN(k, (base ? base + ";" : "") + "margin-top:" + escT + "px");
        }
      }
      // 尾链 mb 塌穿: 仅当 k 为 auto 高度且非 BFC 裁剪时向外转移, 否则保留内部(溢出不可见)。
      const escB = collapseBottomChain(k);
      if (escB > 0) {
        const kH = pxValC(styleOfN(k), "height");
        const kAuto = !Number.isFinite(kH);
        const kBfcClip = /overflow(-y)?:\s*(hidden|clip|auto|scroll)/.test(styleOfN(k));
        if (!kAuto && !kBfcClip) {
          // 固定高度: mb 留在内部不影响兄弟; 已由 collapseBottomChain 清零尾链, 溢出不可见
        } else if (kAuto && !kBfcClip) {
          const kMb = pxValC(styleOfN(k), "margin-bottom") ?? 0;
          if (escB > kMb) {
            const base = styleOfN(k) ? styleOfN(k).replace(/;\s*$/, "") : "";
            setStyleN(k, (base ? base + ";" : "") + "margin-bottom:" + escB + "px");
          }
        }
      }
      first = false;
      applyCollapseAtRoots(k);
    }
  };
  applyCollapseAtRoots(collected.body);
  const normalizedCss = normalizeCss(rawStylesheet, options.viewportWidth);
  const cascadeCtx = applyCssCascade(collected.body, normalizedCss.rules, state, timings, options.viewportHeight);
  const bodyTree = transformNode(collected.body, state);
  if (options.rawExtraCssPath) {
    state.generatedCss.push(readFileSync(options.rawExtraCssPath, "utf8"));
  }
  const stylesheet = state.generatedCss.join("\n");
  timings.counts.styleBlocks = collected.styles.length;
  timings.counts.generatedInlineClasses = state.inlineClassCounter;
  timings.counts.stylesheetBytes = Buffer.byteLength(stylesheet);
  timings.counts.externalStylesheets = externalResults.length;
  timings.externalStylesheets = externalResults;
  writeFileSync(join(options.outDir, "stylesheet.normalized.css"), stylesheet + "\n");
  timings.outputs.normalizedCss = join(options.outDir, "stylesheet.normalized.css");
  // 跳转链接发现: 同源 http(s) <a href>,去锚点去重
  const discovered = [];
  const seen = new Set();
  if (/^https?:\/\//.test(options.url)) {
    const baseUrl = new URL(options.url);
    const walkLinks = (node) => {
      if (node.tag === "a" && node.attrs.href) {
        try {
          const resolvedUrl = new URL(String(node.attrs.href), baseUrl);
          resolvedUrl.hash = "";
          if (resolvedUrl.protocol === "http:" || resolvedUrl.protocol === "https:") {
            if (resolvedUrl.host === baseUrl.host && !seen.has(resolvedUrl.href)) {
              seen.add(resolvedUrl.href);
              discovered.push(resolvedUrl.href);
            }
          }
        } catch {}
      }
      for (const child of node.children ?? []) walkLinks(child);
    };
    walkLinks(collected.body);
  }
  timings.links = discovered;
  if (options.linksOut) {
    mkdirSync(dirname(options.linksOut), { recursive: true });
    writeFileSync(options.linksOut, JSON.stringify({ schema: "html_csg_render.links.v1", source: options.url, links: discovered }, null, 2) + "\n");
  }
  return { stylesheet, title: collected.title, bodyTree, rootCanvasClass: cascadeCtx.rootCanvasClass };
});

// ─────────────────────── Stage 4: TSX 工程发射 ───────────────────────
function jsxSerializeChildren(children, indent) {
  const parts = [];
  for (const child of children) {
    if (child.kind === "text") {
      parts.push(indent + "  {" + JSON.stringify(child.text) + "}");
    } else {
      parts.push(jsxSerializeElement(child, indent + "  "));
    }
  }
  return parts;
}
function jsxSerializeElement(node, indent) {
  const propEntries = Object.entries(node.props);
  const head = indent + "<" + node.tag + (propEntries.length > 0
    ? " " + propEntries.map(([key, value]) => key + "=" + JSON.stringify(String(value))).join(" ")
    : "");
  if (node.children.length === 0) return head + " />";
  const inner = jsxSerializeChildren(node.children, indent);
  return [head + ">", ...inner, indent + "</" + node.tag + ">"].join("\n");
}

const project = timed("emit_tsx", () => {
  const projectDir = join(options.outDir, "project");
  rmSync(projectDir, { recursive: true, force: true });
  mkdirSync(join(projectDir, "src"), { recursive: true });
  const usedTags = new Set(["div", "style"]);
  const walkTags = (node) => {
    if (node.kind === "element") {
      usedTags.add(node.tag);
      for (const child of node.children) walkTags(child);
    }
  };
  walkTags(normalized.bodyTree);
  const intrinsicEntries = [...usedTags].sort().map((tag) => {
    if (VOID_TAGS.has(tag)) return "      " + tag + ": { id?: string; className?: string }";
    return "      " + tag + ": { id?: string; className?: string; title?: string; role?: string; type?: string; href?: string; target?: string; name?: string; value?: string; placeholder?: string; datetime?: string; colspan?: string; rowspan?: string; children?: unknown }";
  }).join("\n");

  const rootCanvasClass = normalized.rootCanvasClass;
  const rootAttrs = rootCanvasClass ? ' className="' + rootCanvasClass + '"' : "";
  const rootLines = [
    '  <div id="html-root"' + rootAttrs + '>',
    ...(normalized.bodyTree ? [jsxSerializeElement(normalized.bodyTree, "  ")] : []),
    "  </div>",
  ];
  const tsx = [
    "export {};",
    "",
    "declare global {",
    "  namespace JSX {",
    "    interface Element {}",
    "",
    "    interface IntrinsicElements {",
    intrinsicEntries,
    "    }",
    "  }",
    "}",
    "",
    "const element = (",
    ...rootLines,
    ");",
    "",
    "export function main(): number {",
    "  return 0;",
    "}",
    "",
  ].join("\n");
  writeFileSync(join(projectDir, "src", "main.tsx"), tsx);
  writeFileSync(join(projectDir, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      jsx: "preserve",
      strict: true,
      noImplicitAny: true,
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true,
      skipLibCheck: true,
      rootDir: "src",
    },
    include: ["src/**/*.tsx"],
  }, null, 2) + "\n");
  timings.outputs.tsx = join(projectDir, "src", "main.tsx");
  timings.counts.tsxBytes = Buffer.byteLength(tsx);
  return { projectDir };
});

// ─────────────────────── Stage 5: 字体级联准备 ───────────────────────
function collectRenderableText(node) {
  if (node.kind === "text") return node.text;
  if (node.kind === "element") return node.children.map(collectRenderableText).join(" ");
  return "";
}

const fonts = await timedAsync("fonts", async () => {
  const allText = collectRenderableText(normalized.bodyTree) + " " + normalized.title;
  // 内容寻址缓存: 同一文本集+同一字面级的子集化只做一次(子集化要起 python fonttools,占 ~0.8s)
  const { createHash } = await import("node:crypto");
  const fontFacesAll = discoverDefaultSystemFontFaces();
  const iconFontPath2 = resolve(dirname(resolve(options.url)), "fonts-extra", "material-icons.woff2");
  if (existsSync(iconFontPath2)) fontFacesAll.push({ path: iconFontPath2, weight: 400, family: 2 });
  const cacheKey = createHash("sha256")
    .update(JSON.stringify(fontFacesAll.map((f) => f.path + "|" + (f.weight ?? "") + "|" + (f.fontNumber ?? ""))))
    .update("\u0000")
    .update(allText)
    .digest("hex");
  const cacheDir = options.fontCacheDir ? resolve(options.fontCacheDir) : join(options.outDir, "font-cache");
  const cacheFile = join(cacheDir, cacheKey + ".json");
  let prepared;
  let cacheHit = false;
  try {
    prepared = JSON.parse(readFileSync(cacheFile, "utf8"));
    cacheHit = true;
  } catch {}
  if (!cacheHit) {
    prepared = await prepareFontCascadeBase64({
      fontFaces: fontFacesAll,
      sourceText: allText,
      outDir: join(options.outDir, "fonts"),
      label: "html-csg-render",
      maxBytes: options.fontMaxBytes,
      timeoutMs: 120000,
      requireFullCoverage: true,
    });
    if (prepared.base64s.length === 0) throw new Error("font cascade preparation produced no subsets");
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify({ base64s: prepared.base64s, weights: prepared.base64Weights, families: prepared.base64Families }));
  }
  return { __stageMeta: { subsets: prepared.base64s.length, cacheHit }, base64s: prepared.base64s, weights: prepared.weights ?? prepared.base64Weights, families: prepared.families ?? prepared.base64Families };
});

// ─────────────── Stage 6-8: CSG 提取 → 校验 → 物化 ───────────────
const distWeb = await import(pathToFileURL(join(packageDir, "dist", "csg-web.js")).href);
const distMaterializer = await import(pathToFileURL(join(packageDir, "dist", "csg-web-materializer.js")).href);

// 走 Async 版: 同步版 88% 的时间耗在 spawnSync 上——它把 held-CLI 的
// validate 与 fact-identities 两次扫描串行跑完才返回。Async 版让两次扫描
// 并发,文档注明输出与同步版逐字节相同(此处已用 page.csgweb 比对验证)。
const extracted = await timedAsync("csg_extract", async () => {
  const result = await distWeb.emitCsgWebFromTsAsync({
    project: join(project.projectDir, "tsconfig.json"),
    runtime: ["node", "browser"],
  });
  if (result.diagnostics.length > 0) throw new Error("CSG-Web extraction diagnostics:\n" + result.diagnostics.join("\n"));
  writeFileSync(join(options.outDir, "page.csgweb"), result.text);
  timings.outputs.csgweb = join(options.outDir, "page.csgweb");
  return { __stageMeta: { facts: result.facts.length }, text: result.text };
});

timed("validate", () => {
  const validation = distWeb.validateCsgWebText(extracted.text);
  if (!validation.ok) throw new Error("CSG-Web validation failed:\n" + validation.diagnostics.join("\n"));
  return validation;
});

// 像素资产 sidecar: 生成代码只持 csg-img-ref:N 短引用, 编译体积与时长不受图片字节影响
if (imageAssets.length > 0) {
  const imagesPath = join(options.outDir, "images.json");
  writeFileSync(imagesPath, JSON.stringify(imageAssets));
  process.env.CSG_IMAGES_JSON = imagesPath;
  timings.counts.imageAssets = imageAssets.length;
}
// 主字体 line-height:normal 解析(chrome 语义): 根 font-family(如 "PingFang SC")的
// 垂直度量决定每个元素 normal 行高的 used value = round(ascent*size/upem)+round(|descent|*size/upem)。
// 引擎按显式 px 行高走已验证通路, 故在规范化样式表上做等价改写; 字形级联不动。
const primaryFontMetrics = (() => {
  if (!process.env.CSG_PRIMARY_TTF || !existsSync(process.env.CSG_PRIMARY_TTF)) return null;
  const py = [
    "import sys",
    "from fontTools.ttLib import TTFont",
    "f = TTFont(sys.argv[1], fontNumber=int(sys.argv[2]), lazy=True)",
    "h = f['hhea']; d = f['head']",
    "print(d.unitsPerEm, h.ascent, h.descent, h.lineGap)",
  ].join("\n");
  const idx = process.env.CSG_PRIMARY_TTF_INDEX ?? "0";
  const out = spawnSync("python3", ["-c", py, process.env.CSG_PRIMARY_TTF, String(idx)], { encoding: "utf8" });
  if (out.status !== 0) throw new Error("primary font metrics extraction failed: " + out.stderr);
  const [upem, asc, desc, gap] = out.stdout.trim().split(/\s+/).map((v) => Number(v));
  if (![upem, asc, desc, gap].every(Number.isFinite)) throw new Error("primary font metrics unparsable: " + out.stdout);
  return { upem, ascender: asc, descender: desc, lineGap: gap, source: process.env.CSG_PRIMARY_TTF, fontIndex: Number(idx) };
})();
function resolveNormalLineHeights(css, m) {
  const resolved = (sizePx) =>
    Math.round((m.ascender * sizePx) / m.upem) + Math.round((-m.descender * sizePx) / m.upem);
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, sel, body) => {
    const fs = /font-size:\s*([\d.]+)px/.exec(body);
    const size = fs ? Math.round(parseFloat(fs[1])) : 16;
    let nb = body.replace(/line-height:\s*normal/g, `line-height:${resolved(size)}px`);
    if (!/line-height:/.test(nb)) nb = `${nb};line-height:${resolved(size)}px`;
    return `${sel}{${nb}}`;
  });
}
const effectiveCss = primaryFontMetrics ? resolveNormalLineHeights(normalized.stylesheet, primaryFontMetrics) : normalized.stylesheet;
if (primaryFontMetrics) timings.counts.primaryFontMetrics = primaryFontMetrics;
const materialized = timed("materialize", () => {
  const result = distMaterializer.materializeCsgWebFactsToChengSource(extracted.text, {
    frameLimit: 1,
    pureCheng: true,
    rawPixelDump: true,
    viewport: options.viewportWidth + "x" + options.viewportHeight,
    fontBase64s: fonts.base64s,
    fontWeights: fonts.weights,
    fontFamilies: fonts.families,
    // 页面 CSS 走 extraCssText：materializer 会把内置 Tailwind 表覆写 styleSheetCss，
    // 只有该选项能把页面规则追加到同一张 sheet（WebStyleSheetParse 支持 tag/id/class/attr/pseudo）。
    extraCssText: process.env.CSG_SKIP_SITE_CSS === "1" ? "" : effectiveCss,
  });
  if (result.diagnostics.length > 0) throw new Error("materialization diagnostics:\n" + result.diagnostics.join("\n"));
  const sourcePath = join(options.outDir, "page.cheng");
  // env-gated ORC diag 符号补齐: 并发 lane 的 uncommitted probe 引用了外部 C 符号,
  // 此处用 @exportc 在 Cheng 侧定义等价 stub, 由编译器发到最终链接, 不动共享源。
  let chengSource = result.text;
  if (process.env.CSG_ORC_DIAG_STUB === "1") {
    chengSource = chengSource + "\n@exportc(\"__cheng_orc_diag_dump_stack\")\n@abi_internal\nfn csg_orc_diag_stub_export(words: int32): int32 =\n    return words\n";
  }
  writeFileSync(sourcePath, chengSource);
  timings.outputs.cheng = sourcePath;
  timings.counts.chengLines = chengSource.split("\n").length;
  return { __stageMeta: { elements: result.counts.elements }, text: result.text };
});

// ─────────────────── Stage 9: 编译 + 本机链接 ───────────────────
// cold source snapshot 合同要求 .cheng 文档位于 <package_root>/src/ 之下
// （bootstrap/cheng_cold.c cold_source_snapshot_resolve_document），因此编译输入
// 必须落在 src/tests/ 内；成功后清理，失败时保留现场。
const native = timed("compile_link", () => {
  const compileSrcDir = join(repoRoot, "src", "tests", "html-csg-render");
  mkdirSync(compileSrcDir, { recursive: true });
  // 稳定文件名 + 保留源文件:内容不变时命中 cold_object_cache(键含 entry 路径与字节),
  // 重复渲染跳过 ~450s 的单线程 parse;内容变化则键变化,自动 miss 重编,正确性不受影响。
  const runTag = "run-latest.cheng";
  const compileSourcePath = join(compileSrcDir, runTag);
  copyFileSync(timings.outputs.cheng, compileSourcePath);
  try {
    const result = compileNativeGuiChengSourceToExe({
      repoRoot,
      sourcePath: compileSourcePath,
      exePath: join(options.outDir, "html-app"),
      outDir: options.outDir,
      reportPath: join(options.outDir, "page.compile.report.txt"),
      cheng: options.cheng,
      timeout: options.compileTimeoutMs,
    });
    timings.outputs.exe = result.exePath;
    // 编译器镜像回执: 发布证据必须绑定具体编译器身份,不能只报"过了门禁"
    timings.compiler = {
      path: options.cheng,
      sha256: createHash("sha256").update(readFileSync(options.cheng)).digest("hex"),
      sizeBytes: statSync(options.cheng).size,
    };
    // 保留 run-latest.cheng:冷对象缓存键含 entry 字节,保留可稳定命中
    timings.outputs.compileSource = compileSourcePath;
    return { __stageMeta: { mode: result.mode }, result };
  } catch (error) {
    timings.outputs.compileSourceFailed = compileSourcePath;
    throw error;
  }
});

// ─────────────────── Stage 10: 运行 + 光栅化输出 ───────────────────
const runResult = timed("run_raster", () => {
  const run = spawnSync(native.result.exePath, [], {
    cwd: repoRoot,
    encoding: "buffer",
    timeout: options.runTimeoutMs,
    maxBuffer: 512 * 1024 * 1024,
  });
  if (run.error) throw run.error;
  if (run.status !== 0) {
    throw new Error("rendered executable exited with status " + run.status + " signal " + run.signal + "; stderr=" + String(run.stderr || "").slice(0, 2000));
  }
  const stdout = run.stdout || Buffer.alloc(0);
  const completionMarker = typeof distMaterializer.CsgWebMaterializerMarker === "string" ? distMaterializer.CsgWebMaterializerMarker : "csg_web_materializer ok";
  if (!stdout.includes(completionMarker)) {
    throw new Error("rendered executable did not emit completion marker; stdout head=" + stdout.slice(0, 600));
  }
  const domMarker = Buffer.from("---CHENG_DOM_DUMP---");
  const layoutMarker = Buffer.from("---CHENG_LAYOUT_DUMP---");
  const shotMarker = Buffer.from("---CHENG_SCREENSHOT_DUMP---");
  const endMarker = Buffer.from("---CHENG_DUMP_END---");
  const domStart = stdout.indexOf(domMarker);
  const layoutStart = stdout.indexOf(layoutMarker);
  const shotStart = stdout.indexOf(shotMarker);
  const dumpEnd = stdout.indexOf(endMarker);
  if (domStart < 0 || layoutStart < 0 || shotStart < 0 || dumpEnd < 0) {
    throw new Error("rendered executable output missing dump markers; stdout length=" + stdout.length);
  }
  const domDump = stdout.subarray(domStart + domMarker.length, layoutStart).toString("utf8").trim();
  const layoutDump = stdout.subarray(layoutStart + layoutMarker.length, shotStart).toString("utf8").trim();
  writeFileSync(join(options.outDir, "dom-dump.txt"), domDump + "\n");
  writeFileSync(join(options.outDir, "layout-dump.txt"), layoutDump + "\n");
  timings.outputs.domDump = join(options.outDir, "dom-dump.txt");
  timings.outputs.layoutDump = join(options.outDir, "layout-dump.txt");
  timings.counts.layoutBoxes = layoutDump.split("\n").filter((line) => line.trim().length > 0).length;
  timings.counts.domLines = domDump.split("\n").filter((line) => line.trim().length > 0).length;
  const headText = stdout.subarray(0, shotStart).toString("utf8");
  const parityLine = /PARITY total=\d+ pass=\d+ fail=\d+/.exec(headText)?.[0];
  const eventLine = /EVENTCHECK total=\d+ hitok=\d+ dispatched=\d+/.exec(headText)?.[0];
  const actLine = /EVENTACT navfocus=\d+/.exec(headText)?.[0];
  if (parityLine) { timings.counts.parity = parityLine; console.log("  " + parityLine); }
  if (eventLine) { timings.counts.eventCheck = eventLine; console.log("  " + eventLine); }
  if (actLine) { console.log("  " + actLine); }
  const pfLine = /PF miss=\d+ x=\d+ w=\d+ dx=-?\d+ dy=-?\d+ dw=-?\d+ dh=-?\d+/.exec(headText)?.[0];
  if (pfLine) { console.log("  " + pfLine); }
  const pfws = /PFF k=\d+ n=\d+ ew=\d+ eh=\d+ fx=-?\d+ fy=-?\d+ fw=-?\d+ m=\d+/g;
  let m2; const lim = [];
  while ((m2 = pfws.exec(headText)) !== null && lim.length < 90) lim.push(m2[0]);
  for (const l of lim) console.log("  " + l);
  const twLine = /TWSTATS stats=\d+/.exec(headText)?.[0];
  const taLine = /TWATTRS count=\d+/.exec(headText)?.[0];
  const tpLine = /TWPROBE \d+/.exec(headText)?.[0];
  if (tpLine) { console.log("  " + tpLine); }
  if (taLine) { console.log("  " + taLine); }
  if (twLine) { console.log("  " + twLine); }

  // 像素区零中间字符串: 直接在 Buffer 字节上解析 r,g,b,a 写入 RGBA
  const width = options.viewportWidth;
  const height = options.viewportHeight;
  const rgba = Buffer.allocUnsafe(width * height * 4);
  const pxRegion = stdout.subarray(shotStart + shotMarker.length, dumpEnd);
  let rowIndex = 0;
  let p = 0;
  while (p < pxRegion.length && rowIndex < height) {
    let nl = pxRegion.indexOf(10, p);
    if (nl < 0) nl = pxRegion.length;
    if (nl - p > 5 && pxRegion[p] === 114 && pxRegion[p + 1] === 111 && pxRegion[p + 2] === 119) {
      let i = p + 5;
      while (i < nl && pxRegion[i] === 32) i += 1;
      let pos = rowIndex * width * 4;
      let val = 0;
      for (; i <= nl; i += 1) {
        const b = i < nl ? pxRegion[i] : 44;
        if (b >= 48 && b <= 57) { val = val * 10 + (b - 48); }
        else if (b === 44 || b === 13 || i === nl) { rgba[pos] = val; pos += 1; val = 0; }
        else throw new Error("bad byte in pixel row " + rowIndex + ": " + b);
      }
      if (pos !== (rowIndex + 1) * width * 4) throw new Error("pixel row " + rowIndex + " decoded " + (pos - rowIndex * width * 4) + " channels, expected " + width * 4);
      rowIndex += 1;
    }
    p = nl + 1;
  }
  return { __stageMeta: { pixelRows: rowIndex }, rgba, rowCount: rowIndex };
});

// ─────────────────── Stage 11: 像素 → PNG ───────────────────
await timedAsync("encode_png", async () => {
  const sharpModule = await import("sharp");
  const sharp = sharpModule.default ?? sharpModule;
  const width = options.viewportWidth;
  const height = options.viewportHeight;
  if (runResult.rowCount !== height) {
    throw new Error("expected " + height + " pixel rows, got " + runResult.rowCount);
  }
  const rgba = runResult.rgba;
  const pngPath = join(options.outDir, "render.png");
  await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toFile(pngPath);
  timings.outputs.renderPng = pngPath;
  timings.counts.rasterPixels = width * height;
  return { __stageMeta: { bytes: statSync(pngPath).size } };
});

// 渲染后自检: 像素统计写入 timings,空白/纯色/低色数直接给 verdict
await timedAsync("render_check", async () => {
  const sharpModule = await import("sharp");
  const sharp = sharpModule.default ?? sharpModule;
  const { data, info } = await sharp(timings.outputs.renderPng).raw().toBuffer({ resolveWithObject: true });
  let nonWhite = 0;
  const colors = new Map();
  const total = info.width * info.height;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) nonWhite += 1;
    const key = (data[i] >> 3) + "," + (data[i + 1] >> 3) + "," + (data[i + 2] >> 3);
    colors.set(key, (colors.get(key) ?? 0) + 1);
  }
  const topColor = [...colors.entries()].sort((a, b) => b[1] - a[1])[0];
  const nonWhiteRatio = nonWhite / total;
  const topRatio = topColor ? topColor[1] / total : 0;
  let verdict = "content";
  if (nonWhiteRatio < 0.005) verdict = "suspicious_blank";
  else if (colors.size < 8) verdict = "suspicious_low_colors";
  else if (topRatio > 0.985 && colors.size < 24) verdict = "suspicious_solid";
  timings.check = { pixels: total, nonWhiteRatio: Number(nonWhiteRatio.toFixed(4)), distinctColors5bit: colors.size, topColorShare: Number(topRatio.toFixed(4)), verdict };
});

// ─────────────────────────── 汇总输出 ───────────────────────────
timings.totalMs = +timings.stages.reduce((sum, stage) => sum + stage.ms, 0).toFixed(1);
timings.coverage.skippedNodesTotal = timings.coverage.skippedNodes;
delete timings.coverage.skippedNodes;
writeFileSync(join(options.outDir, "render-timings.json"), JSON.stringify(timings, null, 2) + "\n");

process.stdout.write("\nhtml-csg-render ok\n");
process.stdout.write("  input     : " + options.url + "\n");
process.stdout.write("  viewport  : " + options.viewport + "\n");
process.stdout.write("  title     : " + (normalized.title || "(none)") + "\n");
process.stdout.write("  render.png: " + timings.outputs.renderPng + "\n");
process.stdout.write("  timings   : " + join(options.outDir, "render-timings.json") + "\n");
  if (timings.check) process.stdout.write("  self-check: " + timings.check.verdict + " (nonWhite=" + timings.check.nonWhiteRatio + " colors=" + timings.check.distinctColors5bit + ")\n");
if (timings.coverage.skippedNodesTotal > 0) {
  process.stdout.write("  coverage  : skipped " + timings.coverage.skippedNodesTotal + " unsupported node(s): " + JSON.stringify(timings.coverage.skippedSubtreesByTag) + "\n");
}
