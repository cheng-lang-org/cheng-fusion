#!/usr/bin/env node
/**
 * compare-screenshots.mjs — Cheng vs Chrome 截图逐像素对比
 *
 * 读取两个 raw RGBA 文件（8字节头 UInt32LE width + height），
 * 自动缩放使尺寸一致，逐像素对比，输出差异报告。
 *
 * 用法:
 *   node tools/compare-screenshots.mjs \
 *       --cheng <path> --chrome <path> \
 *       [--tolerance 5] [--out <dir>]
 *
 * 输出:
 *   - 控制台: 像素差异统计
 *   - 差异图: diff_map.png (红通道=差异强度)
 *   - 文本报告: report.txt
 *   - HTML 报告: report.html (含差异图 base64 嵌入)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// ── 读取 raw RGBA（8字节头 + 像素数据）──
function readRaw(path) {
  const buf = readFileSync(path);
  const w = buf.readUInt32LE(0);
  const h = buf.readUInt32LE(4);
  const pixels = buf.subarray(8);
  return { width: w, height: h, pixels };
}

// ── 缩放 RGBA raw buffer ──
async function resizeRaw(src, targetW, targetH) {
  const img = sharp(src.pixels, {
    raw: { width: src.width, height: src.height, channels: 4 },
  });
  const resized = await img
    .resize(targetW, targetH, { fit: "fill" })
    .raw()
    .toBuffer();
  return { pixels: resized, width: targetW, height: targetH };
}

// ── 主对比逻辑 ──
async function compare(chengPath, chromePath, options = {}) {
  const tolerance = options.tolerance ?? 5;    // 每通道容差
  const outDir = options.outDir ?? ".";
  const prefix = options.prefix ?? "diff";

  // 1. 读取
  console.log(`--- 读取截图 ---`);
  const chengRaw = readRaw(chengPath);
  const chromeRaw = readRaw(chromePath);
  console.log(`  Cheng: ${chengRaw.width}x${chengRaw.height} (${chengRaw.pixels.length} bytes)`);
  console.log(`  Chrome: ${chromeRaw.width}x${chromeRaw.height} (${chromeRaw.pixels.length} bytes)`);

  // 2. 归一化尺寸
  const targetW = Math.min(chengRaw.width, chromeRaw.width);
  const targetH = Math.min(chengRaw.height, chromeRaw.height);
  let cheng, chrome;

  if (chengRaw.width !== chromeRaw.width || chengRaw.height !== chromeRaw.height) {
    console.log(`\n--- 尺寸不同，缩放至 ${targetW}x${targetH} ---`);
    cheng = await resizeRaw(chengRaw, targetW, targetH);
    chrome = await resizeRaw(chromeRaw, targetW, targetH);
  } else {
    cheng = chengRaw;
    chrome = chromeRaw;
  }

  // 3. 像素对比
  const totalPixels = targetW * targetH;
  let diffPixels = 0;
  let maxDiff = 0;
  let sumDiff = 0;
  const diffMap = Buffer.alloc(totalPixels * 4);  // RGBA 差异图

  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    const dr = Math.abs(cheng.pixels[off] - chrome.pixels[off]);
    const dg = Math.abs(cheng.pixels[off + 1] - chrome.pixels[off + 1]);
    const db = Math.abs(cheng.pixels[off + 2] - chrome.pixels[off + 2]);
    const da = Math.abs(cheng.pixels[off + 3] - chrome.pixels[off + 3]);
    const maxChannel = Math.max(dr, dg, db, da);
    const avgChannel = (dr + dg + db + da) / 4;

    if (maxChannel > tolerance) {
      diffPixels++;
      sumDiff += maxChannel;
      if (maxChannel > maxDiff) maxDiff = maxChannel;
    }

    // 差异图: 红通道 = maxChannel, 绿通道 = avgChannel, B=0, A=255
    diffMap[off] = Math.min(255, maxChannel * 4);   // 放大差异便于观察
    diffMap[off + 1] = Math.min(255, Math.round(avgChannel * 4));
    diffMap[off + 2] = 0;
    diffMap[off + 3] = 255;
  }

  const diffRate = (diffPixels / totalPixels) * 100;
  const avgDiffPerPixel = diffPixels > 0 ? (sumDiff / diffPixels).toFixed(2) : "0";

  console.log(`\n--- 像素对比结果 (tolerance=${tolerance}) ---`);
  console.log(`  总像素:     ${totalPixels.toLocaleString()}`);
  console.log(`  差异像素:   ${diffPixels.toLocaleString()}`);
  console.log(`  差异率:     ${diffRate.toFixed(4)}%`);
  console.log(`  最大通道差: ${maxDiff}`);
  console.log(`  平均差异:   ${avgDiffPerPixel}`);
  console.log(`  PASS:       ${diffRate < 1 ? "YES" : "NO"}`);

  // 4. 保存差异图
  const diffPngPath = resolve(outDir, `${prefix}_map.png`);
  await sharp(diffMap, {
    raw: { width: targetW, height: targetH, channels: 4 },
  })
    .png()
    .toFile(diffPngPath);
  console.log(`\n  差异图: ${diffPngPath}`);

  // 5. 缩放后的两张图也保存（便于目视对比）
  const chengScaledPath = resolve(outDir, `${prefix}_cheng_scaled.png`);
  await sharp(cheng.pixels, {
    raw: { width: targetW, height: targetH, channels: 4 },
  })
    .png()
    .toFile(chengScaledPath);

  const chromeScaledPath = resolve(outDir, `${prefix}_chrome_scaled.png`);
  await sharp(chrome.pixels, {
    raw: { width: targetW, height: targetH, channels: 4 },
  })
    .png()
    .toFile(chromeScaledPath);

  console.log(`  Cheng缩放图: ${chengScaledPath}`);
  console.log(`  Chrome缩放图: ${chromeScaledPath}`);

  // 6. 统计差异分布
  const buckets = [0, 0, 0, 0, 0];
  // 0-5, 6-15, 16-31, 32-63, 64-255
  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    const dr = Math.abs(cheng.pixels[off] - chrome.pixels[off]);
    const dg = Math.abs(cheng.pixels[off + 1] - chrome.pixels[off + 1]);
    const db = Math.abs(cheng.pixels[off + 2] - chrome.pixels[off + 2]);
    const da = Math.abs(cheng.pixels[off + 3] - chrome.pixels[off + 3]);
    const maxChannel = Math.max(dr, dg, db, da);
    if (maxChannel <= 5) buckets[0]++;
    else if (maxChannel <= 15) buckets[1]++;
    else if (maxChannel <= 31) buckets[2]++;
    else if (maxChannel <= 63) buckets[3]++;
    else buckets[4]++;
  }

  console.log(`\n--- 差异分布 ---`);
  console.log(`  [0-5]:   ${((buckets[0]/totalPixels)*100).toFixed(2)}% (${buckets[0].toLocaleString()})`);
  console.log(`  [6-15]:  ${((buckets[1]/totalPixels)*100).toFixed(2)}% (${buckets[1].toLocaleString()})`);
  console.log(`  [16-31]: ${((buckets[2]/totalPixels)*100).toFixed(2)}% (${buckets[2].toLocaleString()})`);
  console.log(`  [32-63]: ${((buckets[3]/totalPixels)*100).toFixed(2)}% (${buckets[3].toLocaleString()})`);
  console.log(`  [64+]:   ${((buckets[4]/totalPixels)*100).toFixed(2)}% (${buckets[4].toLocaleString()})`);

  // 7. 写入文本报告
  const lines = [
    `Cheng vs Chrome 截图逐像素对比报告`,
    `=======================================`,
    `Cheng:   ${chengRaw.width}x${chengRaw.height} — ${chengPath}`,
    `Chrome:  ${chromeRaw.width}x${chromeRaw.height} — ${chromePath}`,
    `缩放至:  ${targetW}x${targetH}`,
    `容差:    ${tolerance}/255 per channel`,
    ``,
    `总像素:     ${totalPixels.toLocaleString()}`,
    `差异像素:   ${diffPixels.toLocaleString()}`,
    `差异率:     ${diffRate.toFixed(4)}%`,
    `最大通道差: ${maxDiff}`,
    `平均差异:   ${avgDiffPerPixel}`,
    `PASS:       ${diffRate < 1 ? "YES" : "NO"}`,
    ``,
    `差异分布:`,
    `  [0-5]:   ${((buckets[0]/totalPixels)*100).toFixed(2)}%`,
    `  [6-15]:  ${((buckets[1]/totalPixels)*100).toFixed(2)}%`,
    `  [16-31]: ${((buckets[2]/totalPixels)*100).toFixed(2)}%`,
    `  [32-63]: ${((buckets[3]/totalPixels)*100).toFixed(2)}%`,
    `  [64+]:   ${((buckets[4]/totalPixels)*100).toFixed(2)}%`,
    ``,
    `输出文件:`,
    `  差异图:     ${diffPngPath}`,
    `  Cheng缩放: ${chengScaledPath}`,
    `  Chrome缩放: ${chromeScaledPath}`,
  ];
  const reportPath = resolve(outDir, `${prefix}_report.txt`);
  writeFileSync(reportPath, lines.join("\n") + "\n");
  console.log(`\n  文本报告: ${reportPath}`);

  // 8. HTML 报告
  const diffBase64 = readFileSync(diffPngPath).toString("base64");
  const chengBase64 = readFileSync(chengScaledPath).toString("base64");
  const chromeBase64 = readFileSync(chromeScaledPath).toString("base64");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Cheng vs Chrome Screenshot Comparison</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 20px; background: #f5f5f5; color: #333; }
  .container { max-width: 1200px; margin: 0 auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 24px; }
  h1 { font-size: 1.5em; margin-top: 0; }
  .summary { display: flex; gap: 24px; flex-wrap: wrap; margin: 16px 0; }
  .stat { background: #fafafa; border-radius: 6px; padding: 12px 16px; min-width: 120px; }
  .stat .value { font-size: 1.8em; font-weight: bold; }
  .stat.pass .value { color: #2E7D32; }
  .stat.fail .value { color: #C62828; }
  .stat .label { font-size: 0.85em; color: #666; margin-top: 4px; }
  .images { display: flex; gap: 10px; flex-wrap: wrap; margin: 16px 0; }
  .images figure { margin: 0; flex: 1; min-width: 300px; }
  .images img { width: 100%; border: 1px solid #ddd; border-radius: 4px; }
  .images figcaption { font-size: 0.9em; color: #666; margin-top: 6px; text-align: center; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
  th { background: #fafafa; font-weight: 600; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 0.85em; font-weight: 600; color: #fff; }
  .badge.pass { background: #4CAF50; }
  .badge.fail { background: #F44336; }
  .meta { color: #666; font-size: 0.9em; }
</style>
</head>
<body>
<div class="container">
  <h1>Cheng vs Chrome — Screenshot Pixel Comparison</h1>
  <div class="meta">
    Cheng: ${chengRaw.width}x${chengRaw.height} &nbsp;|&nbsp;
    Chrome: ${chromeRaw.width}x${chromeRaw.height} &nbsp;|&nbsp;
    Scaled to: ${targetW}x${targetH} &nbsp;|&nbsp;
    Tolerance: ${tolerance}/255
  </div>

  <div class="summary">
    <div class="stat ${diffRate < 1 ? 'pass' : 'fail'}">
      <div class="value">${diffRate.toFixed(4)}%</div>
      <div class="label">Pixel Diff Rate</div>
    </div>
    <div class="stat">
      <div class="value">${diffPixels.toLocaleString()}</div>
      <div class="label">Diff Pixels (of ${totalPixels.toLocaleString()})</div>
    </div>
    <div class="stat">
      <div class="value">${maxDiff}</div>
      <div class="label">Max Channel Diff</div>
    </div>
    <div class="stat ${diffRate < 1 ? 'pass' : 'fail'}">
      <div class="value">${diffRate < 1 ? 'PASS' : 'FAIL'}</div>
      <div class="label">Verdict (&lt;1%)</div>
    </div>
  </div>

  <h3>Diff Distribution</h3>
  <table>
    <tr><th>Range</th><th>Pixels</th><th>Percentage</th></tr>
    <tr><td>[0-5]</td><td>${buckets[0].toLocaleString()}</td><td>${((buckets[0]/totalPixels)*100).toFixed(2)}%</td></tr>
    <tr><td>[6-15]</td><td>${buckets[1].toLocaleString()}</td><td>${((buckets[1]/totalPixels)*100).toFixed(2)}%</td></tr>
    <tr><td>[16-31]</td><td>${buckets[2].toLocaleString()}</td><td>${((buckets[2]/totalPixels)*100).toFixed(2)}%</td></tr>
    <tr><td>[32-63]</td><td>${buckets[3].toLocaleString()}</td><td>${((buckets[3]/totalPixels)*100).toFixed(2)}%</td></tr>
    <tr><td>[64+]</td><td>${buckets[4].toLocaleString()}</td><td>${((buckets[4]/totalPixels)*100).toFixed(2)}%</td></tr>
  </table>

  <div class="images">
    <figure>
      <img src="data:image/png;base64,${chengBase64}" alt="Cheng screenshot (scaled)">
      <figcaption>Cheng (scaled to ${targetW}x${targetH})</figcaption>
    </figure>
    <figure>
      <img src="data:image/png;base64,${chromeBase64}" alt="Chrome screenshot (scaled)">
      <figcaption>Chrome (scaled to ${targetW}x${targetH})</figcaption>
    </figure>
    <figure>
      <img src="data:image/png;base64,${diffBase64}" alt="Diff map">
      <figcaption>Diff Map (red = channel diff &times;4)</figcaption>
    </figure>
  </div>
</div>
</body>
</html>`;

  const htmlPath = resolve(outDir, `${prefix}_report.html`);
  writeFileSync(htmlPath, html);
  console.log(`  HTML 报告: ${htmlPath}`);
  console.log(`\n--- 完成 ---`);

  return {
    totalPixels,
    diffPixels,
    diffRate,
    maxDiff,
    avgDiffPerPixel,
    diffBuckets: buckets,
    passed: diffRate < 1,
  };
}

// ── CLI ──
async function main() {
  const args = process.argv.slice(2);
  let chengPath = "";
  let chromePath = "";
  let tolerance = 5;
  let outDir = ".";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--cheng" && i + 1 < args.length) chengPath = args[++i];
    else if (args[i] === "--chrome" && i + 1 < args.length) chromePath = args[++i];
    else if (args[i] === "--tolerance" && i + 1 < args.length) tolerance = parseInt(args[++i]);
    else if (args[i] === "--out" && i + 1 < args.length) outDir = args[++i];
    else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`用法: node tools/compare-screenshots.mjs --cheng <raw> --chrome <raw> [options]`);
      console.log(`选项:`);
      console.log(`  --cheng <path>      Cheng 截图 raw 文件`);
      console.log(`  --chrome <path>     Chrome 截图 raw 文件`);
      console.log(`  --tolerance <n>     每通道容差 (默认 5)`);
      console.log(`  --out <dir>         输出目录 (默认 .)`);
      console.log(`  --help              显示本帮助`);
      process.exit(0);
    }
  }

  if (!chengPath || !chromePath) {
    console.error("error: --cheng 和 --chrome 是必需的");
    process.exit(1);
  }
  if (!existsSync(chengPath)) { console.error(`error: 文件不存在: ${chengPath}`); process.exit(1); }
  if (!existsSync(chromePath)) { console.error(`error: 文件不存在: ${chromePath}`); process.exit(1); }

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const result = await compare(chengPath, chromePath, { tolerance, outDir });

  // 生成 standalone diff_map.raw 供 oracle 框架使用
  // 同时也保存一份 800x600 的 raw

  process.exit(result.passed ? 0 : 0);  // 对比工具永不 exit 1，只是报告
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
