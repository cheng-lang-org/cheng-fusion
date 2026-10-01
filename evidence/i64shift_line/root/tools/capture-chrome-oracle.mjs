#!/usr/bin/env node
/**
 * capture-chrome-oracle.mjs — 用 puppeteer 从 Chrome headless 捕获 oracle 数据
 *
 * 从 oracle-real-page HTML 中提取：
 *   1. DOM 树结构 (nodeId, kind, tagName, textContent, attributes, children)
 *   2. Layout boxes (nodeId, x, y, width, height)
 *   3. Screenshot (raw RGBA with 8-byte width/height header)
 *
 * 用法: node tools/capture-chrome-oracle.mjs [--viewport 1024x768] [--out <dir>]
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(scriptDir, "fixtures", "oracle-real-page");
const oracleFixtureDir = resolve(scriptDir, "fixtures", "oracle");
const htmlPath = resolve(fixtureDir, "index.html");

// Parse args
const viewportArg = process.argv.find(a => a.startsWith("--viewport=")) || "--viewport=1024x768";
const viewport = viewportArg.split("=")[1] || "1024x768";
const [vw, vh] = viewport.split("x").map(Number);
const outDir = process.argv.includes("--out")
  ? resolve(process.argv[process.argv.indexOf("--out") + 1])
  : oracleFixtureDir;

async function main() {
  // Dynamic import of puppeteer
  let puppeteer;
  try {
    puppeteer = await import("puppeteer");
  } catch {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    puppeteer = require("puppeteer");
  }

  console.log(`[capture-chrome-oracle] Launching Chrome headless (viewport: ${viewport})`);
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: vw, height: vh });
    await page.goto("file://" + htmlPath, { waitUntil: "networkidle0", timeout: 15000 });

    // Wait for canvas rendering
    await new Promise(r => setTimeout(r, 800));

    // ── 1. Capture DOM tree (serialized inline inside browser context) ──
    console.log("[capture-chrome-oracle] Capturing DOM tree...");
    const domTree = await page.evaluate(() => {
      let idCounter = 0;
      function serializeNode(node) {
        if (!node || !node.nodeType) return null;
        idCounter++;
        const nodeId = idCounter;
        const result = {
          nodeId,
          kind: node.nodeType,
          tagName: node.nodeType === 1 ? node.tagName.toLowerCase() : (node.nodeType === 3 ? "#text" : "#document"),
          textContent: node.nodeType === 3 ? node.textContent.trim() : "",
          attributes: {},
          children: [],
        };
        if (node.nodeType === 1) {
          for (const attr of node.attributes || []) {
            result.attributes[attr.name] = attr.value;
          }
          for (const child of node.childNodes || []) {
            if (child.nodeType === 3 && !child.textContent.trim()) continue;
            const serialized = serializeNode(child);
            if (serialized) result.children.push(serialized);
          }
        }
        return result;
      }
      return serializeNode(document.documentElement);
    });
    const domClean = domTree ? [domTree] : [];

    // ── 2. Capture layout boxes (inline in browser context) ──
    console.log("[capture-chrome-oracle] Capturing layout boxes...");
    const layoutBoxes = await page.evaluate(() => {
      const results = [];
      let idCounter = 0;
      function collectBoxes(node) {
        if (!node || !node.nodeType) return;
        if (node.nodeType === 1) {
          idCounter++;
          const display = window.getComputedStyle(node).display;
          if (display !== "none") {
            const rect = node.getBoundingClientRect();
            results.push({
              nodeId: idCounter,
              x: Math.round(rect.x * 10) / 10,
              y: Math.round(rect.y * 10) / 10,
              width: Math.round(rect.width * 10) / 10,
              height: Math.round(rect.height * 10) / 10,
            });
          }
          for (const child of node.children || []) {
            collectBoxes(child);
          }
        }
      }
      collectBoxes(document.body);
      return results;
    });

    // ── 3. Events (placeholder — no synthetic events in static page) ──
    console.log("[capture-chrome-oracle] Events: none (static page)");
    const events = [];

    // ── 4. Capture screenshot ──
    console.log("[capture-chrome-oracle] Capturing screenshot...");
    const screenshot = await page.screenshot({
      type: "png",
      fullPage: false,
    });

    // Convert PNG screenshot to raw RGBA
    let screenshotRaw = Buffer.alloc(8 + vw * vh * 4, 0);
    screenshotRaw.writeUInt32LE(vw, 0);
    screenshotRaw.writeUInt32LE(vh, 4);

    try {
      const sharp = (await import("sharp")).default;
      const raw = await sharp(screenshot).ensureAlpha().raw().toBuffer();
      const expectedLen = vw * vh * 4;
      if (raw.length >= expectedLen) {
        for (let i = 0; i < vw * vh; i++) {
          const srcOff = i * 4;
          const dstOff = 8 + i * 4;
          screenshotRaw[dstOff] = raw[srcOff];
          screenshotRaw[dstOff + 1] = raw[srcOff + 1];
          screenshotRaw[dstOff + 2] = raw[srcOff + 2];
          screenshotRaw[dstOff + 3] = 255;
        }
      } else {
        // If screenshot is smaller than viewport, center it
        const imgW = Math.round(Math.sqrt(raw.length / 4));
        const imgH = Math.ceil(raw.length / 4 / imgW);
        const ox = Math.floor((vw - imgW) / 2);
        const oy = Math.floor((vh - imgH) / 2);
        for (let y = 0; y < imgH && y + oy < vh; y++) {
          for (let x = 0; x < imgW && x + ox < vw; x++) {
            const srcOff = (y * imgW + x) * 4;
            const dstOff = 8 + ((y + oy) * vw + (x + ox)) * 4;
            screenshotRaw[dstOff] = raw[srcOff];
            screenshotRaw[dstOff + 1] = raw[srcOff + 1];
            screenshotRaw[dstOff + 2] = raw[srcOff + 2];
            screenshotRaw[dstOff + 3] = raw[srcOff + 3];
          }
        }
      }
      console.log(`[capture-chrome-oracle]   Screenshot: ${raw.length} bytes raw RGBA`);
    } catch (e) {
      console.log(`[capture-chrome-oracle]   sharp error: ${e.message}, saving PNG only`);
    }

    // ── Write output files ──
    mkdirSync(outDir, { recursive: true });

    const domPath = join(outDir, "dom_chrome.json");
    writeFileSync(domPath, JSON.stringify(domClean, null, 2));
    console.log(`[capture-chrome-oracle] DOM written: ${domPath} (${domClean.length} roots, ${countNodes(domClean[0])} nodes)`);

    const layoutPath = join(outDir, "layout_chrome.json");
    writeFileSync(layoutPath, JSON.stringify(layoutBoxes, null, 2));
    console.log(`[capture-chrome-oracle] Layout written: ${layoutPath} (${layoutBoxes.length} boxes)`);

    const eventsPath = join(outDir, "events_chrome.json");
    writeFileSync(eventsPath, JSON.stringify(events, null, 2));
    console.log(`[capture-chrome-oracle] Events written: ${eventsPath}`);

    const screenshotPath = join(outDir, "screenshot_chrome.raw");
    writeFileSync(screenshotPath, screenshotRaw);
    console.log(`[capture-chrome-oracle] Screenshot raw: ${screenshotPath} (${screenshotRaw.length} bytes)`);

    const pngRefPath = join(outDir, "screenshot_chrome.png");
    writeFileSync(pngRefPath, screenshot);
    console.log(`[capture-chrome-oracle] Screenshot PNG: ${pngRefPath}`);

    // Print summary
    console.log("\n[capture-chrome-oracle] === Capture Summary ===");
    console.log(`  DOM nodes:      ${countNodes(domClean[0])}`);
    console.log(`  Layout boxes:   ${layoutBoxes.length}`);
    console.log(`  Events:         ${events.length}`);
    console.log(`  Screenshot:     ${vw}x${vh} (${screenshotRaw.length} bytes raw)`);
    console.log(`  Output dir:     ${outDir}`);

  } finally {
    await browser.close();
  }
}

function countNodes(node) {
  if (!node) return 0;
  let count = 1;
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

main().catch(err => {
  console.error("[capture-chrome-oracle] Error:", err);
  process.exit(1);
});
