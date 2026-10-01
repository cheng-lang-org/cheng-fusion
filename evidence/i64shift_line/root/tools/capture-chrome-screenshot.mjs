#!/usr/bin/env node
/**
 * capture-chrome-screenshot — Puppeteer 截图工具
 *
 * 用 headless Chrome 截图并保存为 PNG + raw RGBA（含 8 字节头：UInt32LE width + height）。
 * 用于 cheng-web-oracle --compare 模式的 Chrome 截图源。
 *
 * 用法:
 *   node tools/capture-chrome-screenshot.mjs [html-path]
 *
 * 参数:
 *   html-path   HTML 文件路径（相对于 cwd），默认 tools/fixtures/oracle-real-page/index.html
 *
 * 输出:
 *   tools/fixtures/oracle/captured/chrome_screenshot.png
 *   tools/fixtures/oracle/captured/chrome_screenshot.raw
 */

import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT_DIR = 'tools/fixtures/oracle/captured';

async function capture() {
  const htmlRelPath = process.argv[2] || 'tools/fixtures/oracle-real-page/index.html';
  const htmlUrl = `file://${resolve(htmlRelPath)}`;

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 600 });

  await page.goto(htmlUrl, { waitUntil: 'networkidle0' });
  // 等 async 渲染完成
  await new Promise(r => setTimeout(r, 1000));

  // Save PNG
  const pngBuffer = await page.screenshot({ type: 'png' });
  writeFileSync(`${OUT_DIR}/chrome_screenshot.png`, pngBuffer);

  // Decode PNG -> raw RGBA, 加 8 字节头 (UInt32LE width + height)
  const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const header = Buffer.alloc(8);
  header.writeUInt32LE(info.width, 0);
  header.writeUInt32LE(info.height, 4);
  const rawWithHeader = Buffer.concat([header, data]);
  writeFileSync(`${OUT_DIR}/chrome_screenshot.raw`, rawWithHeader);

  console.log(`Chrome screenshot saved: ${data.length} raw RGBA (${info.width}x${info.height}) + PNG`);
  await browser.close();
}

capture().catch(e => {
  console.error('capture-chrome-screenshot error:', e);
  process.exit(1);
});
