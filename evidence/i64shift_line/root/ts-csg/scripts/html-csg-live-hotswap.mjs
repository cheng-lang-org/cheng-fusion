#!/usr/bin/env node
/**
 * html-csg-live-hotswap.mjs — LIVE_MIRROR_CAMPAIGN 实时档: 毫秒级 1:1 镜像热换。
 *
 * 架构(与 CAMPAIGN 文档「实时档」一致):
 *   渲染器编译一次(页面无关, 仅视口相关; exe+provider 按源哈希缓存)。
 *   页面变更 = 页内 rAF 合帧 dirty 标记 → Node 轮询 → 页内 scene facts 快照
 *   (getBoundingClientRect + getComputedStyle 浏览器真值; 布局以
 *   position:absolute+top/left 直通 runtime 布局引擎回放) → CSD1 bin
 *   (buildSceneMobileDataAsset) → 原子换 bin+SWAP 请求 → 常驻渲染器重建重绘
 *   → ack。全程毫秒~百毫秒级, 不重编译。
 *
 * 诚实边界: 软光栅仅 FillRect/SetClip; 文本/图片/渐变在转换层计数跳过
 *   (skippedText/skippedImage), 绝不静默。z 序按文档序(不重建 stacking context)。
 *
 * 用法:
 *   node scripts/html-csg-live-hotswap.mjs --url <file-or-http> [--out-dir <dir>]
 *        [--viewport 1280x800] [--mutations 40] [--seed 7] [--headed]
 * 输出: <out-dir>/{live-hotswap.report.json, frames/f<v>.raw, facts-v<v>.json}
 *       exit 0|1
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");

function fail(message) {
  process.stderr.write("html-csg-live-hotswap: " + message + "\n");
  process.exit(1);
}

const options = (() => {
  const p = {
    url: "",
    outDir: "",
    viewport: "1280x800",
    mutations: 40,
    seed: 7,
    headed: false,
    compileTimeoutMs: 1800000,
    timeoutMs: 120000,
  };
  const args = process.argv.slice(2);
  const next = (i) => { i += 1; if (i >= args.length) fail("missing value for " + args[i - 1]); return args[i]; };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--url") { p.url = next(i); i += 1; }
    else if (a === "--out-dir") { p.outDir = resolve(next(i)); i += 1; }
    else if (a === "--viewport") { p.viewport = next(i); i += 1; }
    else if (a === "--mutations") { p.mutations = Number(next(i)); i += 1; }
    else if (a === "--seed") { p.seed = Number(next(i)); i += 1; }
    else if (a === "--headed") p.headed = true;
    else if (a === "--compile-timeout") { p.compileTimeoutMs = Number(next(i)); i += 1; }
    else if (a === "--timeout") { p.timeoutMs = Number(next(i)); i += 1; }
    else fail("unknown argument: " + a);
  }
  if (!p.url) fail("pass --url <file-or-http>");
  if (!p.outDir) p.outDir = join(packageDir, "tmp", "live-hotswap-live", "last-run");
  if (!/^\d+x\d+$/.test(p.viewport)) fail("--viewport must be WxH");
  return p;
})();

const [viewportWidth, viewportHeight] = options.viewport.split("x").map((v) => Number(v));
const FRAME_BYTES = viewportWidth * viewportHeight * 4;
const cheng = join(repoRoot, "artifacts", "backend_driver", "cheng");
for (const p of [cheng]) {
  if (!existsSync(p)) fail(`missing required artifact: ${p}`);
}
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function atomicWrite(path, buf) {
  const tmp = path + ".tmp";
  writeFileSync(tmp, buf);
  renameSync(tmp, path);
}

// ── 可复用渲染器缓存(页面无关): 键 = 热换运行时源哈希 ──
function rendererCachePaths(sourceHash) {
  const dir = join(packageDir, "tmp", "live-hotswap-renderer-cache", sourceHash);
  return { dir, exe: join(dir, "renderer"), dylib: join(dir, "renderer.dylib"), providers: join(dir, "providers") };
}

// 冷态极限: 渲染器页面无关, 作为预构建制品入树(消除首次编译); 键=视口+源哈希。
const LIVE_RENDERER_BUILD_REV = "r2-inproc";
function rendererArtifactPaths(viewport, sourceHash) {
  const dir = join(packageDir, "artifacts", "live-renderer", viewport, LIVE_RENDERER_BUILD_REV, sourceHash.slice(0, 8));
  return { dir, exe: join(dir, "renderer"), dylib: join(dir, "renderer.dylib"), providers: join(dir, "providers") };
}

function compileResidentRenderer(runtimeSourceText) {
  const sourceHash = sha256(Buffer.from(runtimeSourceText, "utf8"));
  const cache = rendererCachePaths(sourceHash);
  const artifact = rendererArtifactPaths(options.viewport, sourceHash);
  for (const pre of [artifact, cache]) {
    const hostBin = join(pre.dir, "live-host");
    if (existsSync(pre.dylib) && existsSync(hostBin)) {
      const providerObjs = readdirSync(pre.providers).filter((f) => f.endsWith(".o")).map((f) => join(pre.providers, f));
      if (providerObjs.length > 0) return { exePath: pre.exe, dylibPath: pre.dylib, hostBin, providerObjs, cached: true, fromArtifact: pre.dir === artifact.dir };
    }
    if (existsSync(pre.exe)) {
      const providerObjs = readdirSync(pre.providers).filter((f) => f.endsWith(".o")).map((f) => join(pre.providers, f));
      if (providerObjs.length > 0) return { exePath: pre.exe, providerObjs, cached: true, fromArtifact: pre.dir === artifact.dir };
    }
  }
  mkdirSync(cache.dir, { recursive: true });
  mkdirSync(cache.providers, { recursive: true });
  const work = join(cache.dir, "build");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const generatedDir = join(repoRoot, "src", ".tmp-exec", `live-hotswap-renderer-${process.pid}`);
  const sourcePath = join(generatedDir, "renderer.cheng");
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(sourcePath, runtimeSourceText);
  const objPath = join(work, "renderer.o");
  const hostC = join(scriptDir, "unimaker-digest-host.c");
  const hostO = join(work, "hotswap-host.o");
  const hostRenames = [
    "-Dcheng_malloc=hs_cheng_malloc",
    "-Dcheng_free=hs_cheng_free",
    "-Ddriver_c_new_string=hs_driver_c_new_string",
    "-Ddriver_c_new_string_copy_n=hs_driver_c_new_string_copy_n",
    "-Dcheng_mem_retain=hs_cheng_mem_retain",
    "-Dcheng_mem_release=hs_cheng_mem_release",
    "-Dcheng_f64_to_i32=hs_cheng_f64_to_i32",
  ];
  execFileSync("cc", ["-arch", "arm64", "-c", hostC, "-o", hostO, ...hostRenames], { timeout: 120000 });
  const compileEnv = {
    ...process.env,
    CHENG_HOTSWAP_SOURCE: "1",
    CHENG_PROCESS_MAX_RSS_BYTES: "8589934592",
    BACKEND_INCREMENTAL: "0",
    BACKEND_MULTI_MODULE_CACHE: "0",
    CHENG_DISABLE_PRIMARY_OBJECT_CACHE: "1",
  };
  try {
    execFileSync(cheng, [
      "system-link-exec", `--root:${repoRoot}`, `--in:${sourcePath}`,
      "--emit:obj", "--target:arm64-apple-darwin", `--out:${objPath}`,
      // in-process 入口导出(主 obj 的 @exportc 需显式 export-roots 才可被 ld 引用)
      "--export-roots:main,csg_hs_frame_once,csg_hs_poll_frame",
    ], { cwd: repoRoot, env: compileEnv, encoding: "utf8", timeout: options.compileTimeoutMs, maxBuffer: 64 * 1024 * 1024 });
    try {
      execFileSync(cheng, [
        "system-link-exec", `--root:${repoRoot}`, `--in:${sourcePath}`,
        "--emit:exe", "--link-providers", `--provider-objects:${hostO}`,
        "--target:arm64-apple-darwin", `--out:${join(work, "link-attempt")}`,
      ], { cwd: repoRoot, env: { ...compileEnv, CHENG_COLD_KEEP_PROVIDER_OBJECTS: "1" }, encoding: "utf8", timeout: options.compileTimeoutMs, maxBuffer: 64 * 1024 * 1024 });
    } catch {
      // 预期失败: 内部链接器不解析外部对象符号; 运行时 provider .o 已留盘。
    }
    const providerObjs = readdirSync(work).filter((f) => f.endsWith(".o") && f.includes(".provider")).map((f) => join(work, f));
    if (providerObjs.length === 0) fail("provider objects missing after keep-provider run");
    const frameworks = [
      "-framework", "VideoToolbox", "-framework", "CoreMedia", "-framework", "CoreVideo",
      "-framework", "CoreFoundation", "-framework", "Foundation", "-framework", "Metal",
      "-framework", "QuartzCore",
    ];
    execFileSync("cc", ["-arch", "arm64", "-o", cache.exe, objPath, hostO, ...providerObjs, ...frameworks], { timeout: 300000 });
    // in-process: 同一对象集链 dylib + 微型 dlopen 宿主
    execFileSync("cc", ["-arch", "arm64", "-dynamiclib", "-o", cache.dylib, objPath, hostO, ...providerObjs, ...frameworks], { timeout: 300000 });
    const hostSrc = join(scriptDir, "live-host.c");
    const hostBin = join(cache.dir, "live-host");
    execFileSync("cc", ["-arch", "arm64", "-O2", "-o", hostBin, hostSrc], { timeout: 60000 });
    for (const f of providerObjs) {
      copyFileSync(f, join(cache.providers, f.split("/").pop()));
    }
    // 制品化: 首次构建即入树, 后续冷态零编译
    mkdirSync(artifact.providers, { recursive: true });
    copyFileSync(cache.exe, artifact.exe);
    copyFileSync(cache.dylib, artifact.dylib);
    copyFileSync(hostBin, join(artifact.dir, "live-host"));
    for (const f of providerObjs) {
      copyFileSync(f, join(artifact.providers, f.split("/").pop()));
    }
    writeFileSync(join(artifact.dir, "receipt.json"), JSON.stringify({
      schema: "cheng.live_renderer.artifact.v1",
      viewport: options.viewport,
      runtimeSourceSha256: sourceHash,
      exeSha256: sha256(readFileSync(cache.exe)),
      builtAt: new Date().toISOString(),
    }, null, 2) + "\n");
    rmSync(work, { recursive: true, force: true });
    return { exePath: cache.exe, dylibPath: cache.dylib, hostBin, providerObjs, cached: false, fromArtifact: false };
  } finally {
    rmSync(generatedDir, { recursive: true, force: true });
  }
}

// ── 页内注入: 毫秒级 scene facts 快照(浏览器布局/样式真值回放) ──
const SNAPSHOT_FN = `
window.__csgSceneFactsSnapshot = () => {
  const SKIP_TAGS = new Set(["script", "style", "link", "meta", "title", "noscript", "template", "head", "base"]);
  const skipped = { text: 0, image: 0, gradient: 0, border: 0, unsupported: 0 };
  const facts = [];
  const rgbaToArgb = (css) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(css);
    if (!m) return undefined;
    const parts = m[1].split(",").map((s) => s.trim());
    if (parts.length < 3) return undefined;
    const r = Number(parts[0]), g = Number(parts[1]), b = Number(parts[2]);
    const a = parts[3] !== undefined ? Number(parts[3]) : 1;
    if (![r, g, b, a].every(Number.isFinite)) return undefined;
    const A = Math.round(a * 255);
    if (A === 0) return undefined;
    const hex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).toUpperCase().padStart(2, "0");
    return "0x" + hex(A) + hex(r) + hex(g) + hex(b);
  };
  const px = (v) => Math.round(v) + "px";
  let nextId = 2;
  const visit = (el, parentNodeId, ordinal) => {
    if (el.nodeType !== 1) { if (el.nodeType === 3 && el.nodeValue.trim().length > 0) skipped.text += 1; return null; }
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return null;
    const cs = getComputedStyle(el);
    if (cs.display === "none") { skipped.unsupported += 1; return null; }
    const rect = el.getBoundingClientRect();
    const nodeId = nextId++;
    const myStyles = [];
    const myPaints = [];
    myStyles.push({ propName: "position", propValue: "absolute", valueKind: "css" });
    myStyles.push({ propName: "top", propValue: px(rect.top), valueKind: "css" });
    myStyles.push({ propName: "left", propValue: px(rect.left), valueKind: "css" });
    myStyles.push({ propName: "width", propValue: px(rect.width), valueKind: "css" });
    myStyles.push({ propName: "height", propValue: px(rect.height), valueKind: "css" });
    myStyles.push({ propName: "z-index", propValue: String(nextId), valueKind: "css" });
    const fill = rgbaToArgb(cs.backgroundColor);
    if (fill !== undefined && cs.backgroundImage === "none") {
      myPaints.push({ opKind: "fill", color: fill, radius: 0, data: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 } });
    } else if (cs.backgroundImage !== "none") {
      skipped.gradient += 1;
    }
    const bw = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map((v) => parseFloat(v) || 0);
    if (bw.some((v) => v > 0)) skipped.border += 1;
    const opacity = Number(cs.opacity);
    const visible = opacity !== 0;
    if (!visible) myPaints.length = 0;
    const childElements = [];
    for (const ch of el.childNodes) {
      if (ch.nodeType === 3) { if (ch.nodeValue.trim().length > 0) skipped.text += 1; continue; }
      const before = facts.length;
      const res = visit(ch, nodeId, childElements.length);
      if (res !== null) childElements.push(res);
    }
    const nodeFact = {
      kind: "csg.web.scene.node",
      id: "csg.web.scene.node.0." + nodeId,
      routeId: "root", routeIndex: 0, nodeId,
      parentNodeId, ordinal,
      nodeKind: "element",
      childCount: childElements.length,
      propCount: 0, styleCount: 0,
      layoutCount: myStyles.length, paintCount: myPaints.length,
      layerId: 1, tagName: tag,
    };
    facts.push(nodeFact);
    let ordinal2 = 0;
    for (const s of myStyles) {
      facts.push({ kind: "csg.web.scene.layout", id: "csg.web.scene.layout.0." + nodeId + "." + ordinal2, routeId: "root", routeIndex: 0, nodeId, ordinal: ordinal2, propName: s.propName, propValue: s.propValue, valueKind: "css" });
      ordinal2 += 1;
    }
    let pOrdinal = 0;
    for (const p of myPaints) {
      facts.push({ kind: "csg.web.scene.paint", id: "csg.web.scene.paint.0." + nodeId + "." + pOrdinal, routeId: "root", routeIndex: 0, nodeId, ordinal: pOrdinal, opKind: p.opKind, color: p.color, radius: p.radius, data: p.data });
      pOrdinal += 1;
    }
    return nodeId;
  };
  const rootChildren = [];
  const bodyKids = [];
  for (const ch of document.body.childNodes) {
    if (ch.nodeType === 1) bodyKids.push(ch);
    else if (ch.nodeType === 3 && ch.nodeValue.trim().length > 0) skipped.text += 1;
  }
  // 根节点 nodeId=1(挂 body 的子树), body 自身背景并入根
  const bodyCs = getComputedStyle(document.body);
  const bodyRect = document.body.getBoundingClientRect();
  facts.push({ kind: "csg.web.scene.node", id: "csg.web.scene.node.0.1", routeId: "root", routeIndex: 0, nodeId: 1, parentNodeId: 0, ordinal: 0, nodeKind: "element", childCount: bodyKids.length, propCount: 0, styleCount: 6, layoutCount: 6, paintCount: rgbaToArgb(bodyCs.backgroundColor) ? 1 : 0, layerId: 1, tagName: "body" });
  const rootStyles = [
    ["position", "absolute"], ["top", px(bodyRect.top)], ["left", px(bodyRect.left)],
    ["width", px(bodyRect.width)], ["height", px(bodyRect.height)], ["z-index", "0"],
  ];
  let ro = 0;
  for (const [n, v] of rootStyles) facts.push({ kind: "csg.web.scene.layout", id: "csg.web.scene.layout.0.1." + ro, routeId: "root", routeIndex: 0, nodeId: 1, ordinal: ro, propName: n, propValue: v, valueKind: "css" }), ro++;
  const bodyFill = rgbaToArgb(bodyCs.backgroundColor);
  if (bodyFill) facts.push({ kind: "csg.web.scene.paint", id: "csg.web.scene.paint.0.1.0", routeId: "root", routeIndex: 0, nodeId: 1, ordinal: 0, opKind: "fill", color: bodyFill, radius: 0, data: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 } });
  let ord = 0;
  for (const ch of bodyKids) { visit(ch, 1, ord); ord += 1; }
  const count = (kind) => facts.filter((f) => f.kind === kind).length;
  const paintCount = count("csg.web.scene.paint");
  facts.unshift({ kind: "csg.web.scene.schema", id: "csg.web.scene.schema.v1", schema: "csg-web-scene", features: ["retained-route-graph", "precompiled-node-tree", "static-prop-table", "component-prop-table", "precompiled-style-table", "precompiled-layout-constraints", "precompiled-paint-ops", "resource-table", "route-edge-table", "route-hit-rect-table", "event-handler-table", "hit-target-table", "media-asset-table", "media-playback-slot-table", "media-control-action-table", "state-default-table", "css-utility-table"] });
  facts.splice(1, 0, { kind: "csg.web.scene.project", id: "csg.web.scene.project.default", runtimeTarget: "cheng-mobile-retained-gui", routeCount: 1, width: ${viewportWidth}, height: ${viewportHeight}, nodeCount: count("csg.web.scene.node"), propCount: 0, styleCount: 0, layoutCount: count("csg.web.scene.layout"), paintCount, resourceCount: 0, layerCount: 2, mediaAssetCount: 0, mediaPlaybackSlotCount: 0, mediaControlActionCount: 0 });
  facts.push({ kind: "csg.web.scene.route", id: "csg.web.scene.route.0", routeId: "root", routeIndex: 0, ordinal: 0, width: ${viewportWidth}, height: ${viewportHeight}, childCount: 1, layerCount: 2, root: ["csg.web.scene.node.0.1"] });
  facts.push({ kind: "csg.web.scene.layer", id: "csg.web.scene.layer.0.1", routeId: "root", routeIndex: 0, layerId: 1, name: "content", ordinal: 0 });
  facts.push({ kind: "csg.web.scene.layer", id: "csg.web.scene.layer.0.2", routeId: "root", routeIndex: 0, layerId: 2, name: "fixed", ordinal: 1 });
  return { facts, skipped, mutatedAt: window.__csgLastMutationPerf ?? 0, dirtyVersion: window.__csgSceneDirtyVersion ?? 0 };
};

window.__csgSceneDirtyVersion = 0;
window.__csgLastMutationPerf = 0;
(() => {
  // MutationObserver 回调按微任务批投递(同帧多 mutation 合并为一次回调), 直接置脏。
  const obs = new MutationObserver(() => {
    window.__csgLastMutationPerf = performance.now();
    window.__csgSceneDirtyVersion += 1;
  });
  obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
})();
`;

// ── 变异驱动器: 结构加/删/换色/移动交替(可复现; 页内自持 PRNG 状态, 可序列化) ──
const MUTATE_FN = (seed) => {
  window.__csgMutState = (window.__csgMutState ?? (seed >>> 0)) >>> 0;
  const rand = () => {
    window.__csgMutState = (Math.imul(window.__csgMutState, 1664525) + 1013904223) >>> 0;
    return window.__csgMutState / 4294967296;
  };
  const roll = rand();
  if (roll < 0.3) {
    const el = document.getElementById("__csgMutBox");
    if (el) el.style.backgroundColor = "rgb(" + Math.floor(rand() * 256) + "," + Math.floor(rand() * 256) + "," + Math.floor(rand() * 256) + ")";
    return "recolor";
  }
  if (roll < 0.55) {
    const el = document.getElementById("__csgMutBox");
    if (el) { el.style.left = Math.floor(rand() * 600) + "px"; el.style.top = Math.floor(rand() * 500) + "px"; }
    return "move";
  }
  if (roll < 0.8) {
    if (!document.getElementById("__csgMutExtra")) {
      const d = document.createElement("div");
      d.id = "__csgMutExtra";
      d.style.cssText = "position:fixed;left:20px;top:20px;width:120px;height:90px;background-color:rgb(204,102,51);z-index:99";
      document.body.appendChild(d);
      return "add";
    }
    return "noop-add-exists";
  }
  const extra = document.getElementById("__csgMutExtra");
  if (extra) { extra.remove(); return "remove"; }
  return "noop-remove-missing";
};

class RendererProcess {
  constructor({ exe, args, dylib, ackPath, env }) {
    this.exe = exe;
    this.args = args;
    this.dylib = dylib;
    this.ackPath = ackPath;
    this.env = env;
    this.child = null;
    this.stderrText = "";
    this.exitCode = null;
  }
  start() {
    this.child = spawn(this.exe, this.args ?? [], { stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, ...this.env, CHENG_HS_DYLIB: this.dylib } });
    this.child.stderr.on("data", (chunk) => { this.stderrText += chunk.toString("utf8"); });
    this.child.on("exit", (code) => { this.exitCode = code; });
  }
  async waitFrame(version, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (existsSync(this.ackPath)) {
        const ack = readFileSync(this.ackPath, "utf8").trim();
        if (ack === String(version)) return;
      }
      if (this.exitCode != null) fail(`renderer exited early code=${this.exitCode} stderr=${this.stderrText.slice(-600)}`);
      if (Date.now() > deadline) fail(`timeout waiting ack ${version}; stderr=${this.stderrText.slice(-400)}`);
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  // 换班回收: 宿主按 CHENG_HS_RECYCLE_SWAPS 定期退出(7), 此处重拉宿主后继续等
  // 同一版本的 ack(重拉后 frame_once 按当前请求文件重建, ack 即为当前版本)。
  async waitFrameRecycling(version, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (this.exitCode === 7 && (this.recycleCount ?? 0) < 64) {
        this.recycleCount = (this.recycleCount ?? 0) + 1;
        this.exitCode = null;
        this.start();
      }
      if (existsSync(this.ackPath)) {
        const ack = readFileSync(this.ackPath, "utf8").trim();
        if (ack === String(version)) return;
      }
      if (this.exitCode != null && this.exitCode !== 7) {
        fail(`renderer exited early code=${this.exitCode} stderr=${this.stderrText.slice(-600)}`);
      }
      if (Date.now() > deadline) {
        fail(`timeout waiting ack ${version}; stderr=${this.stderrText.slice(-400)}`);
      }
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  async waitExit(timeoutMs, version, rewriteLoad, rewriteQuit) {
    const ackOk = () => {
      if (!existsSync(this.ackPath)) return false;
      return readFileSync(this.ackPath, "utf8").trim() === String(version);
    };
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (this.exitCode === 7 && (this.recycleCount ?? 0) < 64) {
        // 换班与退出请求竞争: 重拉宿主先以非 quit 请求重建当前帧, 再发退出
        this.recycleCount = (this.recycleCount ?? 0) + 1;
        this.exitCode = null;
        if (rewriteLoad) rewriteLoad();
        this.start();
        const dl = Date.now() + timeoutMs;
        while (!ackOk() && Date.now() < dl) await new Promise((r) => setTimeout(r, 10));
        if (rewriteQuit) rewriteQuit();
      }
      if (this.exitCode === 0) return;
      if (this.exitCode != null && this.exitCode !== 7) {
        fail(`renderer exit code ${this.exitCode}; stderr=${this.stderrText.slice(-600)}`);
      }
      if (Date.now() > deadline) fail("timeout waiting renderer exit");
      await new Promise((r) => setTimeout(r, 15));
    }
  }
  rssKb() {
    return Number(execFileSync("ps", ["-o", "rss=", "-p", String(this.child.pid)], { encoding: "utf8" }).trim());
  }
}

async function main() {
  const processT0 = Date.now();
  rmSync(options.outDir, { recursive: true, force: true });
  mkdirSync(options.outDir, { recursive: true });
  const framesDir = join(options.outDir, "frames");
  mkdirSync(framesDir, { recursive: true });
  const report = {
    schema: "html_csg.live_hotswap.report.v1",
    verdict: "FAIL",
    url: options.url,
    viewport: options.viewport,
    mutations: options.mutations,
  };

  const binPath = join(options.outDir, "scene_data.bin");
  const requestPath = join(options.outDir, "scene_swap_request.bin");
  const framePath = join(options.outDir, "frame.raw");
  const ackPath = join(options.outDir, "frame_ack.txt");

  // 1. 页面无关常驻渲染器(编译一次, 按源哈希缓存)
  const { emitSceneMobileRuntimeSource, emitSceneHotswapMainSource, buildSceneMobileDataAsset } =
    await import(pathToFileURL(join(scriptDir, "scene-runtime-smoke-source.mjs")).href);
  const minimalFacts = [
    { kind: "csg.web.scene.schema", id: "csg.web.scene.schema.v1", schema: "csg-web-scene", features: ["retained-route-graph", "precompiled-node-tree", "static-prop-table", "component-prop-table", "precompiled-style-table", "precompiled-layout-constraints", "precompiled-paint-ops", "resource-table", "route-edge-table", "route-hit-rect-table", "event-handler-table", "hit-target-table", "media-asset-table", "media-playback-slot-table", "media-control-action-table", "state-default-table", "css-utility-table"] },
    { kind: "csg.web.scene.project", id: "csg.web.scene.project.default", runtimeTarget: "cheng-mobile-retained-gui", routeCount: 1, width: viewportWidth, height: viewportHeight, nodeCount: 1, propCount: 0, styleCount: 0, layoutCount: 0, paintCount: 1, resourceCount: 0, layerCount: 2, mediaAssetCount: 0, mediaPlaybackSlotCount: 0, mediaControlActionCount: 0 },
    { kind: "csg.web.scene.route", id: "csg.web.scene.route.0", routeId: "root", routeIndex: 0, ordinal: 0, width: viewportWidth, height: viewportHeight, childCount: 1, layerCount: 2, root: ["csg.web.scene.node.0.1"] },
    { kind: "csg.web.scene.layer", id: "csg.web.scene.layer.0.1", routeId: "root", routeIndex: 0, layerId: 1, name: "content", ordinal: 0 },
    { kind: "csg.web.scene.layer", id: "csg.web.scene.layer.0.2", routeId: "root", routeIndex: 0, layerId: 2, name: "fixed", ordinal: 1 },
    { kind: "csg.web.scene.node", id: "csg.web.scene.node.0.1", routeId: "root", routeIndex: 0, nodeId: 1, parentNodeId: 0, ordinal: 0, nodeKind: "element", childCount: 0, propCount: 0, styleCount: 0, layoutCount: 0, paintCount: 1, layerId: 1, tagName: "body" },
    { kind: "csg.web.scene.paint", id: "csg.web.scene.paint.0.1.0", routeId: "root", routeIndex: 0, nodeId: 1, ordinal: 0, opKind: "fill", color: "0xFF101418", radius: 0, data: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 } },
  ];
  const runtimeSource = emitSceneMobileRuntimeSource(minimalFacts, {
    sceneDataAsset: { byteCount: 16, crc32: 1, counts: { routes: 1, layers: 2, nodes: 1, props: 0, styles: 0, layouts: 0, paints: 1, resources: 0, eventHandlers: 0, hitTargets: 0, routeEdges: 0, routeHitRects: 0, mediaAssets: 0, mediaPlaybackSlots: 0, mediaControlActions: 0, stateDefaults: 0, cssUtilities: 0, cssVariantRules: 0, textLiterals: 0, imageAssets: 0 } },
    hotSwap: true,
    viewport: options.viewport,
    initialRoute: "root",
    swapRequestPath: requestPath,
    binPath,
    frameDumpPath: framePath,
    frameAckPath: ackPath,
  });
  const fullSource = runtimeSource + "\n" + emitSceneHotswapMainSource({ viewport: options.viewport }) + "\n";
  process.stdout.write("[1/4] resident renderer (compile-once, cached by source hash)\n");
  const compileT0 = Date.now();
  const { exePath, dylibPath, hostBin, cached, fromArtifact } = compileResidentRenderer(fullSource);
  report.rendererExeSha256 = sha256(readFileSync(exePath));
  report.rendererCached = cached;
  report.rendererFromArtifact = fromArtifact;
  report.rendererCompileMs = Date.now() - compileT0;
  process.stdout.write(`      exe=${exePath} cached=${cached}\n`);

  // 2. 附着页面
  process.stdout.write("[2/4] attach page + inject snapshot\n");
  const puppeteer = (await import("puppeteer")).default;
  let chromeExecutablePath;
  for (const p of [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ]) { try { accessSync(p); chromeExecutablePath = p; break; } catch {} }
  const launchArgs = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"];
  if (!options.headed) launchArgs.push("--disable-gpu");
  const browser = await puppeteer.launch({
    headless: !options.headed,
    executablePath: chromeExecutablePath,
    defaultViewport: { width: viewportWidth, height: viewportHeight },
    args: launchArgs,
  });
  const page = await browser.newPage();
  const navigateUrl = /^https?:/.test(options.url)
    ? options.url
    : pathToFileURL(resolve(options.url)).href;
  const attachT0 = Date.now();
  await page.goto(navigateUrl, { waitUntil: "networkidle2", timeout: options.timeoutMs });
  await page.evaluate(SNAPSHOT_FN);
  report.attachMs = Date.now() - attachT0;

  const crc32Bytes = (buf) => {
    if (!crc32Bytes.table) {
      const table = new Int32Array(256);
      for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c; }
      crc32Bytes.table = table;
    }
    let crc = -1;
    for (let i = 0; i < buf.length; i += 1) crc = (crc >>> 8) ^ crc32Bytes.table[(crc ^ buf[i]) & 0xff];
    return (crc ^ -1) >>> 0;
  };

  const snapAndBin = async (version) => {
    const snapT0 = Date.now();
    const snap = await page.evaluate(() => window.__csgSceneFactsSnapshot());
    const snapshotMs = Date.now() - snapT0;
    const binT0 = Date.now();
    const asset = buildSceneMobileDataAsset(snap.facts, []);
    const buffer = Buffer.from(asset.buffer);
    const binMs = Date.now() - binT0;
    if (version === 1) { report.snapshotMs = snapshotMs; report.binMs = binMs; }
    writeFileSync(join(options.outDir, `facts-v${version}.json`), JSON.stringify(snap.facts));
    return { facts: snap.facts, skipped: snap.skipped, mutatedAt: snap.mutatedAt, bin: buffer, byteCount: buffer.length, crc32: crc32Bytes(buffer), counts: asset.counts };
  };

  const perfEpochOffset = await page.evaluate(() => Date.now() - performance.now());

  // 变异靶箱(入基线 v1)
  await page.evaluate(() => {
    const box = document.createElement("div");
    box.id = "__csgMutBox";
    box.style.cssText = "position:fixed;left:700px;top:300px;width:220px;height:140px;background-color:rgb(51,102,204);z-index:98";
    document.body.appendChild(box);
  });

  // 3. 初始帧: facts v1 → bin → 冷启动常驻进程
  process.stdout.write("[3/4] initial frame\n");
  let version = 1;
  const initial = await snapAndBin(1);
  report.skipped = initial.skipped;
  atomicWrite(binPath, initial.bin);
  atomicWrite(requestPath, Buffer.from(`SWAP 1 ${initial.byteCount} 0\n`));
  rmSync(ackPath, { force: true });
  const hsEnv = {
    CHENG_DIGEST_SCENE_DATA: binPath,
    CHENG_HS_SWAP_REQUEST: requestPath,
    CHENG_HS_FRAME: framePath,
    CHENG_HS_ACK: ackPath,
    // 换班回收: Cheng 运行时重建路径残留按节点比例留存(修复后仍 ~0.3MB/换),
    // 定期换宿主使 RSS 有界锯齿(重拉后 frame_once 从当前 bin 重建, 状态无损)。
    CHENG_HS_RECYCLE_SWAPS: '25',
  };
  const firstFrameT0 = Date.now();
  const useHost = existsSync(hostBin);
  const resident = new RendererProcess({ exe: useHost ? hostBin : exePath, args: [], dylib: dylibPath, ackPath, env: hsEnv });
  resident.start();
  await resident.waitFrame(1, 30000);
  report.coldFirstFrameMs = Date.now() - firstFrameT0;
  report.coldFirstPixelMs = Date.now() - processT0;
  let lastBinSha = sha256(initial.bin);
  writeFileSync(join(framesDir, "f1.raw"), readFileSync(framePath));

  // 4. 实时循环: 变异 → 脏标记 → 快照 → bin → 热换 → ack(毫秒延迟打点)
  process.stdout.write(`[4/4] live loop: ${options.mutations} mutations\n`);
  const latencies = [];
  const rssSamples = [resident.rssKb()];
  const swapLog = [];
  for (let i = 0; i < options.mutations; i += 1) {
    const dirty0 = await page.evaluate(() => window.__csgSceneDirtyVersion);
    const kind = await page.evaluate(MUTATE_FN, options.seed);
    version += 1;
    // 轮询脏标记(MutationObserver 微任务批投递); noop 步无 DOM 变更, 跳过等待。
    let dirty = dirty0;
    const t0 = Date.now();
    if (!kind.startsWith("noop")) {
      for (;;) {
        dirty = await page.evaluate(() => window.__csgSceneDirtyVersion);
        if (dirty !== dirty0 || Date.now() - t0 > 1000) break;
        await new Promise((r) => setTimeout(r, 5));
      }
    }
    const snap = await snapAndBin(version);
    const binSha = sha256(snap.bin);
    let swapped = false;
    if (binSha !== lastBinSha) {
      atomicWrite(binPath, snap.bin);
      atomicWrite(requestPath, Buffer.from(`SWAP ${version} ${snap.byteCount} 0\n`));
      await resident.waitFrameRecycling(version, 30000);
      lastBinSha = binSha;
      swapped = true;
      writeFileSync(join(framesDir, `f${version}.raw`), readFileSync(framePath));
    } else {
      // facts 无像素级变化(如移除后又加回同帧): 版本推进但不换 bin
      atomicWrite(requestPath, Buffer.from(`SWAP ${version} ${snap.byteCount} 0\n`));
      await resident.waitFrameRecycling(version, 30000);
    }
    const latency = Date.now() - t0;
    latencies.push(latency);
    rssSamples.push(resident.rssKb());
    swapLog.push({ step: i + 1, kind, swapped, latencyMs: latency, binSha });
    if (readFileSync(framePath).length !== FRAME_BYTES) fail(`frame ${version} size wrong`);
  }

  // 5. parity: 末态 facts 冷启动全新进程渲染 == 常驻进程末帧(字节)
  version += 1;
  const finalSnap = await snapAndBin(version);
  atomicWrite(binPath, finalSnap.bin);
  atomicWrite(requestPath, Buffer.from(`SWAP ${version} ${finalSnap.byteCount} 0\n`));
  await resident.waitFrameRecycling(version, 30000);
  const liveFrame = readFileSync(framePath);
  const residentLoad = () => atomicWrite(requestPath, Buffer.from(`SWAP ${version} ${finalSnap.byteCount} 0\n`));
  const residentQuit = () => atomicWrite(requestPath, Buffer.from(`SWAP ${version} ${finalSnap.byteCount} 1\n`));
  residentQuit();
  await resident.waitExit(30000, version, residentLoad, residentQuit);
  rmSync(ackPath, { force: true });
  atomicWrite(requestPath, Buffer.from(`SWAP ${version} ${finalSnap.byteCount} 0\n`));
  const cold = new RendererProcess({ exe: useHost ? hostBin : exePath, args: useHost ? ["--once"] : [], dylib: dylibPath, ackPath, env: hsEnv });
  cold.start();
  await cold.waitFrame(version, 30000);
  const coldFrame = readFileSync(framePath);
  writeFileSync(join(framesDir, `f${version}.raw`), liveFrame);
  writeFileSync(join(framesDir, `cold-final.raw`), coldFrame);
  const coldLoad = () => atomicWrite(requestPath, Buffer.from(`SWAP ${version} ${finalSnap.byteCount} 0\n`));
  const coldQuit = () => atomicWrite(requestPath, Buffer.from(`SWAP ${version} ${finalSnap.byteCount} 1\n`));
  coldQuit();
  await cold.waitExit(30000, version, coldLoad, coldQuit);

  const parity = liveFrame.equals(coldFrame);
  const sorted = [...latencies].sort((a, b) => a - b);
  const rssFirst = rssSamples[0];
  const rssLast = rssSamples[rssSamples.length - 1];
  const rssMax = Math.max(...rssSamples);
  Object.assign(report, {
    swaps: swapLog.length,
    binChangedSwaps: swapLog.filter((s) => s.swapped).length,
    latencyMs: {
      p50: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
      max: sorted[sorted.length - 1],
      samples: latencies,
    },
    rss: { firstKb: rssFirst, lastKb: rssLast, driftKb: rssLast - rssFirst, maxDriftKb: rssMax - rssFirst },
    parityColdFinal: parity,
    frames: framesDir,
    rendererExitCode: resident.exitCode,
  });
  report.recycleCount = resident.recycleCount ?? 0;
  // 判定口径(与 CAMPAIGN 文档一致): parity + RSS 有界 + 干净退出。
  // 延迟入报告不拦截——swap+重绘核 25-40ms, 大页全链由页内快照主导(已定标注脚)。
  const verdict =
    parity &&
    rssLast - rssFirst <= 16384 &&
    resident.exitCode === 0;
  report.verdict = verdict ? "PASS" : "FAIL";
  writeFileSync(join(options.outDir, "live-hotswap.report.json"), JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(`live-hotswap verdict=${report.verdict} swaps=${swapLog.length} latency p50=${report.latencyMs.p50}ms p95=${report.latencyMs.p95}ms max=${report.latencyMs.max}ms rssDrift=${report.rss.driftKb}KiB parity=${parity}\n`);
  process.stdout.write(`skipped(coverage): text=${initial.skipped.text} image/gradient=${initial.skipped.image + initial.skipped.gradient} unsupported=${initial.skipped.unsupported}\n`);
  process.stdout.write("report: " + join(options.outDir, "live-hotswap.report.json") + "\n");
  await browser.close();
  process.exitCode = verdict ? 0 : 1;
}

await main();
