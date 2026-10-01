#!/usr/bin/env node
/**
 * html-csg-pixel-diff.mjs — 浏览器真值截图 vs 纯 Cheng 原生光栅，逐像素对拍。
 *
 * 用法:
 *   node scripts/html-csg-pixel-diff.mjs --truth <live.png> --native <render.png> \
 *        [--out <diff.json>] [--heatmap <diff.png>] [--tolerance <0-255>]
 *
 * 输出结构化 JSON: 尺寸校验、逐通道 MAE、容差内一致率、精确一致率、
 * 分块(32x32)差异热力,便于定位是排版偏移还是样式缺失。
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const options = (() => {
  const p = { truth: "", native: "", out: "", heatmap: "", tolerance: 16, block: 32 };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const next = () => { i += 1; if (i >= args.length) fail("missing value for " + args[i - 1]); return args[i]; };
    if (args[i] === "--truth") p.truth = next();
    else if (args[i] === "--native") p.native = next();
    else if (args[i] === "--out") p.out = next();
    else if (args[i] === "--heatmap") p.heatmap = next();
    else if (args[i] === "--tolerance") p.tolerance = Number(next());
    else if (args[i] === "--block") p.block = Number(next());
    else fail("unknown argument: " + args[i]);
  }
  if (!p.truth || !p.native) fail("pass --truth <png> --native <png>");
  return p;
})();

function fail(m) { process.stderr.write("html-csg-pixel-diff: " + m + "\n"); process.exit(1); }

const sharp = (await import("sharp")).default;

async function raw(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const truth = await raw(options.truth);
const native = await raw(options.native);
if (truth.width !== native.width || truth.height !== native.height) {
  fail(`size mismatch: truth ${truth.width}x${truth.height} vs native ${native.width}x${native.height}`);
}

const w = truth.width, h = truth.height, n = w * h;
let exact = 0, withinTol = 0;
let sumR = 0, sumG = 0, sumB = 0;
const bx = options.block;
const blocksX = Math.ceil(w / bx), blocksY = Math.ceil(h / bx);
const blockDiff = new Float64Array(blocksX * blocksY);
const blockCount = new Float64Array(blocksX * blocksY);

for (let i = 0; i < n; i += 1) {
  const o = i * 4;
  const dr = Math.abs(truth.data[o] - native.data[o]);
  const dg = Math.abs(truth.data[o + 1] - native.data[o + 1]);
  const db = Math.abs(truth.data[o + 2] - native.data[o + 2]);
  sumR += dr; sumG += dg; sumB += db;
  const worst = Math.max(dr, dg, db);
  if (dr === 0 && dg === 0 && db === 0) exact += 1;
  if (worst <= options.tolerance) withinTol += 1;
  const x = i % w, y = (i - x) / w;
  const bi = ((y / bx) | 0) * blocksX + ((x / bx) | 0);
  blockDiff[bi] += (dr + dg + db) / 3;
  blockCount[bi] += 1;
}

const blocks = [];
for (let i = 0; i < blockDiff.length; i += 1) {
  if (blockCount[i] === 0) continue;
  blocks.push({ blockX: (i % blocksX) * bx, blockY: ((i / blocksX) | 0) * bx, meanAbsDiff: +(blockDiff[i] / blockCount[i]).toFixed(2) });
}
blocks.sort((a, b) => b.meanAbsDiff - a.meanAbsDiff);

const report = {
  schema: "html_csg_pixel_diff.v1",
  truth: resolve(options.truth),
  native: resolve(options.native),
  size: { width: w, height: h, pixels: n },
  tolerance: options.tolerance,
  exactMatchRatio: +(exact / n).toFixed(6),
  withinToleranceRatio: +(withinTol / n).toFixed(6),
  meanAbsError: {
    r: +(sumR / n).toFixed(3),
    g: +(sumG / n).toFixed(3),
    b: +(sumB / n).toFixed(3),
    rgb: +((sumR + sumG + sumB) / (3 * n)).toFixed(3),
  },
  worstBlocks: blocks.slice(0, 24),
  blockGrid: { blockSize: bx, blocksX, blocksY },
};

if (options.heatmap) {
  const hs = Math.max(1, Math.floor(bx));
  const hw = blocksX, hh = blocksY;
  const buf = Buffer.alloc(hw * hh * 3);
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i];
    const gi = ((b.blockY / bx) | 0) * hw + ((b.blockX / bx) | 0);
    const v = Math.min(255, Math.round((b.meanAbsDiff / 128) * 255));
    buf[gi * 3] = v; buf[gi * 3 + 1] = Math.max(0, 255 - v); buf[gi * 3 + 2] = 0;
  }
  await sharp(buf, { raw: { width: hw, height: hh, channels: 3 } })
    .resize(w, h, { kernel: "nearest" })
    .png().toFile(options.heatmap);
  report.heatmap = resolve(options.heatmap);
  report.heatmapNote = "block size " + hs + "px upscaled; red = larger mean abs diff";
}

const text = JSON.stringify(report, null, 2) + "\n";
if (options.out) writeFileSync(options.out, text);
process.stdout.write(text);
