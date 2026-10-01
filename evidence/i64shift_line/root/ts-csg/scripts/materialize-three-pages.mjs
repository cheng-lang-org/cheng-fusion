#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..");

const outDir = join(packageDir, "tmp", "materialize-three-pages-" + Date.now());
mkdirSync(outDir, { recursive: true });

const cheng = join(repoRoot, "artifacts", "backend_driver", "cheng");
assert.equal(existsSync(cheng), true, "missing Cheng: " + cheng);

const csgcPath = "/Users/lbcheng/cheng-lang/ts-csg/tmp/unimaker-gui-matrix-1780237763587/unimaker-react.csgc";
assert.equal(existsSync(csgcPath), true, "missing csgc: " + csgcPath);

process.stderr.write("[0] Building ts-csg...\n");
const { runCommand } = await import("./process-runner.mjs");
await runCommand("npm", ["run", "build"], { cwd: packageDir, timeout: 120000 });

const { csgcReadFacts } = await import(pathToFileURL(join(packageDir, "dist", "csgc-reader.js")).href);
const { createCsgWebMaterializerSession, materializeCsgWebSessionToChengSource } = await import(
  pathToFileURL(join(packageDir, "dist", "csg-web-materializer.js")).href
);
const { chengSmokeEnv } = await import("./cheng-smoke-env.mjs");
const { discoverDefaultSystemFontFaces, prepareFontCascadeBase64 } = await import("./font-subset.mjs");
const fontFaces = discoverDefaultSystemFontFaces();

const buf = readFileSync(csgcPath);
const { facts } = csgcReadFacts(buf);
process.stderr.write("  facts: " + facts.length + "\n");

const session = createCsgWebMaterializerSession(facts);
process.stderr.write("  session diags: " + session.diagnostics.length + "\n");

const pages = [
  {
    name: "ProfilePage",
    rootSource: "app/components/ProfilePage.tsx",
    viewport: "390x844",
    staticVals: {
      pointsBalance: "5,000",
      rwadBalance: "1,234.567",
      domainName: "myid.unimaker",
      didText: "did:unimaker:0x1234abcd5678ef9012345678abcdef90",
      peerId: "12D3KooWLpZxLyGAg8aBqRnG6FgvQoQaRcMhVAym2oLPsGTa6N1E",
      publishedContentCount: "12",
      // Enable service toggles so those sections render
      errandEnabled: "true",
      rideEnabled: "true",
      vpnNodeEnabled: "true",
      c2cMakerEnabled: "true",
      speakingPartnerEnabled: "true",
      // Show panels/overlays
      showWallet: "true",
      showAddresses: "true",
      showTransactions: "true",
      // Expand accordion sections
      nodeExpanded: "true",
      paymentExpanded: "true",
      orderExpanded: "true",
      // Wallet fields
      walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
      settlementWalletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
      creditCardEnabled: "true",
      // Balance for wallet section
      walletBalance: "0.5 ETH",
      walletCount: "3",
      // Provide address book data
      receiver: "张三",
      phone: "13800138000",
      detail: "Room 301, Building 2, No. 88 Jianguo Road",
      tag: "Home",
      isDefault: "true",
    },
  },
  {
    name: "ContentDetailPage",
    rootSource: "app/components/ContentDetailPage.tsx",
    viewport: "390x844",
    staticVals: {
      userName: "旅行摄影师小王",
      title: "在云南大理的日落时分，我拍到了这组照片",
      content: "大理古城背后的苍山在夕阳下呈现出金黄色的轮廓，洱海的水面泛着粼粼波光。这组照片拍摄于今年三月，后期只做了简单的调色处理，主要是为了还原当时肉眼看到的色彩。",
      timestamp: "1717084800000",
      type: "image",
      likes: "128",
      comments: "23",
      userId: "12D3KooWLpZxLyGAg8aBqRnG6FgvQoQaRcMhVAym2oLPsGTa6N1E",
      id: "content_001",
      media: "",
      publishCategory: "content",
      publishState: "published",
      accessPolicy: "public",
      viewerCanAccess: "true",
      tombstoned: "false",
    },
  },
  {
    name: "HomePage",
    rootSource: "app/components/HomePage.tsx",
    viewport: "390x844",
    staticVals: {
      showSearch: "false",
      sortType: "hot",
    },
  },
];

const results = [];

for (let idx = 0; idx < pages.length; idx++) {
  const page = pages[idx];
  const sDir = join(outDir, String(idx + 1) + "_" + page.name);
  mkdirSync(sDir, { recursive: true });

  const res = { name: page.name, status: "pending", elements: 0, textLiterals: 0, props: 0 };
  results.push(res);

  process.stderr.write("\n[" + (idx + 1) + "/3] " + page.name + " @" + page.viewport + "\n");

  try {
    const m1 = materializeCsgWebSessionToChengSource(session, {
      frameLimit: 600, dumpMode: true, rawPixelDump: false, pureCheng: true,
      viewport: page.viewport, rootText: "", rootSource: page.rootSource,
      fontBase64s: [], staticExpressionValues: page.staticVals,
    });
    const fatal1 = m1.diagnostics.filter(function(d) { return !d.startsWith("unsupported "); });
    if (fatal1.length > 0) {
      res.status = "materialize_failed";
      res.error = fatal1.join("\n");
      process.stderr.write("    materialize failed: " + fatal1.join("\n") + "\n");
      continue;
    }
    res.elements = m1.counts.elements;
    res.textLiterals = m1.counts.textLiterals;
    res.props = m1.counts.props;
    process.stderr.write("    materialized: " + m1.counts.elements + " elems, " + m1.counts.textLiterals + " text, " + m1.counts.props + " props\n");

    // font subset
    const fontPrep = await prepareFontCascadeBase64({
      fontFaces: fontFaces.map(function(face) { return { ...face, path: resolve(face.path) }; }),
      sourceText: m1.text, outDir: sDir, label: page.name,
      subset: true, maxBytes: 1048576, timeoutMs: 120000,
    });
    process.stderr.write("    font: " + fontPrep.info.byteSize + " bytes, " + fontPrep.base64s.length + " faces\n");

    // materialize with font
    const m2 = materializeCsgWebSessionToChengSource(session, {
      frameLimit: 600, dumpMode: true, rawPixelDump: true, pureCheng: true,
      viewport: page.viewport, rootText: "", rootSource: page.rootSource,
      fontBase64s: fontPrep.base64s, fontWeights: fontPrep.base64Weights, fontFamilies: fontPrep.base64Families, staticExpressionValues: page.staticVals,
    });
    const fatal2 = m2.diagnostics.filter(function(d) { return !d.startsWith("unsupported "); });
    if (fatal2.length > 0) {
      res.status = "materialize_failed";
      res.error = fatal2.join("\n");
      process.stderr.write("    materialize (font) failed: " + fatal2.join("\n") + "\n");
      continue;
    }

    const sourcePath = join(sDir, "surface.cheng");
    writeFileSync(sourcePath, m2.text, "utf8");
    process.stderr.write("    source: " + m2.counts.elements + " elems, " + m2.counts.textLiterals + " text, " + m2.counts.props + " props\n");

    // compile
    process.stderr.write("    compiling...\n");
    const compileRel = ".tmp-exec/mat3p/" + Date.now() + "_" + page.name + ".cheng";
    const compileAbs = join(repoRoot, compileRel);
    mkdirSync(dirname(compileAbs), { recursive: true });
    writeFileSync(compileAbs, m2.text, "utf8");

    const exePath = join(sDir, "surface");
    const compileReportPath = join(sDir, "surface.compile.report.txt");
    await runCommand(cheng, [
      "system-link-exec", "--root:" + repoRoot, "--in:" + compileRel,
      "--emit:exe", "--target:arm64-apple-darwin",
      "--out:" + exePath, "--report-out:" + compileReportPath,
    ], {
      cwd: repoRoot,
      env: chengSmokeEnv({
        CHENG_PROCESS_MAX_RSS_BYTES: "2147483648",
        CHENG_ALLOW_UNVERIFIED_RSS_GUARD: "1",
        BACKEND_INCREMENTAL: "0",
        BACKEND_MULTI_MODULE_CACHE: "0",
        CHENG_DISABLE_PRIMARY_OBJECT_CACHE: "1",
      }),
      timeout: 300000, maxBuffer: 32 * 1024 * 1024,
    });
    process.stderr.write("    compiled: " + exePath + "\n");

    // run
    process.stderr.write("    running...\n");
    const runOutputPath = join(sDir, "surface.run.stdout.txt");
    await runCommand(exePath, [], {
      cwd: repoRoot, encoding: "utf8",
      timeout: 60000, maxBuffer: 32 * 1024 * 1024, stdoutPath: runOutputPath,
    });

    // analyze output
    const runOut = readFileSync(runOutputPath, "utf8");
    process.stderr.write("    run output: " + runOut.length + " bytes\n");

    const lines = runOut.split("\n");
    let pixelRows = 0;
    let inDump = false;
    let totalPixels = 0;
    let darkPixels = 0;
    for (const line of lines) {
      if (line === "---CHENG_SCREENSHOT_DUMP---") { inDump = true; continue; }
      if (line === "---CHENG_DUMP_END---") { inDump = false; continue; }
      if (!inDump || !line.startsWith("row: ")) continue;
      pixelRows++;
      const parts = line.slice(5).split(",").map(Number);
      for (let i = 0; i + 3 < parts.length; i += 4) {
        totalPixels++;
        const r = parts[i], g = parts[i+1], b = parts[i+2], a = parts[i+3];
        if (a > 0 && !(r > 250 && g > 250 && b > 250)) {
          darkPixels++;
        }
      }
    }
    res.darkPixels = darkPixels;
    res.totalPixels = totalPixels;
    res.pixelRows = pixelRows;
    process.stderr.write("    darkPx=" + darkPixels + " / " + totalPixels + " (" + pixelRows + " rows)\n");

    // convert to PNG
    try {
      const sharp = (await import("sharp")).default;
      const width = 390, height = 844;
      const pixelBuf = Buffer.alloc(width * height * 4);
      let offset = 0;
      inDump = false;
      for (const line of lines) {
        if (line === "---CHENG_SCREENSHOT_DUMP---") { inDump = true; continue; }
        if (line === "---CHENG_DUMP_END---") break;
        if (!inDump || !line.startsWith("row: ")) continue;
        const parts = line.slice(5).split(",").map(Number);
        const copyLen = Math.min(parts.length, width * 4);
        for (let i = 0; i < copyLen; i++) pixelBuf[offset++] = parts[i];
        offset += width * 4 - copyLen;
      }
      const pngPath = join(sDir, "surface.png");
      await sharp(pixelBuf, { raw: { width, height, channels: 4 } }).png().toFile(pngPath);
      process.stderr.write("    PNG: " + pngPath + "\n");
    } catch (e) {
      process.stderr.write("    PNG skip: " + e.message + "\n");
    }

    res.status = "ok";
    process.stderr.write("    OK\n");
  } catch (err) {
    res.status = "failed";
    res.error = err.message || String(err);
    process.stderr.write("    FAILED: " + err.message + "\n");
  }
}

process.stderr.write("\n===== RESULTS =====\n");
for (const r of results) {
  process.stderr.write(r.name + ": " + r.status + " | elems=" + r.elements + " text=" + r.textLiterals + " darkPx=" + (r.darkPixels || 0) + " / " + (r.totalPixels || 0) + "\n");
  if (r.error) process.stderr.write("  error: " + r.error + "\n");
}
writeFileSync(join(outDir, "report.json"), JSON.stringify(results, null, 2) + "\n", "utf8");
process.stderr.write("\nReport: " + join(outDir, "report.json") + "\n");
process.stdout.write("OUT_DIR=" + outDir + "\n");
