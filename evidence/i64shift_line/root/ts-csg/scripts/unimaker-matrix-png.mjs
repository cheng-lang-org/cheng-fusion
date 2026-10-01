#!/usr/bin/env node
/**
 * unimaker-matrix-png.mjs — 将 UniMaker GUI Matrix 的原始像素数据转换为 PNG 图片
 *
 * 从 surface.run.stdout.txt 中提取 ---CHENG_SCREENSHOT_DUMP--- 段，
 * 转换为 1024x768 RGBA PNG。
 *
 * 用法:
 *   node scripts/unimaker-matrix-png.mjs --matrix-dir <dir> [--out-dir <dir>]
 *
 * 默认 matrix-dir = ts-csg/tmp/unimaker-gui-matrix-{latest}/
 * 默认 out-dir   = 同目录下的 png/ 子目录
 */

import { createReadStream, existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import sharp from "sharp";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");

const args = process.argv.slice(2);
const matrixDir = resolveArg(args, "--matrix-dir") || findLatestMatrixDir();
const outDir = resolveArg(args, "--out-dir") || join(matrixDir, "png");

if (!matrixDir || !existsSync(matrixDir)) {
  process.stderr.write(`error: matrix dir not found: ${matrixDir}\n`);
  process.stderr.write(`用法: node scripts/unimaker-matrix-png.mjs --matrix-dir <dir> [--out-dir <dir>]\n`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const surfaceDirs = readdirSync(matrixDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && /^\d{3}_/.test(d.name))
  .sort();

let converted = 0;
let skipped = 0;
let errors = 0;

for (const dirEnt of surfaceDirs) {
  const surfaceDir = join(matrixDir, dirEnt.name);
  const runfile = join(surfaceDir, "surface.run.stdout.txt");
  if (!existsSync(runfile)) {
    skipped++;
    continue;
  }

  const pngPath = join(outDir, `${dirEnt.name}.png`);
  try {
    const pixels = await extractPixels(runfile, 1024, 768);
    if (!pixels) {
      skipped++;
      continue;
    }
    const image = sharp(pixels, { raw: { width: 1024, height: 768, channels: 4 } });
    await image.png().toFile(pngPath);
    process.stderr.write(`  OK  ${dirEnt.name}\n`);
    converted++;
  } catch (err) {
    process.stderr.write(`  ERR ${dirEnt.name}: ${err.message}\n`);
    errors++;
  }
}

process.stdout.write(`\n=== Matrix PNG Conversion Complete ===\n`);
process.stdout.write(`converted: ${converted}  skipped: ${skipped}  errors: ${errors}\n`);
process.stdout.write(`output: ${outDir}\n`);

function resolveArg(args, flag) {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return null;
}

function findLatestMatrixDir() {
  const knownDir = join(packageDir, "tmp", "unimaker-gui-matrix-1780211511869");
  if (existsSync(knownDir)) return knownDir;
  const tmpDir = join(packageDir, "tmp");
  if (!existsSync(tmpDir)) return null;
  const entries = readdirSync(tmpDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith("unimaker-gui-matrix-"))
    .sort();
  if (entries.length === 0) return null;
  return join(tmpDir, entries[entries.length - 1].name);
}

async function extractPixels(filePath, width, height) {
  const lines = createInterface({ input: createReadStream(filePath, { encoding: "utf8" }), crlfDelay: Infinity });
  const pixels = Buffer.alloc(width * height * 4);
  let offset = 0;
  let rows = 0;
  let inDump = false;
  let found = false;

  for await (const line of lines) {
    if (line === "---CHENG_SCREENSHOT_DUMP---") {
      inDump = true;
      continue;
    }
    if (line === "---CHENG_DUMP_END---") break;
    if (!inDump || !line.startsWith("row: ")) continue;

    found = true;
    const values = line.slice("row: ".length).split(",").map(v => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    });
    if (values.length !== width * 4) {
      // Unexpected row width, but try to handle partial data
      const copyLen = Math.min(values.length, width * 4);
      for (let i = 0; i < copyLen; i += 1) {
        pixels[offset++] = values[i];
      }
      offset += width * 4 - copyLen;
    } else {
      for (let i = 0; i < values.length; i += 1) {
        pixels[offset++] = values[i];
      }
    }
    rows += 1;
  }

  if (!found) return null;
  return pixels;
}
