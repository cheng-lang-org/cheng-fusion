#!/usr/bin/env node
/**
 * html-csg-live-observe.mjs — 任意指定页面 1:1 实时镜像的增量观测器 (LIVE_MIRROR_CAMPAIGN P0+P2)。
 *
 * 页内注入 MutationObserver + input/change 捕获 → rAF 合帧批量投递 → live_scene JSONL 事实流
 * → Node 侧重放出镜像模型 → 与两条独立真值路径逐节点对账:
 *   1. 页内全量序列化 (同序列化器, 独立重遍历)
 *   2. CDP DOMSnapshot.captureSnapshot (完全绕开 observer 通路)
 * 输入事件流 (input/change, 值+liveId+checked) 与驱动器逐键读回的真值序列精确对账。
 * 不支持的 mutation 形 (comment/doctype/PI 等) 投递 __unsup 事实, 非 0 即 FAIL, 绝不静默;
 * --force-unsupported 为负控: 强制制造 unsupported 形, 期望 FAIL 证明清单不是死代码。
 *
 * 用法:
 *   node scripts/html-csg-live-observe.mjs --url <file-or-http> [--out-dir <dir>]
 *        [--viewport 1280x800] [--steps 40] [--seed 7] [--mask-input]
 *        [--force-unsupported] [--headed]
 * 输出: <out-dir>/{report.json, live_scene.jsonl, inputs.jsonl, steps.json}; exit 0|1
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");

function fail(message) {
  process.stderr.write("html-csg-live-observe: " + message + "\n");
  process.exit(1);
}

const options = (() => {
  const p = {
    url: join(packageDir, "fixtures", "live-observe-basic", "index.html"),
    outDir: "",
    viewport: "1280x800",
    steps: 40,
    seed: 7,
    maskInput: false,
    forceUnsupported: false,
    headed: false,
    timeoutMs: 60000,
  };
  const args = process.argv.slice(2);
  const next = (i) => { if (i + 1 >= args.length) fail("missing value for " + args[i]); return args[i + 1]; };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--url") { p.url = next(i); i += 1; }
    else if (a === "--out-dir") { p.outDir = next(i); i += 1; }
    else if (a === "--viewport") { p.viewport = next(i); i += 1; }
    else if (a === "--steps") { p.steps = Number(next(i)); i += 1; }
    else if (a === "--seed") { p.seed = Number(next(i)); i += 1; }
    else if (a === "--mask-input") p.maskInput = true;
    else if (a === "--force-unsupported") p.forceUnsupported = true;
    else if (a === "--headed") p.headed = true;
    else if (a === "--timeout") { p.timeoutMs = Number(next(i)); i += 1; }
    else fail("unknown argument: " + a);
  }
  if (!Number.isFinite(p.steps) || p.steps < 0) fail("--steps must be a non-negative number");
  if (!p.outDir) p.outDir = join(packageDir, "tmp", "live-observe", "last-run");
  return p;
})();

function sha256(buf) { return createHash("sha256").update(buf).digest("hex"); }

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────── 页内代码 (自包含函数, 经 puppeteer evaluate(fn, arg) 传参, 无闭包逃逸) ─────────────────

// 页内引导: 分配 int32 节点 id → 装 MutationObserver + input/change 捕获 → rAF 合帧投递
// → 注册 window.__liveSerialize() 供真值提取。返回基线信息。
async function liveBootInPage(opts) {
  const MASK = "\u00ABmasked\u00BB";
  const nextId = { n: 1 };
  const ids = new Map();
  const assignId = (node) => {
    let i = ids.get(node);
    if (i === undefined) { i = nextId.n; nextId.n += 1; ids.set(node, i); }
    return i;
  };
  function serializeSubtree(node) {
    if (node.nodeType === 3) return { id: assignId(node), k: "txt", x: node.nodeValue, c: [] };
    const a = {};
    for (const attr of node.attributes) a[attr.name] = attr.value;
    const c = [];
    for (const ch of node.childNodes) {
      if (ch.nodeType === 1 || ch.nodeType === 3) c.push(serializeSubtree(ch));
    }
    const aSorted = {};
    for (const name of Object.keys(a).sort()) aSorted[name] = a[name];
    return { id: assignId(node), k: "el", t: node.tagName.toLowerCase(), a: aSorted, c };
  }
  const walker = document.createTreeWalker(document.documentElement, 133 /* ELEMENT|TEXT */);
  let cur = walker.currentNode;
  while (cur) { assignId(cur); cur = walker.nextNode(); }

  const pending = [];
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    if (!pending.length) return;
    const batch = { flushPerf: performance.now(), epochMs: Date.now(), ops: pending.splice(0) };
    window.__liveDeliver(batch);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => setTimeout(flush, 0));
    setTimeout(() => { if (scheduled) flush(); }, 50);
  };
  const push = (op) => { op.p = performance.now(); pending.push(op); schedule(); };

  const observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "childList") {
        for (const n of m.removedNodes) {
          if (n.nodeType === 1 || n.nodeType === 3) push({ k: "remove", id: assignId(n) });
          else push({ k: "__unsup", kind: n.nodeType === 8 ? "comment" : "nodeType:" + n.nodeType, detail: "removed under #" + (m.target.id || "") });
        }
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 || n.nodeType === 3) {
            push({ k: "add", parent: assignId(m.target), before: m.nextSibling ? assignId(m.nextSibling) : null, tree: serializeSubtree(n) });
          } else push({ k: "__unsup", kind: n.nodeType === 8 ? "comment" : "nodeType:" + n.nodeType, detail: "added under #" + (m.target.id || "") });
        }
      } else if (m.type === "attributes") {
        push({ k: "attr", id: assignId(m.target), name: m.attributeName, value: m.target.getAttribute(m.attributeName) });
      } else if (m.type === "characterData") {
        push({ k: "text", id: assignId(m.target), value: m.target.nodeValue });
      } else {
        push({ k: "__unsup", kind: "mutation:" + m.type, detail: "" });
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });

  const onDomEvent = (eventType) => (e) => {
    const t = e.target;
    if (!t || t.nodeType !== 1) return;
    if (t.value === undefined) return;
    const liveEl = t.closest("[data-live-id]");
    push({
      k: "input", eventType,
      id: assignId(t),
      liveId: liveEl ? liveEl.getAttribute("data-live-id") : null,
      inputType: e.inputType || null,
      value: opts.maskInput ? MASK : String(t.value == null ? "" : t.value),
      checked: typeof t.checked === "boolean" ? t.checked : null,
    });
  };
  document.addEventListener("input", onDomEvent("input"), true);
  document.addEventListener("change", onDomEvent("change"), true);

  window.__liveSerialize = () => serializeSubtree(document.documentElement);
  const baseline = window.__liveSerialize();
  const countNodes = (n) => 1 + n.c.reduce((s, c) => s + countNodes(c), 0);
  window.__liveDeliver({
    flushPerf: performance.now(), epochMs: Date.now(),
    ops: [{ k: "base", tree: baseline, p: performance.now() }],
    baselineNodes: countNodes(baseline),
  });
  return {
    baselineNodes: countNodes(baseline),
    liveIds: [...document.querySelectorAll("[data-live-id]")].map((e) => e.getAttribute("data-live-id")),
  };
}

// 页内驱动执行器: 全部随机性已在 Node 侧解析, 页内只做确定性下标选取。
function liveDriveInPage(step) {
  const mutable = [...document.querySelectorAll("[data-live-mutable]")];
  const pick = (list, idx) => (list.length ? list[idx % list.length] : null);
  const inMutable = [...document.querySelectorAll("[data-live-mutable] *")].filter((e) => e.nodeType === 1);
  switch (step.op) {
    case "setText": {
      const walker = document.createTreeWalker(document.documentElement, 4 /* TEXT */);
      const texts = [];
      let n = walker.currentNode;
      while (n) { if ((n.nodeValue || "").trim().length > 0) texts.push(n); n = walker.nextNode(); }
      const t = pick(texts, step.idx);
      if (!t) return { op: step.op, ok: false, reason: "no-text" };
      t.nodeValue = step.text;
      return { op: step.op, ok: true };
    }
    case "setAttr": {
      const el = pick(inMutable, step.idx);
      if (!el) return { op: step.op, ok: false, reason: "no-el" };
      if (step.name === "style") el.style.setProperty("opacity", step.value);
      else el.setAttribute(step.name, step.value);
      return { op: step.op, ok: true };
    }
    case "addEl": {
      const parent = pick(mutable, step.idx);
      if (!parent) return { op: step.op, ok: false, reason: "no-parent" };
      const div = document.createElement("div");
      div.setAttribute("data-live-added", String(step.n));
      div.appendChild(document.createTextNode(step.text));
      if (step.pos === "first") parent.insertBefore(div, parent.firstChild);
      else parent.appendChild(div);
      return { op: step.op, ok: true };
    }
    case "addText": {
      const parent = pick(mutable, step.idx);
      if (!parent) return { op: step.op, ok: false, reason: "no-parent" };
      parent.appendChild(document.createTextNode(step.text));
      return { op: step.op, ok: true };
    }
    case "removeEl": {
      const cands = inMutable.filter((e) => e.parentElement && e.parentElement.closest("[data-live-mutable]"));
      const el = pick(cands, step.idx);
      if (!el) return { op: step.op, ok: false, reason: "no-cand" };
      el.remove();
      return { op: step.op, ok: true, tag: el.tagName.toLowerCase() };
    }
    case "moveEl": {
      const cands = inMutable.filter((e) => e.classList && e.classList.contains("live-movable"));
      const el = pick(cands, step.idx);
      if (!el) return { op: step.op, ok: false, reason: "no-movable" };
      const dests = mutable.filter((c) => c !== el.parentElement);
      const dest = pick(dests, step.idx + 1);
      if (!dest) return { op: step.op, ok: false, reason: "no-dest" };
      dest.appendChild(el);
      return { op: step.op, ok: true };
    }
    case "removeComment": {
      const walker = document.createTreeWalker(document.documentElement, 128 /* COMMENT */);
      const c = walker.nextNode();
      if (!c) return { op: step.op, ok: false, reason: "no-comment" };
      c.remove();
      return { op: step.op, ok: true };
    }
    default:
      return { op: step.op, ok: false, reason: "unknown-op" };
  }
}

// ───────────────── Node 侧: 步骤生成 / 模型重放 / 真值对账 ─────────────────

function generateSteps(seed, steps, liveIdSets) {
  const rnd = mulberry32(seed);
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const pickOf = (arr) => arr[int(0, arr.length - 1)];
  const actions = ["setText", "setAttr", "addEl", "addText", "removeEl", "moveEl"];
  if (liveIdSets.inputs.length) actions.push("type", "type", "type", "paste");
  if (liveIdSets.selects.length) actions.push("select");
  if (liveIdSets.checks.length) actions.push("check");
  const out = [];
  for (let i = 0; i < steps; i += 1) {
    const kind = pickOf(actions);
    if (kind === "setText") out.push({ op: kind, idx: int(0, 64), text: "mut " + i });
    else if (kind === "setAttr") out.push({ op: kind, idx: int(0, 64), name: rnd() < 0.5 ? "data-live-n" : "style", value: rnd() < 0.5 ? String(i) : String((i % 11) / 10), n: i });
    else if (kind === "addEl") out.push({ op: kind, idx: int(0, 8), pos: rnd() < 0.5 ? "first" : "last", text: "added " + i, n: i });
    else if (kind === "addText") out.push({ op: kind, idx: int(0, 8), text: " tail " + i });
    else if (kind === "removeEl" || kind === "moveEl") out.push({ op: kind, idx: int(0, 64) });
    else if (kind === "type") out.push({ op: kind, liveId: pickOf(liveIdSets.inputs) });
    else if (kind === "paste") out.push({ op: kind, liveId: pickOf(liveIdSets.inputs), text: "pasted " + i });
    else if (kind === "select") out.push({ op: kind, liveId: pickOf(liveIdSets.selects), value: pickOf(["a", "b", "c"]) });
    else if (kind === "check") out.push({ op: kind, liveId: pickOf(liveIdSets.checks) });
  }
  return out;
}

class MirrorModel {
  constructor() { this.byId = new Map(); this.root = null; }
  apply(op) {
    if (op.k === "base") { this.root = this.cloneTree(op.tree); return; }
    if (op.k === "add") {
      const parent = this.byId.get(op.parent);
      if (!parent) throw new Error("add to unknown parent " + op.parent);
      const node = this.cloneTree(op.tree);
      const at = op.before == null ? -1 : parent.c.findIndex((c) => c.id === op.before);
      if (op.before != null && at < 0) throw new Error("add before unknown sibling " + op.before);
      if (at < 0) parent.c.push(node); else parent.c.splice(at, 0, node);
      return;
    }
    if (op.k === "remove") {
      const node = this.byId.get(op.id);
      if (!node) throw new Error("remove unknown id " + op.id);
      const parent = this.parentOf(node);
      if (!parent) throw new Error("remove root");
      parent.c.splice(parent.c.indexOf(node), 1);
      this.dropTree(node);
      return;
    }
    if (op.k === "attr") {
      const node = this.byId.get(op.id);
      if (!node) throw new Error("attr unknown id " + op.id);
      if (node.k !== "el") throw new Error("attr on non-element " + op.id);
      if (op.value == null) delete node.a[op.name]; else node.a[op.name] = op.value;
      return;
    }
    if (op.k === "text") {
      const node = this.byId.get(op.id);
      if (!node) throw new Error("text unknown id " + op.id);
      if (node.k !== "txt") throw new Error("text on non-text " + op.id);
      node.x = op.value;
      return;
    }
    throw new Error("unknown op kind " + op.k);
  }
  cloneTree(t) {
    const node = t.k === "txt" ? { id: t.id, k: "txt", x: t.x, c: [] } : { id: t.id, k: "el", t: t.t, a: { ...t.a }, c: [] };
    this.byId.set(node.id, node);
    node.c = t.c.map((c) => this.cloneTree(c));
    return node;
  }
  parentOf(target) {
    const walk = (n) => {
      if (n.c.includes(target)) return n;
      for (const c of n.c) { const r = walk(c); if (r) return r; }
      return null;
    };
    return this.root ? walk(this.root) : null;
  }
  dropTree(node) { this.byId.delete(node.id); for (const c of node.c) this.dropTree(c); }
  canonical(node) {
    if (node.k === "txt") return { t: "#text", x: node.x, a: {}, c: [] };
    const a = {};
    for (const k of Object.keys(node.a).sort()) a[k] = node.a[k];
    return { t: node.t, a, x: null, c: node.c.map((c) => this.canonical(c)) };
  }
}

function firstDivergence(a, b, path) {
  if (a.t !== b.t) return path + " tag " + a.t + " vs " + b.t;
  const aA = a.a || {}, bA = b.a || {};
  for (const k of Object.keys(aA)) if (!(k in bA)) return path + " attr-only-model:" + k;
  for (const k of Object.keys(bA)) if (!(k in aA)) return path + " attr-only-truth:" + k;
  for (const k of Object.keys(aA)) if (aA[k] !== bA[k]) return path + " attr " + k + ": " + JSON.stringify(aA[k]) + " vs " + JSON.stringify(bA[k]);
  if ((a.x ?? null) !== (b.x ?? null)) return path + " text " + JSON.stringify(a.x) + " vs " + JSON.stringify(b.x);
  if (a.c.length !== b.c.length) return path + " childCount " + a.c.length + " vs " + b.c.length;
  for (let i = 0; i < a.c.length; i += 1) {
    const d = firstDivergence(a.c[i], b.c[i], path + "/" + a.t + "[" + i + "]");
    if (d) return d;
  }
  return null;
}

// CDP DOMSnapshot → canonical 树 (独立真值路径)。nodes 为 SoA 平铺: 字符串表索引 + parentIndex。
function snapTreeFromCdpSnapshot(snap) {
  const S = snap.strings;
  const nodes = snap.documents[0].nodes;
  for (const f of ["nodeType", "nodeName", "nodeValue", "attributes", "parentIndex"]) {
    if (!Array.isArray(nodes[f])) throw new Error("DOMSnapshot: missing nodes." + f);
  }
  const resolve = (i) => (i == null || i < 0 ? "" : (S[i] ?? ""));
  const childrenOf = new Map();
  nodes.parentIndex.forEach((p, i) => {
    if (p == null || p < 0) return;
    if (!childrenOf.has(p)) childrenOf.set(p, []);
    childrenOf.get(p).push(i);
  });
  const build = (idx) => {
    const type = nodes.nodeType[idx];
    const name = resolve(nodes.nodeName[idx]);
    if (type === 3) return { t: "#text", x: resolve(nodes.nodeValue[idx]), a: {}, x2: null, c: [] };
    // 伪元素(::marker 等, nodeName 以 :: 开头)不是 childNodes 成员, 双侧同规则排除
    if (type !== 1 || name.startsWith("::") || (nodes.pseudoType && nodes.pseudoType[idx])) return { t: "#skip", skip: true };
    const attrs = {};
    const arr = (nodes.attributes[idx] || []).map((si) => {
      if (typeof si !== "number") throw new Error("DOMSnapshot: non-index attribute entry " + JSON.stringify(si));
      return resolve(si);
    });
    for (let i = 0; i + 1 < arr.length; i += 2) attrs[arr[i]] = arr[i + 1];
    const c = (childrenOf.get(idx) || []).map((ci) => build(ci)).filter((n) => !n.skip);
    return { t: name.toLowerCase(), a: attrs, x: null, c };
  };
  const docChildren = (childrenOf.get(0) || []).map((ci) => build(ci));
  const html = docChildren.find((n) => !n.skip && n.t === "html");
  if (!html) throw new Error("DOMSnapshot: no html root");
  return html;
}

function percentiles(samples) {
  if (!samples.length) return { n: 0 };
  const s = [...samples].sort((x, y) => x - y);
  const at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { n: s.length, p50: Math.round(at(0.5)), p95: Math.round(at(0.95)), max: s[s.length - 1] };
}

// 页内序列化形状 {id,k,t,a,c,x} → canonical 形状 {t,a,x,c}
function canonInpage(n) {
  if (n.k === "txt") return { t: "#text", x: n.x, a: {}, c: n.c.map(canonInpage) };
  return { t: n.t, a: n.a, x: null, c: n.c.map(canonInpage) };
}

// ───────────────── 主流程 ─────────────────

const puppeteer = (await import("puppeteer")).default;
const [vw, vh] = options.viewport.split("x").map(Number);
mkdirSync(options.outDir, { recursive: true });

const fixturePath = options.url.startsWith("http") ? null : resolve(options.url);
const fixtureSha = fixturePath ? sha256(readFileSync(fixturePath)) : null;
const scriptSha = sha256(readFileSync(join(scriptDir, "html-csg-live-observe.mjs")));
const MASK = "\u00ABmasked\u00BB";

const browser = await puppeteer.launch({
  headless: !options.headed,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  pipe: !options.headed,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  defaultViewport: null,
});

const ops = [];
const inputOps = [];
let baselineNodes = -1;
let verdict = "FAIL";
const report = {};

try {
  const page = await browser.newPage();
  await page.setViewport({ width: vw, height: vh });
  await page.exposeFunction("__liveDeliver", (batch) => {
    const arrivalMs = Date.now();
    for (const op of batch.ops) {
      const rec = { ...op, arrivalMs, coalesceMs: Math.round(batch.flushPerf - op.p), transportMs: arrivalMs - batch.epochMs };
      delete rec.p;
      ops.push(rec);
      if (rec.k === "input") inputOps.push(rec);
    }
    if (batch.baselineNodes != null) baselineNodes = batch.baselineNodes;
  });

  const gotoTarget = options.url.startsWith("http") ? options.url : "file://" + fixturePath;
  await page.goto(gotoTarget, { waitUntil: "networkidle0", timeout: options.timeoutMs });
  await page.evaluate(() => document.fonts.ready);

  const bootInfo = await page.evaluate(liveBootInPage, { maskInput: options.maskInput });
  const liveIdSets = {
    inputs: bootInfo.liveIds.filter((id) => /^(t1|t2|ta|pw)$/.test(id)),
    selects: bootInfo.liveIds.filter((id) => id === "sel"),
    checks: bootInfo.liveIds.filter((id) => id === "cb"),
  };

  // ── 驱动 ──
  const steps = generateSteps(options.seed, options.steps, liveIdSets);
  if (options.forceUnsupported) steps.push({ op: "removeComment" });
  const inputExpectations = [];
  const cdp = await page.createCDPSession();
  // change-on-blur 语义: 文本输入框失焦时若值已变则补发 change。期望模型精确编码该行为。
  let focused = null; // { liveId, v0, last }
  const readVal = (sel) => page.$eval(sel, (e) => String(e.value));
  const maskV = (v) => (options.maskInput ? MASK : v);
  const flushPendingBlurChange = () => {
    if (focused && focused.v0 !== focused.last) {
      inputExpectations.push({ liveId: focused.liveId, eventType: "change", value: maskV(focused.last), checked: null });
    }
    focused = null;
  };
  const focusText = async (sel, liveId) => {
    if (focused && focused.liveId === liveId) return;
    flushPendingBlurChange();
    await page.focus(sel);
    const v0 = await readVal(sel);
    focused = { liveId, v0, last: v0 };
  };

  for (let si = 0; si < steps.length; si += 1) {
    const step = steps[si];
    if (step.op === "type") {
      const sel = '[data-live-id="' + step.liveId + '"]';
      await focusText(sel, step.liveId);
      const text = "typed-" + si;
      for (const ch of text) {
        await page.keyboard.type(ch, { delay: 0 });
        const v = await readVal(sel);
        inputExpectations.push({ liveId: step.liveId, eventType: "input", value: maskV(v), checked: null });
        focused.last = v;
      }
      if (si % 3 === 0) {
        await page.keyboard.press("Backspace");
        const v = await readVal(sel);
        inputExpectations.push({ liveId: step.liveId, eventType: "input", value: maskV(v), checked: null });
        focused.last = v;
      }
    } else if (step.op === "paste") {
      const sel = '[data-live-id="' + step.liveId + '"]';
      await focusText(sel, step.liveId);
      await cdp.send("Input.insertText", { text: step.text });
      const v = await readVal(sel);
      inputExpectations.push({ liveId: step.liveId, eventType: "input", value: maskV(v), checked: null });
      focused.last = v;
    } else if (step.op === "select") {
      // page.select 直接赋值+派发 input/change, 不移动焦点 → 不产生 blur-change
      const sel = '[data-live-id="' + step.liveId + '"]';
      await page.select(sel, step.value);
      const v = await readVal(sel);
      inputExpectations.push({ liveId: step.liveId, eventType: "input", value: maskV(v), checked: null });
      inputExpectations.push({ liveId: step.liveId, eventType: "change", value: maskV(v), checked: null });
    } else if (step.op === "check") {
      flushPendingBlurChange();
      const sel = '[data-live-id="' + step.liveId + '"]';
      await page.click(sel);
      const state = await page.$eval(sel, (e) => ({ value: String(e.value), checked: e.checked }));
      inputExpectations.push({ liveId: step.liveId, eventType: "input", value: maskV(state.value), checked: state.checked });
      inputExpectations.push({ liveId: step.liveId, eventType: "change", value: maskV(state.value), checked: state.checked });
    } else {
      step.driverResult = await page.evaluate(liveDriveInPage, step);
    }
  }

  // ── 合帧沉降 ──
  await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
  await new Promise((r) => setTimeout(r, 250));

  // ── 真值提取 ──
  const truthInpage = canonInpage(await page.evaluate(() => window.__liveSerialize()));
  const snap = await cdp.send("DOMSnapshot.captureSnapshot", { computedStyles: [] });
  const truthSnap = snapTreeFromCdpSnapshot(snap);

  // ── 模型重放 + 对账 ──
  const model = new MirrorModel();
  for (const op of ops) {
    if (op.k === "input" || op.k === "__unsup") continue;
    model.apply(op);
  }
  const d1 = firstDivergence(model.canonical(model.root), truthInpage, "");
  const d2 = firstDivergence(truthInpage, truthSnap, "");

  // ── 输入回放对账 ──
  let inputMismatch = null;
  if (inputOps.length !== inputExpectations.length) {
    inputMismatch = "count recorded=" + inputOps.length + " expected=" + inputExpectations.length;
  } else {
    for (let i = 0; i < inputOps.length; i += 1) {
      const r = inputOps[i], e = inputExpectations[i];
      if (r.liveId !== e.liveId || r.eventType !== e.eventType || r.value !== e.value || (e.checked != null && r.checked !== e.checked)) {
        inputMismatch = "at " + i + ": recorded " + JSON.stringify({ liveId: r.liveId, eventType: r.eventType, value: r.value, checked: r.checked }) + " expected " + JSON.stringify(e);
        break;
      }
    }
  }

  // ── 汇总 ──
  const unsupportedRecs = ops.filter((o) => o.k === "__unsup");
  const nonBase = ops.filter((o) => o.k !== "base");
  const opKindCounts = {};
  for (const o of ops) opKindCounts[o.k] = (opKindCounts[o.k] || 0) + 1;

  // 严格: unsupported 非 0 即 FAIL。负控 (--force-unsupported) 期望恰好翻红,
  // 以证明 census → FAIL 通路有效; 翻红即负控通过, exit 0。
  verdict = !d1 && !d2 && !inputMismatch && unsupportedRecs.length === 0 ? "PASS" : "FAIL";
  const negativeControl = options.forceUnsupported
    ? { expected: "FAIL", observed: verdict, ok: verdict === "FAIL" && unsupportedRecs.length > 0 }
    : null;

  Object.assign(report, {
    schema: "html_csg.live_observe.report.v1",
    verdict,
    fixture: options.url,
    fixtureSha256: fixtureSha,
    scriptSha256: scriptSha,
    seed: options.seed,
    steps: steps.length,
    viewport: options.viewport,
    maskInput: options.maskInput,
    forceUnsupported: options.forceUnsupported,
    baselineNodes,
    opsTotal: ops.length,
    opKindCounts,
    unsupportedCount: unsupportedRecs.length,
    unsupportedSample: unsupportedRecs.slice(0, 5).map((u) => ({ kind: u.kind, detail: u.detail })),
    negativeControl,
    latency: {
      coalesceMs: percentiles(nonBase.map((o) => o.coalesceMs)),
      transportMs: percentiles(nonBase.map((o) => o.transportMs)),
    },
    verify: {
      modelVsInpageFull: d1 ? "FAIL: " + d1 : "PASS",
      inpageFullVsDomSnapshot: d2 ? "FAIL: " + d2 : "PASS",
      inputReplay: inputMismatch ? "FAIL: " + inputMismatch : "PASS",
      unsupportedCensus: unsupportedRecs.length === 0 ? "PASS" : "FAIL(strict, non-zero surfaces)",
    },
    nodeVersion: process.version,
  });

  writeFileSync(join(options.outDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(join(options.outDir, "live_scene.jsonl"), ops.map((o) => JSON.stringify(o)).join("\n") + "\n");
  writeFileSync(join(options.outDir, "inputs.jsonl"), inputOps.map((o) => JSON.stringify(o)).join("\n") + "\n");
  writeFileSync(join(options.outDir, "inputs_expected.json"), JSON.stringify(inputExpectations, null, 1) + "\n");
  writeFileSync(join(options.outDir, "steps.json"), JSON.stringify(steps, null, 2) + "\n");
  writeFileSync(join(options.outDir, "truth_inpage.json"), JSON.stringify(truthInpage, null, 1) + "\n");
  writeFileSync(join(options.outDir, "truth_snap.json"), JSON.stringify(truthSnap, null, 1) + "\n");

  if (negativeControl) {
    process.stdout.write("  negativeControl: expected=FAIL observed=" + negativeControl.observed + " unsupported=" + unsupportedRecs.length + " ok=" + negativeControl.ok + "\n");
    process.exitCode = negativeControl.ok ? 0 : 1;
  } else {
    process.exitCode = verdict === "PASS" ? 0 : 1;
  }
  process.stdout.write("live-observe verdict=" + verdict + " ops=" + ops.length + " baselineNodes=" + baselineNodes + " inputEvents=" + inputOps.length + "\n");
  process.stdout.write("  modelVsInpage=" + report.verify.modelVsInpageFull + "\n");
  process.stdout.write("  inpageVsDomSnapshot=" + report.verify.inpageFullVsDomSnapshot + "\n");
  process.stdout.write("  inputReplay=" + report.verify.inputReplay + "\n");
  process.stdout.write("  latency.coalesce=" + JSON.stringify(report.latency.coalesceMs) + "ms transport=" + JSON.stringify(report.latency.transportMs) + "ms\n");
  if (unsupportedRecs.length) process.stdout.write("  unsupported=" + unsupportedRecs.length + (options.forceUnsupported ? " (negative-control)" : "") + "\n");
} catch (err) {
  process.stderr.write("html-csg-live-observe: run failed: " + (err && err.stack || err) + "\n");
  process.exitCode = 1;
} finally {
  await browser.close();
}
