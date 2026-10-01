#!/usr/bin/env node
/**
 * html-csg-semantic-hotswap-gate.mjs — LIVE_MIRROR_CAMPAIGN P4 语义轨像素闭环门禁。
 *
 * 闭环: TSX 语义 fixture → emitCsgWebFromTs 提取 → materializer 场景物化
 * (emitCsgWebSceneFactsFromFactArray, inline style → paint facts) →
 * buildSceneMobileDataAsset 语义 bin → 热换进 P1 常驻渲染器 → 软光栅帧与
 * 冷启动基线逐字节 parity。
 *
 * v2 = 同结构换色(TSX inline backgroundColor 编辑), 模拟语义轨 TS 编辑热换。
 *
 * 用法: node scripts/html-csg-semantic-hotswap-gate.mjs [--out-dir <dir>] [--compile-timeout <ms>]
 * 输出: <out-dir>/semantic-hotswap-gate.report.json, exit 0|1
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");

function fail(message) {
  process.stderr.write("html-csg-semantic-hotswap-gate: " + message + "\n");
  process.exit(1);
}

const options = (() => {
  const p = {
    outDir: join(packageDir, "tmp", "semantic-hotswap-gate", "last-run"),
    compileTimeoutMs: 900000,
    driver: process.env.CHENG_HOTSWAP_DRIVER || "",
  };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--out-dir") { p.outDir = resolve(args[i + 1]); i += 1; }
    else if (args[i] === "--compile-timeout") { p.compileTimeoutMs = Number(args[i + 1]); i += 1; }
    else if (args[i] === "--driver") { p.driver = resolve(args[i + 1]); i += 1; }
    else fail("unknown argument: " + args[i]);
  }
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
  const report = { schema: "html_csg.semantic_hotswap_gate.report.v1", verdict: "FAIL", viewport: VIEWPORT };

  const { emitCsgWebFromTs } = await import(pathToFileURL(join(packageDir, "dist", "csg-web.js")).href);
  const { emitCsgWebSceneFactsFromFactArray } = await import(
    pathToFileURL(join(packageDir, "dist", "csg-web-materializer.js")).href
  );
  const { emitSceneMobileRuntimeSource, emitSceneHotswapMainSource, buildSceneMobileDataAsset } =
    await import(pathToFileURL(join(scriptDir, "scene-runtime-smoke-source.mjs")).href);

  // 1. 语义 fixture 两版本: v1 原样; v2 换色(TSX inline style 语义编辑)
  const fixtureDir = join(packageDir, "fixtures", "scene-hotswap-basic");
  const projectDirs = { 1: join(options.outDir, "project-v1"), 2: join(options.outDir, "project-v2") };
  for (const dir of Object.values(projectDirs)) cpSync(fixtureDir, dir, { recursive: true });
  const mainTsxV2 = join(projectDirs[2], "src", "main.tsx");
  const v2Source = readFileSync(mainTsxV2, "utf8").replace('#3366cc', '#cc6633');
  if (v2Source === readFileSync(mainTsxV2, "utf8")) fail("fixture v2 edit produced no change");
  writeFileSync(mainTsxV2, v2Source);

  // 2. 提取 + 场景物化 + 语义 bin
  const bins = {};
  const sceneFactsBy = {};
  for (const [version, projectDir] of Object.entries(projectDirs)) {
    const extracted = emitCsgWebFromTs({
      project: join(projectDir, "tsconfig.json"),
      runtime: ["browser"],
      entryRoots: ["src/main.tsx"],
      emitText: false,
    });
    if (extracted.diagnostics.length) fail("extract diagnostics: " + extracted.diagnostics.join(" | ").slice(0, 400));
    const scene = emitCsgWebSceneFactsFromFactArray(extracted.facts, { viewport: `${VIEWPORT.width}x${VIEWPORT.height}` });
    if (scene.diagnostics.length) fail("scene diagnostics: " + scene.diagnostics.join(" | ").slice(0, 400));
    const paintFacts = scene.facts.filter((f) => f.kind === "csg.web.scene.paint" && f.opKind === "fill");
    if (paintFacts.length < 4) fail(`semantic scene fill paints ${paintFacts.length} < 4 (paint coverage gap)`);
    sceneFactsBy[version] = scene.facts;
    const asset = buildSceneMobileDataAsset(scene.facts, []);
    bins[version] = {
      buffer: Buffer.from(asset.buffer),
      byteCount: asset.buffer.length,
      crc32: crc32Bytes(asset.buffer),
      counts: asset.counts,
    };
  }

  const binPath = join(options.outDir, "scene_data.bin");
  const requestPath = join(options.outDir, "scene_swap_request.bin");
  const framePath = join(options.outDir, "frame.raw");
  const ackPath = join(options.outDir, "frame_ack.txt");

  // 3. 生成热换渲染器源(场景全从外部 bin 重建)并编译(配方同 P1 v3)
  const generatedDir = join(repoRoot, "src", ".tmp-exec", `semantic-hotswap-gate-${process.pid}`);
  const runtimeSourcePath = join(generatedDir, "scene-semantic-hotswap.cheng");
  const runtimeSource = emitSceneMobileRuntimeSource(sceneFactsBy[1], {
    sceneDataAsset: { byteCount: bins[1].byteCount, crc32: bins[1].crc32, counts: bins[1].counts },
    hotSwap: true,
    viewport: `${VIEWPORT.width}x${VIEWPORT.height}`,
    initialRoute: "root",
    swapRequestPath: requestPath,
    binPath: binPath,
    frameDumpPath: framePath,
    frameAckPath: ackPath,
  });
  mkdirSync(generatedDir, { recursive: true });
  const fullSource = runtimeSource + "\n" + emitSceneHotswapMainSource({ viewport: `${VIEWPORT.width}x${VIEWPORT.height}` }) + "\n";
  writeFileSync(runtimeSourcePath, fullSource);
  writeFileSync(join(options.outDir, "scene-semantic-hotswap.cheng"), fullSource);

  const exePath = join(options.outDir, "scene_semantic_renderer");
  const compileReport = join(options.outDir, "compile-report.txt");
  const objPath = join(options.outDir, "scene-semantic-hotswap.o");
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
    atomicWrite(requestPath, Buffer.from(`SWAP ${version} ${bins[version].byteCount} ${quit ? 1 : 0}\n`));
  };
  const hsEnv = {
    CHENG_DIGEST_SCENE_DATA: binPath,
    CHENG_HS_SWAP_REQUEST: requestPath,
    CHENG_HS_FRAME: framePath,
    CHENG_HS_ACK: ackPath,
  };
  rmSync(ackPath, { force: true });

  // 4. 冷启动基线(同 exe 每版本全新进程)
  const coldRaw = {};
  for (const version of [1, 2]) {
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

  // 5. 常驻进程热换 v1→v2
  writeBinFor(1);
  writeRequest(1);
  rmSync(ackPath, { force: true });
  const resident = new RendererProcess({ exe: exePath, ackPath });
  resident.start(hsEnv);
  await resident.waitFrame(1, 30000);
  const hot1 = readFileSync(framePath);
  const t0 = Date.now();
  writeBinFor(2);
  writeRequest(2);
  await resident.waitFrame(2, 30000);
  const latencyMs = Date.now() - t0;
  const hot2 = readFileSync(framePath);
  const rssFirst = resident.rssKb();
  writeRequest(2, true);
  await resident.waitExit(30000);

  const parity = { v1: hot1.equals(coldRaw[1]), v2: hot2.equals(coldRaw[2]) };
  const visibleChange = !hot1.equals(hot2);
  Object.assign(report, {
    parity,
    visibleChange,
    latencyMs,
    rssFirstKb: rssFirst,
    bins: Object.fromEntries(Object.entries(bins).map(([v, b]) => [v, { byteCount: b.byteCount, crc32Hex: "0x" + b.crc32.toString(16).padStart(8, "0"), sha256: sha256(b.buffer), counts: b.counts }])),
    exeSha256: sha256(readFileSync(exePath)),
    residentExitCode: resident.exitCode,
    residentStderrTail: resident.stderrText.slice(-400),
  });
  const verdict = parity.v1 && parity.v2 && visibleChange && resident.exitCode === 0;
  report.verdict = verdict ? "PASS" : "FAIL";
  writeFileSync(join(options.outDir, "semantic-hotswap-gate.report.json"), JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(`semantic-hotswap-gate verdict=${report.verdict} parity=${JSON.stringify(parity)} visibleChange=${visibleChange} latencyMs=${latencyMs}\n`);
  process.stdout.write("report: " + join(options.outDir, "semantic-hotswap-gate.report.json") + "\n");
  process.exitCode = verdict ? 0 : 1;
}

await main();
