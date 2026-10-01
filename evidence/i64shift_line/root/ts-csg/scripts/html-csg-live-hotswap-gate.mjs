#!/usr/bin/env node
/**
 * html-csg-live-hotswap-gate.mjs — LIVE_MIRROR_CAMPAIGN P1 正式门禁。
 *
 * 常驻渲染器 = emitSceneMobileRuntimeSource(sceneDataAsset 模式 + hotSwap 变体)编译一次的
 * 原生 exe: 场景图完全来自外部 CSD1 bin(routes/layers/nodes/layouts/paints 数据段),
 * 热换 = 驱动原子改写 bin + 换装请求(magic/version/byteCount/crc32/flags), 运行时
 * reset_runtime_state + build 重入, 场景图从新 bin 重建后重新合成帧。
 * 场景事实为门禁直构的封闭子集(textless 纯 fill-rect 场景); 提取链由 P0/live:gate 与
 * 既有 materializer smoke 覆盖, 本门禁专责运行时热换正确性。
 *
 * 门禁判定:
 *   1. 热换后像素 == 冷启动基线(同一 exe 全新进程渲染同一版本 bin, 原始 RGBA 字节精确
 *      相等), v1/v2/v3 逐版本全等 — 「热换后 pixel-parity 不低于冷启动基线」。
 *   2. 版本间可见变化: v1/v2/v3 帧两两不同(颜色/结构变异真实生效)。
 *   3. 连续 --swaps 次热换(结构加/删交替) parity 恒等 + RSS 漂移有界。
 *   4. 不支持形状硬失败: 宿主光栅只接受 FillRect/SetClip, 其他 kind 进程即错。
 *
 * 用法: node scripts/html-csg-live-hotswap-gate.mjs [--out-dir <dir>] [--swaps 30]
 * 输出: <out-dir>/live-hotswap-gate.report.json, exit 0|1
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");

function fail(message) {
  process.stderr.write("html-csg-live-hotswap-gate: " + message + "\n");
  process.exit(1);
}

const options = (() => {
  const p = {
    outDir: join(packageDir, "tmp", "live-hotswap-gate", "last-run"),
    swaps: 30,
    compileTimeoutMs: 900000,
    // 默认官方 driver; 烤新 driver 验证期用 CHENG_HOTSWAP_DRIVER 覆盖(如 frontier probe.exe)。
    driver: process.env.CHENG_HOTSWAP_DRIVER || "",
  };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--out-dir") { p.outDir = resolve(args[i + 1]); i += 1; }
    else if (args[i] === "--swaps") { p.swaps = Number(args[i + 1]); i += 1; }
    else if (args[i] === "--compile-timeout") { p.compileTimeoutMs = Number(args[i + 1]); i += 1; }
    else if (args[i] === "--driver") { p.driver = resolve(args[i + 1]); i += 1; }
    else fail("unknown argument: " + args[i]);
  }
  if (!Number.isInteger(p.swaps) || p.swaps < 1) fail("--swaps must be a positive integer");
  if (!p.driver) p.driver = join(repoRoot, "artifacts", "backend_driver", "cheng");
  return p;
})();

const cheng = options.driver;
for (const p of [cheng]) {
  if (!existsSync(p)) fail(`missing required artifact: ${p}`);
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const VIEWPORT = { width: 390, height: 844 };
const FRAME_BYTES = VIEWPORT.width * VIEWPORT.height * 4;

function crc32Bytes(buf) {
  if (!crc32Bytes.table) {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    crc32Bytes.table = table;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) crc = (crc >>> 8) ^ crc32Bytes.table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function atomicWrite(path, buf) {
  const tmp = path + ".tmp";
  writeFileSync(tmp, buf);
  renameSync(tmp, path);
}

// ── 场景事实构造(textless 纯 fill-rect 封闭子集, schema 与 scene builder/loader 对齐) ──
function buildSceneFactsVariant({ fills }) {
  // fills: [{nodeId, color "0xRRGGBBAA", width, height}]
  const facts = [];
  const routeIndex = 0;
  facts.push({ kind: "csg.web.scene.route", id: "route.0", routeIndex, routeId: "home_default" });
  facts.push({ kind: "csg.web.scene.layer", id: "layer.0", routeIndex, layerId: 1, name: "main", ordinal: 0 });
  facts.push({
    kind: "csg.web.scene.node", id: "node.1", routeIndex, nodeId: 1, parentNodeId: 0,
    nodeKind: "element", tagName: "div", text: "", layerId: 1,
    conditionalStateRef: "", conditionalStateValue: "", textStateRef: "",
  });
  facts.push({
    kind: "csg.web.scene.layout", id: "layout.1.w", routeIndex, nodeId: 1, ordinal: 0,
    propName: "width", propValue: `${VIEWPORT.width}px`,
  });
  facts.push({
    kind: "csg.web.scene.layout", id: "layout.1.h", routeIndex, nodeId: 1, ordinal: 1,
    propName: "height", propValue: `${VIEWPORT.height}px`,
  });
  facts.push({
    kind: "csg.web.scene.paint", id: "paint.1", routeIndex, nodeId: 1, ordinal: 0,
    opKind: "fill", color: "0xFF101418",
  });
  for (const [i, fill] of fills.entries()) {
    const nodeId = fill.nodeId;
    facts.push({
      kind: "csg.web.scene.node", id: `node.${nodeId}`, routeIndex, nodeId, parentNodeId: 1,
      nodeKind: "element", tagName: "div", text: "", layerId: 1,
      conditionalStateRef: "", conditionalStateValue: "", textStateRef: "",
    });
    facts.push({
      kind: "csg.web.scene.layout", id: `layout.${nodeId}.w`, routeIndex, nodeId, ordinal: 0,
      propName: "width", propValue: `${fill.width}px`,
    });
    facts.push({
      kind: "csg.web.scene.layout", id: `layout.${nodeId}.h`, routeIndex, nodeId, ordinal: 1,
      propName: "height", propValue: `${fill.height}px`,
    });
    facts.push({
      kind: "csg.web.scene.paint", id: `paint.${nodeId}`, routeIndex, nodeId, ordinal: 0,
      opKind: "fill", color: fill.color,
    });
    void i;
  }
  return facts;
}

function cloneNodeFacts(facts, { sourceNodeId, newNodeId }) {
  const nodeBacked = new Set(["csg.web.scene.prop", "csg.web.scene.layout", "csg.web.scene.paint"]);
  const out = [];
  for (const fact of facts) {
    const isNode = fact.kind === "csg.web.scene.node";
    if ((isNode || nodeBacked.has(fact.kind)) && Number(fact.nodeId) === sourceNodeId) {
      const clone = { ...fact, nodeId: newNodeId };
      if (typeof clone.id === "string") clone.id = `${clone.id}.hs${newNodeId}`;
      out.push(clone);
    }
  }
  return out;
}

function recolorNode(facts, nodeId, color) {
  return facts.map((fact) => {
    if (fact.kind === "csg.web.scene.paint" && Number(fact.nodeId) === nodeId && fact.opKind === "fill") {
      return { ...fact, color };
    }
    return fact;
  });
}

function dropNodeFacts(facts, nodeId) {
  const nodeBacked = new Set(["csg.web.scene.prop", "csg.web.scene.layout", "csg.web.scene.paint"]);
  return facts.filter((fact) => {
    if (fact.kind === "csg.web.scene.node") return Number(fact.nodeId) !== nodeId;
    if (nodeBacked.has(fact.kind)) return Number(fact.nodeId) !== nodeId;
    return true;
  });
}

// ── 渲染器进程驱动 ──
class RendererProcess {
  constructor({ exe, ackPath }) {
    this.exe = exe;
    this.ackPath = ackPath;
    this.child = null;
    this.stderrText = "";
    this.exitCode = null;
  }
  start(childEnv) {
    this.child = spawn(this.exe, [], {
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, ...childEnv },
    });
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
      if (Date.now() > deadline) fail(`timeout waiting frame ack ${version}; stderr=${this.stderrText.slice(-400)}`);
      await new Promise((r) => setTimeout(r, 15));
    }
  }
  async waitExit(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (this.exitCode == null) {
      if (Date.now() > deadline) fail("timeout waiting renderer exit");
      await new Promise((r) => setTimeout(r, 25));
    }
    if (this.exitCode !== 0) fail(`renderer exit code ${this.exitCode}; stderr=${this.stderrText.slice(-600)}`);
  }
  rssKb() {
    return Number(execFileSync("ps", ["-o", "rss=", "-p", String(this.child.pid)], { encoding: "utf8" }).trim());
  }
}

async function main() {
  rmSync(options.outDir, { recursive: true, force: true });
  mkdirSync(options.outDir, { recursive: true });
  const report = { schema: "html_csg.hotswap_gate.report.v1", verdict: "FAIL", viewport: VIEWPORT, swaps: options.swaps };

  // 1. 场景事实变体: v2 = 克隆节点(结构加) + 换色; v3 = 删克隆(结构删) + 再换色
  const v1 = buildSceneFactsVariant({
    fills: [
      { nodeId: 2, color: "0xFF3366CC", width: 390, height: 120 },
      { nodeId: 3, color: "0xFF33CC66", width: 390, height: 240 },
      { nodeId: 4, color: "0xFFCC3333", width: 390, height: 180 },
    ],
  });
  const clonedId = 9;
  const v2 = recolorNode(
    [...v1, ...cloneNodeFacts(v1, { sourceNodeId: 2, newNodeId: clonedId })],
    2, "0xFFCCE066",
  );
  const v3 = dropNodeFacts(
    recolorNode(v2, 3, "0xFF6633CC"),
    clonedId,
  );
  report.variants = {
    v2: `recolor node 2 + clone node 2 as ${clonedId} (structural add)`,
    v3: `recolor node 3 + drop clone ${clonedId} (structural remove)`,
  };

  // 2. bins + 运行时源
  const { emitSceneMobileRuntimeSource, emitSceneHotswapMainSource, buildSceneMobileDataAsset } =
    await import(pathToFileURL(join(scriptDir, "scene-runtime-smoke-source.mjs")).href);
  const variants = { 1: v1, 2: v2, 3: v3 };
  const bins = {};
  for (const [version, variantFacts] of Object.entries(variants)) {
    const asset = buildSceneMobileDataAsset(variantFacts, []);
    bins[version] = {
      buffer: asset.buffer,
      byteCount: asset.buffer.length,
      crc32: crc32Bytes(asset.buffer),
      counts: asset.counts,
    };
  }

  const binPath = join(options.outDir, "scene_data.bin");
  const requestPath = join(options.outDir, "scene_swap_request.bin");
  const framePath = join(options.outDir, "frame.raw");
  const ackPath = join(options.outDir, "frame_ack.txt");
  // 生成源: cold snapshot 要求 --in 位于 <root>/src/ 之下; 沿用仓库 src/.tmp-exec/<task>/
  // 生成约定, finally 清理。绝对路径传入。
  const generatedDir = join(repoRoot, "src", ".tmp-exec", `live-hotswap-gate-${process.pid}`);
  const runtimeSourcePath = join(generatedDir, "scene-runtime-hotswap.cheng");
  const runtimeSource = emitSceneMobileRuntimeSource(v1, {
    sceneDataAsset: { byteCount: bins[1].byteCount, crc32: bins[1].crc32, counts: bins[1].counts },
    hotSwap: true,
    viewport: `${VIEWPORT.width}x${VIEWPORT.height}`,
    initialRoute: "home_default",
    swapRequestPath: requestPath,
    binPath: binPath,
    frameDumpPath: framePath,
    frameAckPath: ackPath,
  });
  mkdirSync(generatedDir, { recursive: true });
  const fullSource = runtimeSource + "\n" + emitSceneHotswapMainSource({ viewport: `${VIEWPORT.width}x${VIEWPORT.height}` }) + "\n";
  writeFileSync(runtimeSourcePath, fullSource);
  writeFileSync(join(options.outDir, "scene-runtime-hotswap.cheng"), fullSource);

  // 3. 编译一次(常驻渲染器)。配方 v3(实证可行):
  //    a. cc -c C 宿主(-D 重命名 7 个与 provider 重复的桥定义);
  //    b. --emit:obj 编主对象(importc-only 设计, FunctionContractAdmission 全过);
  //    c. --emit:exe --link-providers --provider-objects:host.o +
  //       CHENG_COLD_KEEP_PROVIDER_OBJECTS=1: driver 编出运行时 provider .o 并
  //       留盘(链接本身预期失败 — 内部链接器不消费外部对象符号);
  //    d. cc 手动总装: 主 obj + host.o + provider .o + 框架。
  const exePath = join(options.outDir, "scene_hotswap_renderer");
  const compileReport = join(options.outDir, "scene-runtime-hotswap.compile-report.txt");
  const objPath = join(options.outDir, "scene-runtime-hotswap.o");
  const hostC = join(scriptDir, "unimaker-digest-host.c");
  const hostO = join(options.outDir, "hotswap-host.o");
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
    // P1: hotSwap 生成源对移动宿主契约名同名覆盖定义放行
    // (cheng_cold.c FunctionContractAdmission exact-identity 豁免; 官方 driver
    // 无此改动时为无害 no-op — 本配方走 importc-only 设计, 不触发准入)。
    CHENG_HOTSWAP_SOURCE: "1",
    CHENG_PROCESS_MAX_RSS_BYTES: "8589934592",
    BACKEND_INCREMENTAL: "0",
    BACKEND_MULTI_MODULE_CACHE: "0",
    CHENG_DISABLE_PRIMARY_OBJECT_CACHE: "1",
  };
  try {
    execFileSync(cheng, [
      "system-link-exec",
      `--root:${repoRoot}`,
      `--in:${runtimeSourcePath}`,
      "--emit:obj",
      "--target:arm64-apple-darwin",
      `--out:${objPath}`,
      `--report-out:${compileReport}`,
    ], {
      cwd: repoRoot,
      env: compileEnv,
      encoding: "utf8",
      timeout: options.compileTimeoutMs,
      maxBuffer: 64 * 1024 * 1024,
    });
    const provDir = join(options.outDir, "providers");
    mkdirSync(provDir, { recursive: true });
    try {
      execFileSync(cheng, [
        "system-link-exec",
        `--root:${repoRoot}`,
        `--in:${runtimeSourcePath}`,
        "--emit:exe",
        "--link-providers",
        `--provider-objects:${hostO}`,
        "--target:arm64-apple-darwin",
        `--out:${join(provDir, "renderer")}`,
        `--report-out:${compileReport}`,
      ], {
        cwd: repoRoot,
        env: { ...compileEnv, CHENG_COLD_KEEP_PROVIDER_OBJECTS: "1" },
        encoding: "utf8",
        timeout: options.compileTimeoutMs,
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      // 预期失败: 内部链接器不解析外部对象符号; provider .o 已留盘。
    }
    const providerObjs = readdirSync(provDir).filter((f) => f.endsWith(".o")).map((f) => join(provDir, f));
    if (providerObjs.length === 0) fail("provider objects missing after keep-provider run");
    const frameworks = [
      "-framework", "VideoToolbox", "-framework", "CoreMedia", "-framework", "CoreVideo",
      "-framework", "CoreFoundation", "-framework", "Foundation", "-framework", "Metal",
      "-framework", "QuartzCore",
    ];
    execFileSync("cc", ["-arch", "arm64", "-o", exePath, objPath, hostO, ...providerObjs, ...frameworks], { timeout: 300000 });
  } finally {
    rmSync(generatedDir, { recursive: true, force: true });
  }
  if (!existsSync(exePath)) fail("link produced no exe");

  const writeBinFor = (version) => atomicWrite(binPath, bins[version].buffer);
  const writeRequest = (version, quit = false) => {
    // 文本换装请求: SWAP <version> <byteCount> <flags> (flags bit0 = quit)。
    // 完整性: 驱动原子 rename + loader 精确长度/逐段游标校验。
    atomicWrite(requestPath, Buffer.from(`SWAP ${version} ${bins[version].byteCount} ${quit ? 1 : 0}\n`));
  };
  const hsEnv = {
    CHENG_DIGEST_SCENE_DATA: binPath,
    CHENG_HS_SWAP_REQUEST: requestPath,
    CHENG_HS_FRAME: framePath,
    CHENG_HS_ACK: ackPath,
  };
  // ack 文件在首帧前必须不存在, 避免读到陈旧 ack
  rmSync(ackPath, { force: true });
  // 4. 冷启动基线(同一 exe, 每版本全新进程渲染一次)
  const coldRaw = {};
  for (const version of [1, 2, 3]) {
    writeBinFor(version);
    writeRequest(version);
    const cold = new RendererProcess({ exe: exePath, ackPath });
    cold.start(hsEnv);
    await cold.waitFrame(version, 30000);
    coldRaw[version] = readFileSync(framePath);
    writeRequest(version, true);
    await cold.waitExit(30000);
    if (coldRaw[version].length !== FRAME_BYTES) fail(`cold v${version} frame size ${coldRaw[version].length} != ${FRAME_BYTES}`);
  }

  // 5. 常驻进程: v1 启动 → 热换 v2/v3 → 漂移循环(结构加/删交替) → quit
  writeBinFor(1);
  writeRequest(1);
  rmSync(ackPath, { force: true });
  const resident = new RendererProcess({ exe: exePath, ackPath });
  resident.start(hsEnv);
  const latencies = [];
  const rssSamples = [];
  await resident.waitFrame(1, 30000);
  const hot1 = readFileSync(framePath);
  rssSamples.push(resident.rssKb());

  const hotSwapTo = async (version) => {
    const t0 = Date.now();
    writeBinFor(version);
    writeRequest(version);
    await resident.waitFrame(version, 30000);
    latencies.push(Date.now() - t0);
    rssSamples.push(resident.rssKb());
    return readFileSync(framePath);
  };

  const hot2 = await hotSwapTo(2);
  const hot3 = await hotSwapTo(3);

  let driftCycles = 0;
  const parityFailures = [];
  for (let i = 0; i < options.swaps; i += 1) {
    const version = i % 2 === 0 ? 2 : 3;
    const raw = await hotSwapTo(version);
    driftCycles += 1;
    if (!raw.equals(version === 2 ? coldRaw[2] : coldRaw[3])) {
      parityFailures.push(`drift cycle ${i}: hot v${version} != cold baseline`);
      break;
    }
  }

  writeRequest(3, true);
  await resident.waitExit(30000);

  // 6. 判定
  const parity = { v1: hot1.equals(coldRaw[1]), v2: hot2.equals(coldRaw[2]), v3: hot3.equals(coldRaw[3]) };
  const visibleChange = !hot1.equals(hot2) && !hot2.equals(hot3) && !hot1.equals(hot3);
  const rssFirst = rssSamples[0];
  const rssLast = rssSamples[rssSamples.length - 1];
  const rssMax = Math.max(...rssSamples);
  const driftOk = rssLast - rssFirst <= 16384 && rssMax - rssFirst <= 49152; // KiB: 16MB / 48MB
  const sortedLatencies = [...latencies].sort((a, b) => a - b);

  Object.assign(report, {
    parity,
    visibleChange,
    parityFailures,
    driftCycles,
    rss: { samples: rssSamples, firstKb: rssFirst, lastKb: rssLast, maxKb: rssMax, driftLastKb: rssLast - rssFirst, driftMaxKb: rssMax - rssFirst },
    latencyMs: { samples: latencies, p50: sortedLatencies[Math.floor(sortedLatencies.length / 2)], max: sortedLatencies[sortedLatencies.length - 1] },
    bins: Object.fromEntries(Object.entries(bins).map(([v, b]) => [v, { byteCount: b.byteCount, crc32Hex: "0x" + b.crc32.toString(16).padStart(8, "0"), sha256: sha256(b.buffer), counts: b.counts }])),
    exeSha256: sha256(readFileSync(exePath)),
    runtimeSourceSha256: sha256(readFileSync(join(options.outDir, "scene-runtime-hotswap.cheng"))),
    residentExitCode: resident.exitCode,
    residentStderrTail: resident.stderrText.slice(-400),
  });

  const verdict =
    parity.v1 && parity.v2 && parity.v3 &&
    visibleChange &&
    parityFailures.length === 0 &&
    driftOk &&
    driftCycles === options.swaps &&
    resident.exitCode === 0;
  report.verdict = verdict ? "PASS" : "FAIL";
  writeFileSync(join(options.outDir, "live-hotswap-gate.report.json"), JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(`live-hotswap-gate verdict=${report.verdict} parity=${JSON.stringify(parity)} visibleChange=${visibleChange} driftCycles=${driftCycles} rssDrift=${rssLast - rssFirst}KiB latencyP50=${report.latencyMs.p50}ms max=${report.latencyMs.max}ms\n`);
  process.stdout.write("report: " + join(options.outDir, "live-hotswap-gate.report.json") + "\n");
  process.exitCode = verdict ? 0 : 1;
}

await main();
