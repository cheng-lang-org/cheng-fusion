/**
 * cheng-web-oracle — Chrome Oracle 对拍工具
 *
 * 比较 Cheng Web Runtime 输出与 Chrome headless 浏览器的输出，
 * 覆盖四个维度：DOM 树、Layout box、事件追踪、截图。
 *
 * 用法: node --experimental-strip-types tools/cheng-web-oracle.ts [options]
 */

import { readFileSync, writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { basename, resolve, join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// ── 类型定义 ──

export interface DomNode {
  nodeId: number;
  kind: number;         // 1=Document, 2=Element, 3=Text
  tagName: string;
  textContent: string;
  attributes: Record<string, string>;
  children: DomNode[];
}

export interface LayoutBox {
  nodeId: number;
  tagName: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EventTrace {
  type: string;
  target: number;
  eventPhase: number;   // 1=Capture, 2=Target, 3=Bubble
  timestamp: number;
}

export interface ScreenshotBuffer {
  pixels: Buffer;       // RGBA
  width: number;
  height: number;
}

export interface DiffItem {
  path: string;
  expected: string;
  actual: string;
}

export interface DiffReport {
  passed: boolean;
  totalNodes: number;
  matchedNodes: number;
  diffs: DiffItem[];
}

export interface DomOracleReport {
  timestamp: string;
  source: { cheng: string; chrome: string };
  normalization: {
    chengPath: string;
    chromePath: string;
    chengTotalNodes: number;
    chromeTotalNodes: number;
    comparedRootTag: string;
  };
  treeMetrics: {
    comparedNodes: number;
    fullyMatchedNodes: number;
    tagNameMatches: number;
    tagNameMismatches: number;
    attrMismatches: number;
    textContentMismatches: number;
    childrenCountMismatches: number;
    matchRate: number;
    tagNameMatchRate: number;
  };
  diffs: DiffItem[];
  diffCount: number;
  summary: string;
}

export interface ScreenshotDiff {
  passed: boolean;
  pixelDiffPercent: number;
  totalPixels: number;
  diffPixels: number;
  maxPixelDiff: number;
}

export interface OracleReport {
  timestamp: string;
  viewport: string;
  domDiff: DiffReport;
  layoutDiff: DiffReport;
  eventDiff: DiffReport;
  screenshotDiff: ScreenshotDiff;
  overallPassed: boolean;
}

export interface OracleOptions {
  chengDomPath: string;
  chromeDomPath: string;
  chengLayoutPath: string;
  chromeLayoutPath: string;
  chengEventsPath: string;
  chromeEventsPath: string;
  chengScreenshotPath: string;
  chromeScreenshotPath: string;
  viewport: string;
  tolerance: number;    // pixel tolerance for layout coordinate comparison
  positionTolerance: number;  // max Manhattan distance for position matching (default 50)
  outPath: string;
  format: string;       // "text" (default), "json", or "html"
  threshold: number;    // pass threshold percentage (default 95)
}

// ── DOM 比较 ──

export function compareDomSnapshots(chengDom: DomNode[], chromeDom: DomNode[]): DiffReport {
  const diffs: DiffItem[] = [];
  const total = Math.max(chengDom.length, chromeDom.length);

  function walk(chengNode: DomNode | undefined, chromeNode: DomNode | undefined, path: string) {
    if (!chengNode && !chromeNode) return;
    if (!chengNode) {
      diffs.push({ path, expected: "node", actual: "missing" });
      return;
    }
    if (!chromeNode) {
      diffs.push({ path, expected: "missing", actual: "node" });
      return;
    }
    if (chengNode.kind !== chromeNode.kind) {
      diffs.push({ path: `${path}.kind`, expected: String(chengNode.kind), actual: String(chromeNode.kind) });
    }
    if (chengNode.tagName !== chromeNode.tagName) {
      diffs.push({ path: `${path}.tagName`, expected: chengNode.tagName, actual: chromeNode.tagName });
    }
    if (chengNode.textContent !== chromeNode.textContent) {
      diffs.push({ path: `${path}.textContent`, expected: chengNode.textContent, actual: chromeNode.textContent });
    }
    const chengAttrs = Object.keys(chengNode.attributes || {}).sort();
    const chromeAttrs = Object.keys(chromeNode.attributes || {}).sort();
    if (chengAttrs.join(",") !== chromeAttrs.join(",")) {
      diffs.push({ path: `${path}.attributes`, expected: chengAttrs.join(","), actual: chromeAttrs.join(",") });
    } else {
      for (const key of chengAttrs) {
        if (chengNode.attributes[key] !== chromeNode.attributes[key]) {
          diffs.push({
            path: `${path}.attributes.${key}`,
            expected: chengNode.attributes[key],
            actual: chromeNode.attributes[key],
          });
        }
      }
    }
    const maxChildren = Math.max(
      chengNode.children?.length ?? 0,
      chromeNode.children?.length ?? 0,
    );
    for (let i = 0; i < maxChildren; i++) {
      walk(chengNode.children?.[i], chromeNode.children?.[i], `${path}.children[${i}]`);
    }
  }

  for (let i = 0; i < total; i++) {
    walk(chengDom[i], chromeDom[i], `root[${i}]`);
  }

  const matched = total - new Set(diffs.map(d => d.path.split(".")[0])).size;
  return { passed: diffs.length === 0, totalNodes: total, matchedNodes: matched, diffs };
}

// ── DOM 规范化（对齐 Cheng ⇄ Chrome 的树根） ──

export function normalizeDomForCompare(nodes: DomNode[]): { root: DomNode | null; path: string } {
  // Cheng runtime: [#document] → first child (div.container)
  if (nodes.length === 1 && nodes[0].tagName === "#document") {
    const child = nodes[0].children?.[0];
    return { root: child || null, path: `#document → ${child?.tagName ?? "null"}` };
  }
  // Chrome headless: [html] → body → first child (content root)
  if (nodes.length === 1 && nodes[0].tagName === "html") {
    const body = nodes[0].children?.find(c => c.tagName === "body");
    if (body && body.children && body.children.length > 0) {
      const container = body.children[0];
      return { root: container, path: `html → body → ${container.tagName}` };
    }
    if (body) return { root: body, path: "html → body" };
    return { root: nodes[0], path: "html" };
  }
  return { root: nodes[0] || null, path: "root[0]" };
}

function countDomNodes(nodes: DomNode[]): number {
  let count = 0;
  for (const n of nodes) {
    count++;
    if (n.children) for (const c of n.children) count += countDomNodes([c]);
  }
  return count;
}

// ── DOM 详细对比（规范化 + 分字段指标）──

export function compareDomSnapshotsDetailed(
  chengNodes: DomNode[],
  chromeNodes: DomNode[],
  chengFile: string,
  chromeFile: string,
): { report: DomOracleReport; diff: DiffReport } {
  const chengNorm = normalizeDomForCompare(chengNodes);
  const chromeNorm = normalizeDomForCompare(chromeNodes);

  const chengTotal = countDomNodes(chengNodes);
  const chromeTotal = countDomNodes(chromeNodes);

  const diffs: DiffItem[] = [];
  let tagNameMismatches = 0;
  let attrMismatches = 0;
  let textContentMismatches = 0;
  let childrenCountMismatches = 0;
  let comparedNodes = 0;
  let fullyMatchedNodes = 0;

  function walk(cheng: DomNode | undefined, chrome: DomNode | undefined, path: string) {
    comparedNodes++;
    let nodeMatched = true;

    if (!cheng && !chrome) {
      comparedNodes--;
      return;
    }
    if (!cheng) {
      diffs.push({ path, expected: "(cheng node)", actual: "missing" });
      return;
    }
    if (!chrome) {
      diffs.push({ path, expected: "missing", actual: "(chrome node)" });
      return;
    }

    // ── tagName ──
    if (cheng.tagName !== chrome.tagName) {
      diffs.push({ path: `${path}.tagName`, expected: cheng.tagName, actual: chrome.tagName });
      tagNameMismatches++;
      nodeMatched = false;
    }

    // ── attributes（全部 key 的差值） ──
    const chengKeys = Object.keys(cheng.attributes || {}).sort();
    const chromeKeys = Object.keys(chrome.attributes || {}).sort();
    const allKeys = [...new Set([...chengKeys, ...chromeKeys])].sort();
    let attrDiffCount = 0;
    for (const key of allKeys) {
      const cv = cheng.attributes?.[key];
      const chv = chrome.attributes?.[key];
      if (cv !== chv) {
        diffs.push({
          path: `${path}.attributes.${key}`,
          expected: cv ?? "(missing)",
          actual: chv ?? "(missing)",
        });
        attrDiffCount++;
      }
    }
    if (attrDiffCount > 0) {
      attrMismatches++;
      nodeMatched = false;
    }

    // ── textContent ──
    if (cheng.textContent !== chrome.textContent) {
      diffs.push({ path: `${path}.textContent`, expected: cheng.textContent, actual: chrome.textContent });
      textContentMismatches++;
      nodeMatched = false;
    }

    // ── children 数量 ──
    const chengCC = cheng.children?.length ?? 0;
    const chromeCC = chrome.children?.length ?? 0;
    if (chengCC !== chromeCC) childrenCountMismatches++;

    // ── 递归子节点（按位置匹配） ──
    const maxChildren = Math.max(chengCC, chromeCC);
    for (let i = 0; i < maxChildren; i++) {
      walk(cheng.children?.[i], chrome.children?.[i], `${path}.children[${i}]`);
    }

    if (nodeMatched) fullyMatchedNodes++;
  }

  if (chengNorm.root && chromeNorm.root) {
    walk(chengNorm.root, chromeNorm.root, "root");
  }

  const tagNameMatches = comparedNodes - tagNameMismatches;
  const attrMatchNodes = comparedNodes - attrMismatches;
  const textContentMatchNodes = comparedNodes - textContentMismatches;
  const matchRate = comparedNodes > 0 ? Math.round((fullyMatchedNodes / comparedNodes) * 10000) / 100 : 0;
  const tagNameMatchRate = comparedNodes > 0 ? Math.round((tagNameMatches / comparedNodes) * 10000) / 100 : 0;
  const truncated = diffs.length > 500;
  const displayDiffs = truncated ? diffs.slice(0, 500) : diffs;

  return {
    report: {
      timestamp: new Date().toISOString(),
      source: { cheng: chengFile, chrome: chromeFile },
      normalization: {
        chengPath: chengNorm.path,
        chromePath: chromeNorm.path,
        chengTotalNodes: chengTotal,
        chromeTotalNodes: chromeTotal,
        comparedRootTag: chengNorm.root?.tagName ?? "(null)",
      },
      treeMetrics: {
        comparedNodes,
        fullyMatchedNodes,
        tagNameMatches,
        tagNameMismatches,
        attrMismatches,
        textContentMismatches,
        childrenCountMismatches,
        matchRate,
        tagNameMatchRate,
      },
      diffs: displayDiffs,
      diffCount: diffs.length,
      summary: [
        `Normalized: ${chengNorm.path} (${chengTotal} Cheng nodes) ⇄ ${chromeNorm.path} (${chromeTotal} Chrome nodes)`,
        `Compared ${comparedNodes} nodes — ${fullyMatchedNodes} fully matched (${matchRate}%)`,
        `  tagName: ${tagNameMatches}/${comparedNodes} matched (${tagNameMatchRate}%)`,
        `  attributes: ${attrMatchNodes}/${comparedNodes} nodes without attr diffs`,
        `  textContent: ${textContentMatchNodes}/${comparedNodes} nodes without textContent diffs`,
        `  children count mismatches: ${childrenCountMismatches}`,
        `Total diffs: ${diffs.length}${truncated ? ` (first ${displayDiffs.length} shown)` : ""}`,
      ].join("\n"),
    },
    diff: {
      passed: diffs.length === 0,
      totalNodes: comparedNodes,
      matchedNodes: fullyMatchedNodes,
      diffs,
    },
  };
}

// ── Layout 比较 ──

/** Build a nodeId → tagName map from a DOM tree */
export function buildTagNameMap(domNodes: DomNode[]): Map<number, string> {
  const map = new Map<number, string>();
  function walk(nodes: DomNode[]) {
    for (const node of nodes) {
      if (node.kind === 2) map.set(node.nodeId, node.tagName);
      if (node.children) walk(node.children);
    }
  }
  walk(domNodes);
  return map;
}

/** Enrich LayoutBox[] with tagName from DOM data (cross-reference by nodeId) */
export function enrichLayoutBoxesWithDom(
  boxes: LayoutBox[],
  domData: DomNode[],
): LayoutBox[] {
  const tagMap = buildTagNameMap(domData);
  return boxes.map(b => ({
    ...b,
    tagName: b.tagName || tagMap.get(b.nodeId) || "",
  }));
}

/**
 * Compare layout boxes between Cheng and Chrome using tagName + position.
 *
 * Phase 1 — tagName + position matching:
 *   For each Cheng box, filter Chrome boxes by matching tagName
 *   (skip filter if tagName is empty). Pick closest by Manhattan
 *   distance within `positionTolerance`. Remove matched from pool.
 *
 * Phase 2 — size fallback for unmatched Cheng boxes:
 *   Match unmatched Cheng boxes to remaining Chrome boxes by
 *   width/height proximity.
 *
 * Phase 3 — print summary statistics to stdout.
 *
 * Returns a DiffReport compatible with the existing oracle pipeline.
 * `matchedNodes` counts how many Cheng boxes found a partner.
 * `totalNodes` = max(chengCount, chromeCount).
 */
export function compareLayoutBoxes(
  chengBoxes: LayoutBox[],
  chromeBoxes: LayoutBox[],
  tolerance: number = 1,
  positionTolerance: number = 50,
): DiffReport {
  const diffs: DiffItem[] = [];
  let matchedCount = 0;
  let totalPositionDelta = 0;
  let totalSizeDelta = 0;

  // Track which Chrome boxes are matched (by index)
  const chromeMatched = new Set<number>();

  // ── Phase 1: tagName + position matching ──
  const positionMatchedCheng: number[] = []; // indices of Cheng boxes matched in Phase 1

  for (let i = 0; i < chengBoxes.length; i++) {
    const cb = chengBoxes[i];
    let bestIdx = -1;
    let bestDist = positionTolerance;

    for (let j = 0; j < chromeBoxes.length; j++) {
      if (chromeMatched.has(j)) continue;
      const chb = chromeBoxes[j];

      // Filter by matching tagName when both sides have it
      if (cb.tagName && chb.tagName && cb.tagName !== chb.tagName) continue;

      const dist = Math.abs(cb.x - chb.x) + Math.abs(cb.y - chb.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = j;
      }
    }

    if (bestIdx >= 0) {
      const chb = chromeBoxes[bestIdx];
      chromeMatched.add(bestIdx);
      positionMatchedCheng.push(i);
      matchedCount++;

      totalPositionDelta += bestDist;
      totalSizeDelta += Math.abs(cb.width - chb.width) + Math.abs(cb.height - chb.height);

      const label = `${cb.tagName || "?"}@(${cb.x},${cb.y})`;
      if (Math.abs(cb.x - chb.x) > tolerance)
        diffs.push({ path: `${label}.x`, expected: String(cb.x), actual: String(chb.x) });
      if (Math.abs(cb.y - chb.y) > tolerance)
        diffs.push({ path: `${label}.y`, expected: String(cb.y), actual: String(chb.y) });
      if (Math.abs(cb.width - chb.width) > tolerance)
        diffs.push({ path: `${label}.width`, expected: String(cb.width), actual: String(chb.width) });
      if (Math.abs(cb.height - chb.height) > tolerance)
        diffs.push({ path: `${label}.height`, expected: String(cb.height), actual: String(chb.height) });
    }
  }

  // ── Phase 2: size fallback for unmatched Cheng boxes ──
  const sizeMatchedCheng: number[] = [];

  for (let i = 0; i < chengBoxes.length; i++) {
    if (positionMatchedCheng.includes(i)) continue;
    const cb = chengBoxes[i];
    let bestIdx = -1;
    let bestSizeDist = positionTolerance; // size tolerance ~ positionTolerance/2

    for (let j = 0; j < chromeBoxes.length; j++) {
      if (chromeMatched.has(j)) continue;
      const chb = chromeBoxes[j];

      // Filter by matching tagName when both sides have it
      if (cb.tagName && chb.tagName && cb.tagName !== chb.tagName) continue;

      const sizeDist = Math.abs(cb.width - chb.width) + Math.abs(cb.height - chb.height);
      if (sizeDist < bestSizeDist) {
        bestSizeDist = sizeDist;
        bestIdx = j;
      }
    }

    if (bestIdx >= 0) {
      const chb = chromeBoxes[bestIdx];
      chromeMatched.add(bestIdx);
      sizeMatchedCheng.push(i);
      matchedCount++;

      totalSizeDelta += Math.abs(cb.width - chb.width) + Math.abs(cb.height - chb.height);

      const label = `${cb.tagName || "?"}@(${cb.x},${cb.y})`;
      if (Math.abs(cb.width - chb.width) > tolerance)
        diffs.push({ path: `${label}.width`, expected: String(cb.width), actual: String(chb.width) });
      if (Math.abs(cb.height - chb.height) > tolerance)
        diffs.push({ path: `${label}.height`, expected: String(cb.height), actual: String(chb.height) });
    } else {
      diffs.push({ path: `${cb.tagName || "?"}@(${cb.x},${cb.y})`, expected: "present", actual: "missing (Chrome)" });
    }
  }

  // ── Remaining unmatched Chrome boxes ──
  let unmatchedChrome = 0;
  for (let j = 0; j < chromeBoxes.length; j++) {
    if (!chromeMatched.has(j)) {
      const chb = chromeBoxes[j];
      diffs.push({ path: `${chb.tagName || "?"}@(${chb.x},${chb.y})`, expected: "missing (Cheng)", actual: "present" });
      unmatchedChrome++;
    }
  }

  const total = Math.max(chengBoxes.length, chromeBoxes.length);
  const positionMatchedCount = positionMatchedCheng.length;
  const sizeMatchedCount = sizeMatchedCheng.length;
  const avgPositionDelta = positionMatchedCount > 0
    ? Math.round((totalPositionDelta / positionMatchedCount) * 10) / 10
    : 0;
  const avgSizeDelta = matchedCount > 0
    ? Math.round((totalSizeDelta / matchedCount) * 10) / 10
    : 0;

  // ── Phase 3: statistics ──
  const matchRate = total > 0 ? (matchedCount / chengBoxes.length) * 100 : 0;
  process.stdout.write(`\n  Layout Comparison Statistics:\n`);
  process.stdout.write(`    Phase 1 (position): ${positionMatchedCount}/${chengBoxes.length} (${chengBoxes.length > 0 ? (positionMatchedCount / chengBoxes.length * 100).toFixed(1) : "0.0"}%)\n`);
  process.stdout.write(`    Phase 2 (size):     ${sizeMatchedCount}/${chengBoxes.length} (${chengBoxes.length > 0 ? (sizeMatchedCount / chengBoxes.length * 100).toFixed(1) : "0.0"}%)\n`);
  process.stdout.write(`    Total matched:      ${matchedCount}/${chengBoxes.length} (${matchRate.toFixed(1)}%)\n`);
  process.stdout.write(`    Unmatched Cheng:    ${chengBoxes.length - matchedCount}\n`);
  process.stdout.write(`    Unmatched Chrome:   ${unmatchedChrome}\n`);
  process.stdout.write(`    Avg position delta: ${avgPositionDelta}px\n`);
  process.stdout.write(`    Avg size delta:     ${avgSizeDelta}px\n`);

  // TagName group statistics
  const tagStats: Record<string, { cheng: number; matched: number }> = {};
  for (const cb of chengBoxes) {
    const tag = cb.tagName || "(unknown)";
    if (!tagStats[tag]) tagStats[tag] = { cheng: 0, matched: 0 };
    tagStats[tag].cheng++;
  }
  // Count matched by tagName (from Phase 1 + Phase 2)
  for (const i of positionMatchedCheng) {
    const tag = chengBoxes[i].tagName || "(unknown)";
    if (tagStats[tag]) tagStats[tag].matched++;
  }
  for (const i of sizeMatchedCheng) {
    const tag = chengBoxes[i].tagName || "(unknown)";
    if (tagStats[tag]) tagStats[tag].matched++;
  }
  const sortedTags = Object.entries(tagStats).sort((a, b) => b[1].cheng - a[1].cheng);
  for (const [tag, st] of sortedTags) {
    process.stdout.write(`    [${tag}] ${st.matched}/${st.cheng} matched (${st.cheng > 0 ? (st.matched / st.cheng * 100).toFixed(0) : "0"}%)\n`);
  }

  return {
    passed: diffs.length === 0,
    totalNodes: total,
    matchedNodes: matchedCount,
    diffs,
  };
}

// ── 事件比较 ──

export function compareEventTraces(
  chengEvents: EventTrace[],
  chromeEvents: EventTrace[],
): DiffReport {
  const diffs: DiffItem[] = [];
  const total = Math.max(chengEvents.length, chromeEvents.length);

  for (let i = 0; i < total; i++) {
    const cheng = chengEvents[i];
    const chrome = chromeEvents[i];
    const prefix = `event[${i}]`;
    if (!cheng) { diffs.push({ path: prefix, expected: "event", actual: "missing" }); continue; }
    if (!chrome) { diffs.push({ path: prefix, expected: "missing", actual: "event" }); continue; }
    if (cheng.type !== chrome.type) {
      diffs.push({ path: `${prefix}.type`, expected: cheng.type, actual: chrome.type });
    }
    if (cheng.target !== chrome.target) {
      diffs.push({ path: `${prefix}.target`, expected: String(cheng.target), actual: String(chrome.target) });
    }
    if (cheng.eventPhase !== chrome.eventPhase) {
      diffs.push({ path: `${prefix}.phase`, expected: String(cheng.eventPhase), actual: String(chrome.eventPhase) });
    }
  }

  const matched = total - new Set(diffs.map(d => d.path.split(".")[0])).size;
  return { passed: diffs.length === 0, totalNodes: total, matchedNodes: matched, diffs };
}

// ── 截图比较 ──

// 同步比较（要求尺寸相同，否则返回 100% diff）
export function compareScreenshots(
  chengBuf: ScreenshotBuffer,
  chromeBuf: ScreenshotBuffer,
  tolerance: number = 5,
): ScreenshotDiff {
  if (chengBuf.width !== chromeBuf.width || chengBuf.height !== chromeBuf.height) {
    return { passed: false, pixelDiffPercent: 100, totalPixels: 0, diffPixels: 0, maxPixelDiff: 255 };
  }

  const chengPixels = chengBuf.pixels;
  const chromePixels = chromeBuf.pixels;
  const totalPixels = chengBuf.width * chengBuf.height;
  let diffPixels = 0;
  let maxPixelDiff = 0;

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    const rDiff = Math.abs(chengPixels[offset] - chromePixels[offset]);
    const gDiff = Math.abs(chengPixels[offset + 1] - chromePixels[offset + 1]);
    const bDiff = Math.abs(chengPixels[offset + 2] - chromePixels[offset + 2]);
    const aDiff = Math.abs(chengPixels[offset + 3] - chromePixels[offset + 3]);
    const maxChannel = Math.max(rDiff, gDiff, bDiff, aDiff);
    if (maxChannel > tolerance) {  // tolerance per channel (default 5/255)
      diffPixels++;
      if (maxChannel > maxPixelDiff) maxPixelDiff = maxChannel;
    }
  }

  const pixelDiffPercent = totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0;
  return {
    passed: pixelDiffPercent < 1,  // <1% 像素差异视为通过
    pixelDiffPercent,
    totalPixels,
    diffPixels,
    maxPixelDiff,
  };
}

// 异步版 — 自动缩放使尺寸一致后再比较
async function resizeRawBuffer(
  pixels: Buffer, srcW: number, srcH: number, dstW: number, dstH: number,
): Promise<Buffer> {
  const img = sharp(pixels, { raw: { width: srcW, height: srcH, channels: 4 } });
  return await img.resize(dstW, dstH, { fit: "fill" }).raw().toBuffer();
}

export async function compareScreenshotsAutoScale(
  chengBuf: ScreenshotBuffer,
  chromeBuf: ScreenshotBuffer,
  tolerance: number = 5,
): Promise<ScreenshotDiff> {
  let chengPixels = chengBuf.pixels;
  let chromePixels = chromeBuf.pixels;
  let cw = chengBuf.width;
  let ch = chengBuf.height;
  let gw = chromeBuf.width;
  let gh = chromeBuf.height;

  // 缩放较大者至较小者的尺寸
  if (cw !== gw || ch !== gh) {
    const targetW = Math.min(cw, gw);
    const targetH = Math.min(ch, gh);
    if (cw !== targetW || ch !== targetH) {
      chengPixels = await resizeRawBuffer(chengPixels, cw, ch, targetW, targetH);
      cw = targetW;
      ch = targetH;
    }
    if (gw !== targetW || gh !== targetH) {
      chromePixels = await resizeRawBuffer(chromePixels, gw, gh, targetW, targetH);
      gw = targetW;
      gh = targetH;
    }
  }

  return compareScreenshots(
    { pixels: chengPixels, width: cw, height: ch },
    { pixels: chromePixels, width: gw, height: gh },
    tolerance,
  );
}

// ── 文件路径版截图比较（自动缩放）──

export async function compareScreenshotsFromFiles(
  chengPath: string,
  chromePath: string,
  tolerance: number = 5,
): Promise<ScreenshotDiff> {
  const chengRaw = readFileSync(chengPath);
  const chromeRaw = readFileSync(chromePath);

  // 格式：8 字节头 (UInt32LE width + height) + RGBA 像素数据
  const chengW = chengRaw.readUInt32LE(0);
  const chengH = chengRaw.readUInt32LE(4);
  const chromeW = chromeRaw.readUInt32LE(0);
  const chromeH = chromeRaw.readUInt32LE(4);

  return await compareScreenshotsAutoScale(
    { pixels: chengRaw.subarray(8), width: chengW, height: chengH },
    { pixels: chromeRaw.subarray(8), width: chromeW, height: chromeH },
    tolerance,
  );
}

// 同步版本（仅用于相同尺寸的 fixture 测试）
export function compareScreenshotsFromFilesSync(
  chengPath: string,
  chromePath: string,
  tolerance: number = 5,
): ScreenshotDiff {
  const chengRaw = readFileSync(chengPath);
  const chromeRaw = readFileSync(chromePath);
  const chengW = chengRaw.readUInt32LE(0);
  const chengH = chengRaw.readUInt32LE(4);
  const chromeW = chromeRaw.readUInt32LE(0);
  const chromeH = chromeRaw.readUInt32LE(4);
  return compareScreenshots(
    { pixels: chengRaw.subarray(8), width: chengW, height: chengH },
    { pixels: chromeRaw.subarray(8), width: chromeW, height: chromeH },
    tolerance,
  );
}

// ── HTML 报告生成 ──

export function generateHtmlReport(report: OracleReport): string {
  const dims = [
    { name: "DOM", diff: report.domDiff },
    { name: "Layout", diff: report.layoutDiff },
    { name: "Events", diff: report.eventDiff },
  ];

  const activeDims = dims.filter(d => d.diff.totalNodes > 0);
  const screenshotHasData = report.screenshotDiff.totalPixels > 0;
  const passedDims = activeDims.filter(d => d.diff.passed).length;
  const screenshotPassed = screenshotHasData ? report.screenshotDiff.passed : true;
  const totalActive = activeDims.length + (screenshotHasData ? 1 : 0);
  const totalPassed = passedDims + (screenshotPassed ? 1 : 0);
  const overallPass = report.overallPassed;

  const dimRows = dims.map(d => {
    const hasData = d.diff.totalNodes > 0;
    const pct = hasData ? ((d.diff.matchedNodes / d.diff.totalNodes) * 100).toFixed(1) : "N/A";
    const detail = hasData
      ? `${d.diff.matchedNodes}/${d.diff.totalNodes} matched (${pct}%), ${d.diff.diffs.length} diffs`
      : "no data";
    const status = hasData ? (d.diff.passed ? "PASS" : "FAIL") : "SKIP";
    return { name: d.name, status, detail, hasData };
  });

  const screenshotPassDisplay = screenshotHasData
    ? (report.screenshotDiff.pixelDiffPercent < 50 ? "PASS" : "FAIL")
    : "SKIP";
  const screenshotDetail = screenshotHasData
    ? `${report.screenshotDiff.diffPixels}/${report.screenshotDiff.totalPixels} diff pixels (${report.screenshotDiff.pixelDiffPercent.toFixed(1)}%)`
    : "no data";

  // Collect all diffs
  const allDiffs: { dim: string; path: string; expected: string; actual: string }[] = [];
  for (const diff of report.domDiff.diffs) allDiffs.push({ dim: "DOM", ...diff });
  for (const diff of report.layoutDiff.diffs) allDiffs.push({ dim: "Layout", ...diff });
  for (const diff of report.eventDiff.diffs) allDiffs.push({ dim: "Events", ...diff });

  const topDiffs = allDiffs.slice(0, 10);

  const color = (status: string): string =>
    status === "PASS" ? "#4CAF50" : status === "FAIL" ? "#F44336" : "#9E9E9E";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cheng Web Oracle Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 20px; background: #f5f5f5; color: #333; }
  .container { max-width: 960px; margin: 0 auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 24px; }
  h1 { margin-top: 0; font-size: 1.5em; }
  .overall { font-size: 1.2em; font-weight: bold; padding: 12px 16px; border-radius: 6px; margin: 16px 0; }
  .overall.pass { background: #E8F5E9; color: #2E7D32; }
  .overall.fail { background: #FFEBEE; color: #C62828; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e0e0e0; }
  th { background: #fafafa; font-weight: 600; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 0.85em; font-weight: 600; color: #fff; }
  .meta { color: #666; font-size: 0.9em; margin-bottom: 16px; }
  .diffs { margin-top: 16px; }
  .diff-item { background: #fafafa; border-left: 3px solid #F44336; padding: 8px 12px; margin: 4px 0; font-family: monospace; font-size: 0.9em; }
  .diff-dim { font-weight: 600; }
</style>
</head>
<body>
<div class="container">
  <h1>Cheng Web Runtime vs Chrome Headless — Oracle Report</h1>
  <div class="meta">Viewport: ${report.viewport} | Timestamp: ${report.timestamp}</div>
  <div class="overall ${overallPass ? 'pass' : 'fail'}">
    Overall: ${overallPass ? "PASS" : "FAIL"} &mdash; ${totalPassed}/${totalActive} dimensions passed
  </div>

  <table>
    <tr><th>Dimension</th><th>Status</th><th>Details</th></tr>
    ${dimRows.map(d => `<tr>
      <td>${d.name}</td>
      <td><span class="badge" style="background:${color(d.status)}">${d.status}</span></td>
      <td>${d.detail}</td>
    </tr>`).join("\n    ")}
    <tr>
      <td>Screenshot</td>
      <td><span class="badge" style="background:${color(screenshotPassDisplay)}">${screenshotPassDisplay}</span></td>
      <td>${screenshotDetail}</td>
    </tr>
  </table>

  ${topDiffs.length > 0 ? `
  <div class="diffs">
    <h3>Top ${topDiffs.length} Differences</h3>
    ${topDiffs.map(d => `
    <div class="diff-item">
      <span class="diff-dim">[${d.dim}]</span> ${d.path}<br>
      expected: ${d.expected}<br>
      actual: &nbsp; ${d.actual}
    </div>`).join("\n    ")}
  </div>` : '<p>No differences found.</p>'}
</div>
</body>
</html>`;
}

// ── 主入口 ──

export async function runOracle(options: OracleOptions): Promise<OracleReport> {
  const report: OracleReport = {
    timestamp: new Date().toISOString(),
    viewport: options.viewport,
    domDiff: { passed: false, totalNodes: 0, matchedNodes: 0, diffs: [] },
    layoutDiff: { passed: false, totalNodes: 0, matchedNodes: 0, diffs: [] },
    eventDiff: { passed: false, totalNodes: 0, matchedNodes: 0, diffs: [] },
    screenshotDiff: { passed: false, pixelDiffPercent: 100, totalPixels: 0, diffPixels: 0, maxPixelDiff: 0 },
    overallPassed: false,
  };

  if (options.chengDomPath && options.chromeDomPath) {
    let chengDom = JSON.parse(readFileSync(options.chengDomPath, "utf8"));
    let chromeDom = JSON.parse(readFileSync(options.chromeDomPath, "utf8"));
    // Ensure both are arrays (Cheng dump is a single #document object, Chrome is [html])
    if (!Array.isArray(chengDom)) chengDom = [chengDom];
    if (!Array.isArray(chromeDom)) chromeDom = [chromeDom];
    report.domDiff = compareDomSnapshotsDetailed(
        chengDom, chromeDom, options.chengDomPath, options.chromeDomPath,
      ).diff;
  }

  if (options.chengLayoutPath && options.chromeLayoutPath) {
    let chengLayout = JSON.parse(readFileSync(options.chengLayoutPath, "utf8"));
    let chromeLayout = JSON.parse(readFileSync(options.chromeLayoutPath, "utf8"));

    // Enrich with tagName from DOM data (cross-reference by nodeId)
    if (options.chengDomPath) {
      const chengDom = JSON.parse(readFileSync(options.chengDomPath, "utf8"));
      chengLayout = enrichLayoutBoxesWithDom(chengLayout, Array.isArray(chengDom) ? chengDom : [chengDom]);
    }
    if (options.chromeDomPath) {
      const chromeDom = JSON.parse(readFileSync(options.chromeDomPath, "utf8"));
      chromeLayout = enrichLayoutBoxesWithDom(chromeLayout, Array.isArray(chromeDom) ? chromeDom : [chromeDom]);
    }

    const positionTol = options.positionTolerance || 50;
    report.layoutDiff = compareLayoutBoxes(chengLayout, chromeLayout, options.tolerance, positionTol);
  }

  if (options.chengEventsPath && options.chromeEventsPath) {
    const chengEvents = JSON.parse(readFileSync(options.chengEventsPath, "utf8"));
    const chromeEvents = JSON.parse(readFileSync(options.chromeEventsPath, "utf8"));
    report.eventDiff = compareEventTraces(chengEvents, chromeEvents);
  }

  if (options.chengScreenshotPath && options.chromeScreenshotPath) {
    report.screenshotDiff = await compareScreenshotsFromFiles(
      options.chengScreenshotPath, options.chromeScreenshotPath,
    );
  }

  // Overall pass: only check dimensions that have data
  const dimsWithData: { passed: boolean }[] = [];
  if (options.chengDomPath && options.chromeDomPath) dimsWithData.push(report.domDiff);
  if (options.chengLayoutPath && options.chromeLayoutPath) dimsWithData.push(report.layoutDiff);
  if (options.chengEventsPath && options.chromeEventsPath) dimsWithData.push(report.eventDiff);
  if (options.chengScreenshotPath && options.chromeScreenshotPath) dimsWithData.push(report.screenshotDiff);
  report.overallPassed = dimsWithData.length > 0 && dimsWithData.every(d => d.passed);

  if (options.outPath) {
    writeFileSync(options.outPath, JSON.stringify(report, null, 2));
  }

  return report;
}

// ── CLI ──

function parseArgs(): OracleOptions {
  const args = process.argv.slice(2);
  const opts: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "true";
      opts[key] = val;
    }
  }
  return {
    chengDomPath: opts["cheng-dom"] || "",
    chromeDomPath: opts["chrome-dom"] || "",
    chengLayoutPath: opts["cheng-layout"] || "",
    chromeLayoutPath: opts["chrome-layout"] || "",
    chengEventsPath: opts["cheng-events"] || "",
    chromeEventsPath: opts["chrome-events"] || "",
    chengScreenshotPath: opts["cheng-screenshot"] || "",
    chromeScreenshotPath: opts["chrome-screenshot"] || "",
    viewport: opts["viewport"] || "800x600",
    tolerance: parseInt(opts["tolerance"] || "1"),
    positionTolerance: parseInt(opts["position-tolerance"] || "50"),
    outPath: opts["out"] || "",
    format: opts["format"] || "text",
    threshold: parseFloat(opts["threshold"] || "95"),
  };
}

function printUsage() {
  process.stdout.write(`cheng-web-oracle — Chrome Oracle 对拍工具

用法: node --experimental-strip-types tools/cheng-web-oracle.ts [options]

选项:
  --cheng-dom <path>        Cheng runtime DOM snapshot JSON
  --chrome-dom <path>       Chrome headless DOM snapshot JSON
  --cheng-layout <path>     Cheng runtime layout boxes JSON
  --chrome-layout <path>    Chrome headless layout boxes JSON
  --cheng-events <path>     Cheng runtime event trace JSON
  --chrome-events <path>    Chrome headless event trace JSON
  --cheng-screenshot <path> Cheng runtime surface buffer (raw RGBA)
  --chrome-screenshot <path> Chrome headless screenshot (raw RGBA)
  --viewport <WxH>          Viewport size (default: 800x600)
  --tolerance <px>          Layout coordinate pixel tolerance (default: 1)
  --position-tolerance <px> Layout position matching Manhattan distance (default: 50)
  --format <mode>           Output format: text (default), json, html
  --threshold <pct>         Pass threshold percentage (default: 95)
  --out <path>              Output file path (for json/html format)
  --golden <save|compare>   Golden file mode: save or compare
  --golden-path <path>      Path to golden file (default: oracle-golden.json)
  --project <path>          Project path for golden mode
  --help                    显示此帮助
  --cheng-dump              从 Cheng 二进制运行 dump 模式并比较
  --project <dir>           (配合 --cheng-dump) 项目目录
  --build-script <path>     (配合 --cheng-dump) cheng-web-build 脚本路径

Golden 模式:
  --golden save --project <path>    Save current build metadata as golden
  --golden compare --project <path> Compare current build against golden

至少需要一对 DOM/Layout/Events/Screenshot 输入才能进行比较。

Compare 模式（像素级对比）:
  --compare                    启用对比模式
  --cheng-dump <dir>           Cheng dump 输出目录（dom_cheng.json 等）
  --chrome-capture <dir>       Chrome capture 目录（dom_chrome.json 等）
  --tolerance <px>             Layout 容差像素，默认 2
  --viewport <WxH>             视口大小，默认 800x600
`);
}

// ── Golden file management ──

export interface GoldenRecord {
  schema: string;
  timestamp: string;
  project: string;
  chengSourceLines: number;
  objBytes: number;
  binaryBytes: number;
  transpilePassed: boolean;
  compilePassed: boolean;
  linkPassed: boolean;
}

export function loadGolden(path: string): GoldenRecord | null {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function saveGolden(path: string, record: GoldenRecord): void {
  writeFileSync(path, JSON.stringify(record, null, 2) + "\n");
}

export function compareGolden(actual: GoldenRecord, expected: GoldenRecord): DiffReport {
  const diffs: DiffItem[] = [];
  const fields: (keyof GoldenRecord)[] = [
    "chengSourceLines", "objBytes", "binaryBytes",
    "transpilePassed", "compilePassed", "linkPassed",
  ];
  for (const field of fields) {
    if (actual[field] !== expected[field]) {
      diffs.push({
        path: field,
        expected: String(expected[field]),
        actual: String(actual[field]),
      });
    }
  }
  return {
    passed: diffs.length === 0,
    totalNodes: fields.length,
    matchedNodes: fields.length - diffs.length,
    diffs,
  };
}

export function printRichReport(report: OracleReport): void {
  const dimensions: { name: string; passed: boolean; detail: string; hasData: boolean }[] = [];

  // DOM dimension
  {
    const d = report.domDiff;
    const hasData = d.totalNodes > 0;
    const diffCount = d.diffs.length;
    const dimPassed = hasData ? d.passed : true;
    const pct = hasData ? ((d.matchedNodes / d.totalNodes) * 100).toFixed(1) : "N/A";
    const detail = hasData ? `${d.matchedNodes}/${d.totalNodes} matched (${pct}%), ${diffCount} diffs` : "no data";
    dimensions.push({ name: "DOM", passed: dimPassed, detail, hasData });
  }

  // Layout dimension
  {
    const d = report.layoutDiff;
    const hasData = d.totalNodes > 0;
    const diffCount = d.diffs.length;
    const dimPassed = hasData ? d.passed : true;
    const pct = hasData ? ((d.matchedNodes / d.totalNodes) * 100).toFixed(1) : "N/A";
    const detail = hasData ? `${d.matchedNodes}/${d.totalNodes} matched (${pct}%), ${diffCount} diffs` : "no data";
    dimensions.push({ name: "Layout", passed: dimPassed, detail, hasData });
  }

  // Events dimension
  {
    const d = report.eventDiff;
    const hasData = d.totalNodes > 0;
    const diffCount = d.diffs.length;
    const dimPassed = hasData ? d.passed : true;
    const pct = hasData ? ((d.matchedNodes / d.totalNodes) * 100).toFixed(1) : "N/A";
    const detail = hasData ? `${d.matchedNodes}/${d.totalNodes} matched (${pct}%), ${diffCount} diffs` : "no data";
    dimensions.push({ name: "Events", passed: dimPassed, detail, hasData });
  }

  // Screenshot dimension
  {
    const d = report.screenshotDiff;
    const hasData = d.totalPixels > 0;
    const dimPassed = hasData ? d.passed : true;
    const detail = hasData ? `${d.diffPixels}/${d.totalPixels} diff pixels (${d.pixelDiffPercent.toFixed(2)}%), max channel diff: ${d.maxPixelDiff}` : "no data";
    dimensions.push({ name: "Screenshot", passed: dimPassed, detail, hasData });
  }

  const activeDimensions = dimensions.filter(d => d.hasData);

  const separator = "─".repeat(60);

  process.stdout.write(`\n${separator}\n`);
  process.stdout.write("  Cheng Web Runtime vs Chrome Headless — Oracle Report\n");
  process.stdout.write(`  Viewport: ${report.viewport}  |  ${report.timestamp}\n`);
  process.stdout.write(`${separator}\n\n`);

  // Overall summary
  const activeCount = activeDimensions.length;
  const passedCount = activeDimensions.filter(d => d.passed).length;
  const allPassed = activeCount === 0 || passedCount === activeCount;
  process.stdout.write(`  Overall: ${allPassed ? "PASS" : "FAIL"}  (${passedCount}/${activeCount} dimensions with data passed)\n\n`);

  // Per-dimension summary
  process.stdout.write("  Dimension Breakdown:\n");
  for (const d of dimensions) {
    process.stdout.write(`    ${d.hasData ? (d.passed ? "[PASS]" : "[FAIL]") : "[SKIP]"} ${d.name}: ${d.detail}\n`);
  }

  // Top diffs by dimension
  const allDiffs: { dim: string; path: string; expected: string; actual: string }[] = [];
  for (const diff of report.domDiff.diffs) allDiffs.push({ dim: "DOM", ...diff });
  for (const diff of report.layoutDiff.diffs) allDiffs.push({ dim: "Layout", ...diff });
  for (const diff of report.eventDiff.diffs) allDiffs.push({ dim: "Events", ...diff });

  if (allDiffs.length > 0) {
    process.stdout.write(`\n  Top ${Math.min(5, allDiffs.length)} Differences:\n`);
    const top = allDiffs.slice(0, 5);
    for (let i = 0; i < top.length; i++) {
      const d = top[i];
      process.stdout.write(`    ${i + 1}. [${d.dim}] ${d.path}\n`);
      process.stdout.write(`       expected: ${d.expected}\n`);
      process.stdout.write(`       actual:   ${d.actual}\n`);
    }
  }

  // Screenshot detail
  if (report.screenshotDiff.totalPixels > 0 && !report.screenshotDiff.passed) {
    process.stdout.write(`\n  Screenshot: ${report.screenshotDiff.diffPixels}/${report.screenshotDiff.totalPixels} pixels differ (${report.screenshotDiff.pixelDiffPercent.toFixed(2)}%)\n`);
  }

  process.stdout.write(`\n${separator}\n\n`);
}

// ── Golden mode ──

function runGoldenMode(args: string[]): void {
  const goldenIdx = args.indexOf("--golden");
  if (goldenIdx < 0 || goldenIdx + 1 >= args.length) {
    process.stderr.write("error: --golden requires 'save' or 'compare' argument\n");
    process.exit(1);
  }
  const subcommand = args[goldenIdx + 1];
  const goldenPathIdx = args.indexOf("--golden-path");
  const goldenPath = goldenPathIdx >= 0 && goldenPathIdx + 1 < args.length
    ? args[goldenPathIdx + 1]
    : "oracle-golden.json";

  if (subcommand === "save") {
    // Build and capture current state
    const projectIdx = args.indexOf("--project");
    if (projectIdx < 0 || projectIdx + 1 >= args.length) {
      process.stderr.write("error: --golden save requires --project <path>\n");
      process.exit(1);
    }
    const project = args[projectIdx + 1];
    const capturedDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "oracle", "captured");
    const capturePath = join(capturedDir, `${basename(resolve(project))}-capture.json`);

    if (!existsSync(capturePath)) {
      process.stderr.write(`error: capture file not found (run --capture first): ${capturePath}\n`);
      process.exit(1);
    }

    const capture = JSON.parse(readFileSync(capturePath, "utf8"));
    const golden: GoldenRecord = {
      schema: "cheng-web-oracle-golden-v1",
      timestamp: new Date().toISOString(),
      project: capture.project,
      chengSourceLines: capture.chengSourceLines,
      objBytes: capture.objBytes,
      binaryBytes: capture.binaryBytes,
      transpilePassed: capture.transpilePassed,
      compilePassed: capture.compilePassed,
      linkPassed: capture.linkPassed,
    };
    saveGolden(goldenPath, golden);
    process.stdout.write(`Golden saved to: ${goldenPath}\n`);
    process.stdout.write(`  project:        ${golden.project}\n`);
    process.stdout.write(`  chengSourceLines: ${golden.chengSourceLines}\n`);
    process.stdout.write(`  objBytes:         ${golden.objBytes}\n`);
    process.stdout.write(`  binaryBytes:      ${golden.binaryBytes}\n`);
    process.exit(0);
  } else if (subcommand === "compare") {
    // Compare current state against golden
    const projectIdx = args.indexOf("--project");
    if (projectIdx < 0 || projectIdx + 1 >= args.length) {
      process.stderr.write("error: --golden compare requires --project <path>\n");
      process.exit(1);
    }
    const project = args[projectIdx + 1];
    const capturedDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "oracle", "captured");
    const capturePath = join(capturedDir, `${basename(resolve(project))}-capture.json`);

    if (!existsSync(capturePath)) {
      process.stderr.write(`error: capture file not found (run --capture first): ${capturePath}\n`);
      process.exit(1);
    }

    const golden = loadGolden(goldenPath);
    if (!golden) {
      process.stderr.write(`error: cannot load golden file: ${goldenPath}\n`);
      process.exit(1);
    }

    const capture = JSON.parse(readFileSync(capturePath, "utf8"));
    const actual: GoldenRecord = {
      schema: "cheng-web-oracle-golden-v1",
      timestamp: new Date().toISOString(),
      project: capture.project,
      chengSourceLines: capture.chengSourceLines,
      objBytes: capture.objBytes,
      binaryBytes: capture.binaryBytes,
      transpilePassed: capture.transpilePassed,
      compilePassed: capture.compilePassed,
      linkPassed: capture.linkPassed,
    };
    const diff = compareGolden(actual, golden);

    const separator = "=".repeat(60);
    process.stdout.write(`\n${separator}\n`);
    process.stdout.write("  Cheng Web Oracle — Golden File Comparison\n");
    process.stdout.write(`${separator}\n\n`);
    process.stdout.write(`  Project: ${actual.project}\n`);
    process.stdout.write(`  Golden:  ${goldenPath}\n\n`);
    process.stdout.write(`  ${diff.passed ? "PASS" : "FAIL"}  (${diff.matchedNodes}/${diff.totalNodes} fields matched)\n\n`);

    if (diff.diffs.length > 0) {
      process.stdout.write("  Differences:\n");
      for (const d of diff.diffs) {
        process.stdout.write(`    ${d.path}: expected=${d.expected} actual=${d.actual}\n`);
      }
      process.stdout.write("\n");
    }

    process.stdout.write(`${separator}\n\n`);
    process.exit(diff.passed ? 0 : 1);
  } else {
    process.stderr.write(`error: unknown --golden subcommand '${subcommand}'. Use 'save' or 'compare'.\n`);
    process.exit(1);
  }
}

// ── Cheng Dump Mode ──

export interface ChengDumpOptions {
  projectDir: string;
  chromeDomPath: string;
  chromeLayoutPath: string;
  chromeEventsPath: string;
  chromeScreenshotPath: string;
  viewport: string;
  tolerance: number;
  positionTolerance: number;
  threshold: number;
  outPath: string;
  format: string;
  buildScript: string;
}

function parseChengDumpOutput(output: string): { domJson: string; layoutJson: string; pixelRows: string[] } {
  const domMatch = output.match(/---CHENG_DOM_DUMP---\n([\s\S]*?)\n---CHENG_LAYOUT_DUMP---/);
  const layoutMatch = output.match(/---CHENG_LAYOUT_DUMP---\n([\s\S]*?)\n---CHENG_SCREENSHOT_DUMP---/);
  const pixelMatch = output.match(/---CHENG_SCREENSHOT_DUMP---\n([\s\S]*?)\n---CHENG_DUMP_END---/);

  return {
    domJson: domMatch ? domMatch[1].trim() : "[]",
    layoutJson: layoutMatch ? layoutMatch[1].trim() : "[]",
    pixelRows: pixelMatch ? pixelMatch[1].trim().split("\n").filter(r => r.startsWith("row:")) : [],
  };
}

function pixelRowsToRawRgba(pixelRows: string[], width: number, height: number): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(width, 0);
  header.writeUInt32LE(height, 4);
  const pixelData = Buffer.alloc(width * height * 4);
  let idx = 0;
  for (const row of pixelRows) {
    const values = row.replace("row: ", "").split(",").map(Number);
    for (let i = 0; i < values.length && idx < pixelData.length; i += 4) {
      pixelData[idx++] = values[i];     // R
      pixelData[idx++] = values[i + 1]; // G
      pixelData[idx++] = values[i + 2]; // B
      pixelData[idx++] = values[i + 3]; // A
    }
  }
  return Buffer.concat([header, pixelData]);
}

export async function runChengDump(options: ChengDumpOptions): Promise<OracleReport> {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(thisDir, "..");
  const buildScript = options.buildScript || join(repoRoot, "cheng-web-build");

  // Step 1: Build and run with dump mode
  const cmd = `"${buildScript}" --dump --run --emit cheng-web-source "${options.projectDir}" 2>/dev/null`;
  let rawOutput: string;
  try {
    rawOutput = execSync(cmd, { cwd: repoRoot, encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
  } catch (e: unknown) {
    const err = e as Error & { stdout?: string; stderr?: string };
    process.stderr.write(`error: cheng-web-build failed: ${err.message}\n`);
    if (err.stdout) process.stderr.write(err.stdout);
    if (err.stderr) process.stderr.write(err.stderr);
    process.exit(1);
  }

  // Step 2: Parse dump sections
  const parsed = parseChengDumpOutput(rawOutput);
  const tmpDir = mkdtempSync(join(tmpdir(), "cheng-oracle-"));
  const chengDomPath = join(tmpDir, "dom_cheng.json");
  const chengLayoutPath = join(tmpDir, "layout_cheng.json");
  const chengScreenshotPath = join(tmpDir, "screenshot_cheng.raw");

  writeFileSync(chengDomPath, parsed.domJson);
  writeFileSync(chengLayoutPath, parsed.layoutJson);

  // Show dump stats
  const domNodes = parsed.domJson === "[]" ? 0 : (parsed.domJson.match(/"nodeId"/g) || []).length;
  const layoutBoxes = parsed.layoutJson === "[]" ? 0 : (parsed.layoutJson.match(/"nodeId"/g) || []).length;
  process.stdout.write(`--- Cheng Dump Stats ---\n`);
  process.stdout.write(`  DOM nodes: ${domNodes}\n`);
  process.stdout.write(`  Layout boxes: ${layoutBoxes}\n`);
  process.stdout.write(`  Pixel rows: ${parsed.pixelRows.length}\n`);

  // Parse pixel rows into binary RGBA (if any pixel data)
  if (parsed.pixelRows.length > 0) {
    const viewportMatch = options.viewport.match(/(\d+)x(\d+)/);
    const vw = viewportMatch ? parseInt(viewportMatch[1]) : 800;
    const vh = viewportMatch ? parseInt(viewportMatch[2]) : 600;
    const rawBuffer = pixelRowsToRawRgba(parsed.pixelRows, vw, vh);
    writeFileSync(chengScreenshotPath, rawBuffer);
  }

  // Step 3: Build oracle options and run comparison
  const oracleOptions: OracleOptions = {
    chengDomPath,
    chromeDomPath: options.chromeDomPath && existsSync(options.chromeDomPath) ? options.chromeDomPath : "",
    chengLayoutPath,
    chromeLayoutPath: options.chromeLayoutPath && existsSync(options.chromeLayoutPath) ? options.chromeLayoutPath : "",
    chengEventsPath: "",
    chromeEventsPath: options.chromeEventsPath && existsSync(options.chromeEventsPath) ? options.chromeEventsPath : "",
    chengScreenshotPath: parsed.pixelRows.length > 0 ? chengScreenshotPath : "",
    chromeScreenshotPath: options.chromeScreenshotPath && existsSync(options.chromeScreenshotPath) ? options.chromeScreenshotPath : "",
    viewport: options.viewport,
    tolerance: options.tolerance,
    positionTolerance: options.positionTolerance || 50,
    threshold: options.threshold,
    outPath: options.outPath,
    format: options.format,
  };

  return await runOracle(oracleOptions);
}

// Main
const isMain = process.argv[1]?.endsWith("cheng-web-oracle.ts");
if (isMain) {
  if (process.argv.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  // ── --compare 模式：从目录读取 cheng dump + chrome capture 对比 ──
  if (process.argv.includes("--compare")) {
    const args = process.argv.slice(2);
    const opts: Record<string, string> = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith("--")) {
        const key = args[i].slice(2);
        const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "true";
        opts[key] = val;
      }
    }

    const chengDumpDir = opts["cheng-dump"] || "";
    const chromeCaptureDir = opts["chrome-capture"] || "";

    if (!chengDumpDir && !chromeCaptureDir) {
      process.stderr.write("error: --compare requires --cheng-dump <dir> and/or --chrome-capture <dir>\n");
      process.exit(1);
    }

    const joinIfExists = (dir: string, file: string): string => {
      const p = join(dir, file);
      return existsSync(p) ? p : "";
    };

    const options: OracleOptions = {
      chengDomPath: joinIfExists(chengDumpDir, "dom_cheng.json"),
      chromeDomPath: joinIfExists(chromeCaptureDir, "dom_chrome.json"),
      chengLayoutPath: joinIfExists(chengDumpDir, "layout_cheng.json"),
      chromeLayoutPath: joinIfExists(chromeCaptureDir, "layout_chrome.json"),
      chengEventsPath: joinIfExists(chengDumpDir, "events_cheng.json"),
      chromeEventsPath: joinIfExists(chromeCaptureDir, "events_chrome.json"),
      chengScreenshotPath: joinIfExists(chengDumpDir, "screenshot_cheng.raw"),
      chromeScreenshotPath: joinIfExists(chromeCaptureDir, "screenshot_chrome.raw"),
      viewport: opts["viewport"] || "800x600",
      tolerance: parseInt(opts["tolerance"] || "2"),
      positionTolerance: parseInt(opts["position-tolerance"] || "50"),
      outPath: opts["out"] || "",
      format: opts["format"] || "text",
      threshold: parseFloat(opts["threshold"] || "95"),
    };

    const report = await runOracle(options);

    // -- Generate DOM oracle report (normalized + field-specific metrics) --
    if (options.chengDomPath && options.chromeDomPath) {
      try {
        const chengDom = JSON.parse(readFileSync(options.chengDomPath, "utf8"));
        const chromeDom = JSON.parse(readFileSync(options.chromeDomPath, "utf8"));
        const { report: domOracleReport } = compareDomSnapshotsDetailed(
          chengDom, chromeDom, options.chengDomPath, options.chromeDomPath,
        );
        const oracleDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "oracle");
        const domReportPath = join(oracleDir, "oracle-dom-report.json");
        writeFileSync(domReportPath, JSON.stringify(domOracleReport, null, 2));
        process.stdout.write(`DOM oracle report: ${domReportPath}\n`);
      } catch (e) {
        process.stderr.write(`warning: DOM oracle report generation failed: ${(e as Error).message}\n`);
      }
    }

    // 计算平均匹配率和阈值判定
    const dimList: { name: string; matchRate: number; hasData: boolean }[] = [];
    for (const d of [report.domDiff, report.layoutDiff, report.eventDiff]) {
      dimList.push({ name: "", matchRate: d.totalNodes > 0 ? d.matchedNodes / d.totalNodes : 1, hasData: d.totalNodes > 0 });
    }
    dimList.push({ name: "Screenshot", matchRate: report.screenshotDiff.totalPixels > 0 ? 1 - report.screenshotDiff.pixelDiffPercent / 100 : 1, hasData: report.screenshotDiff.totalPixels > 0 });
    const activeDims = dimList.filter(d => d.hasData);
    const avgMatchRate = activeDims.length > 0
      ? activeDims.reduce((s, d) => s + d.matchRate, 0) / activeDims.length
      : 1;
    const thresholdPassed = avgMatchRate * 100 >= options.threshold;

    // 打印各维度匹配率
    process.stdout.write(`\n--- Oracle Compare Report ---\n`);
    process.stdout.write(`Cheng dump dir:  ${chengDumpDir || "(none)"}\n`);
    process.stdout.write(`Chrome cap dir:  ${chromeCaptureDir || "(none)"}\n`);
    process.stdout.write(`Viewport: ${options.viewport}\n`);
    process.stdout.write(`Tolerance: layout ${options.tolerance}px, pixel ${options.threshold}%\n\n`);

    const dimLabels = ["DOM", "Layout", "Events", "Screenshot"];
    for (let i = 0; i < dimList.length; i++) {
      const d = dimList[i];
      if (!d.hasData) continue;
      process.stdout.write(`  ${dimLabels[i]} match: ${(d.matchRate * 100).toFixed(1)}%\n`);
    }
    process.stdout.write(`  Average match: ${(avgMatchRate * 100).toFixed(1)}%\n`);
    process.stdout.write(`  Threshold: ${options.threshold}% — ${thresholdPassed ? "PASS" : "FAIL"}\n\n`);

    if (options.format === "html") {
      const outPath = options.outPath || "oracle-report.html";
      const html = generateHtmlReport(report);
      writeFileSync(outPath, html);
      process.stdout.write(`HTML report written to ${outPath}\n`);
    } else if (options.format === "json") {
      const outPath = options.outPath || "oracle-report.json";
      const jsonReport = { ...report, avgMatchRate: parseFloat((avgMatchRate * 100).toFixed(2)), threshold: options.threshold, thresholdPassed };
      writeFileSync(outPath, JSON.stringify(jsonReport, null, 2));
      process.stdout.write(`JSON report written to ${outPath}\n`);
    } else {
      printRichReport(report);
    }

    process.exit(thresholdPassed ? 0 : 1);
  }

  // Check for --cheng-dump mode
  if (process.argv.includes("--cheng-dump")) {
    const args = process.argv.slice(2);
    const opts: Record<string, string> = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith("--")) {
        const key = args[i].slice(2);
        const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "true";
        opts[key] = val;
      }
    }
    const chengDumpOptions: ChengDumpOptions = {
      projectDir: opts["project"] || "",
      chromeDomPath: opts["chrome-dom"] || "",
      chromeLayoutPath: opts["chrome-layout"] || "",
      chromeEventsPath: opts["chrome-events"] || "",
      chromeScreenshotPath: opts["chrome-screenshot"] || "",
      viewport: opts["viewport"] || "800x600",
      tolerance: parseInt(opts["tolerance"] || "1"),
      positionTolerance: parseInt(opts["position-tolerance"] || "50"),
      threshold: parseFloat(opts["threshold"] || "95"),
      outPath: opts["out"] || "",
      format: opts["format"] || "text",
      buildScript: opts["build-script"] || "",
    };
    if (!chengDumpOptions.projectDir) {
      process.stderr.write("error: --project <dir> is required with --cheng-dump\n");
      process.exit(1);
    }
    const report = await runChengDump(chengDumpOptions);
    // Use same report formatting as normal mode
    const viewport = report.viewport;
    const dims: { name: string; matchRate: number; hasData: boolean }[] = [];
    for (const d of [report.domDiff, report.layoutDiff, report.eventDiff]) {
      dims.push({ name: "", matchRate: d.totalNodes > 0 ? d.matchedNodes / d.totalNodes : 1, hasData: d.totalNodes > 0 });
    }
    dims.push({ name: "Screenshot", matchRate: report.screenshotDiff.totalPixels > 0 ? 1 - report.screenshotDiff.pixelDiffPercent / 100 : 1, hasData: report.screenshotDiff.totalPixels > 0 });
    const activeDims = dims.filter(d => d.hasData);
    const avgMatchRate = activeDims.length > 0
      ? activeDims.reduce((s, d) => s + d.matchRate, 0) / activeDims.length
      : 1;
    const thresholdPassed = avgMatchRate * 100 >= chengDumpOptions.threshold;

    if (chengDumpOptions.format === "json") {
      const outPath = chengDumpOptions.outPath || "oracle-report.json";
      const jsonReport = { ...report, avgMatchRate: parseFloat((avgMatchRate * 100).toFixed(2)), threshold: chengDumpOptions.threshold, thresholdPassed };
      writeFileSync(outPath, JSON.stringify(jsonReport, null, 2));
      process.stdout.write(`JSON report written to ${outPath}\n`);
      process.exit(thresholdPassed ? 0 : 1);
    }

    if (chengDumpOptions.format === "html") {
      const outPath = chengDumpOptions.outPath || "oracle-report.html";
      const html = generateHtmlReport(report);
      writeFileSync(outPath, html);
      process.stdout.write(`HTML report written to ${outPath}\n`);
      process.exit(thresholdPassed ? 0 : 1);
    }

    printRichReport(report);
    process.exit(report.overallPassed ? 0 : 1);
  }

  // Check for --golden mode
  if (process.argv.includes("--golden")) {
    runGoldenMode(process.argv.slice(2));
    process.exit(0);
  }

  const options = parseArgs();
  const report = await runOracle(options);

  // Determine threshold-based pass
  const dims: { name: string; matchRate: number; hasData: boolean }[] = [];
  for (const d of [report.domDiff, report.layoutDiff, report.eventDiff]) {
    dims.push({ name: "", matchRate: d.totalNodes > 0 ? d.matchedNodes / d.totalNodes : 1, hasData: d.totalNodes > 0 });
  }
  dims.push({ name: "Screenshot", matchRate: report.screenshotDiff.totalPixels > 0 ? 1 - report.screenshotDiff.pixelDiffPercent / 100 : 1, hasData: report.screenshotDiff.totalPixels > 0 });
  const activeDims = dims.filter(d => d.hasData);
  const avgMatchRate = activeDims.length > 0
    ? activeDims.reduce((s, d) => s + d.matchRate, 0) / activeDims.length
    : 1;
  const thresholdPassed = avgMatchRate * 100 >= options.threshold;

  if (options.format === "json") {
    const outPath = options.outPath || "oracle-report.json";
    const jsonReport = { ...report, avgMatchRate: parseFloat((avgMatchRate * 100).toFixed(2)), threshold: options.threshold, thresholdPassed };
    writeFileSync(outPath, JSON.stringify(jsonReport, null, 2));
    process.stdout.write(`JSON report written to ${outPath}\n`);
    process.exit(thresholdPassed ? 0 : 1);
  }

  if (options.format === "html") {
    const outPath = options.outPath || "oracle-report.html";
    const html = generateHtmlReport(report);
    writeFileSync(outPath, html);
    process.stdout.write(`HTML report written to ${outPath}\n`);
    process.exit(thresholdPassed ? 0 : 1);
  }

  // Default text format
  printRichReport(report);
  process.exit(report.overallPassed ? 0 : 1);
}
