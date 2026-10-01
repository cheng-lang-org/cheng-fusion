#!/usr/bin/env node
// UniMaker pixel-parity B1 gate — CJK (Han) text-node exemption mask.
//
// Exemption basis (user decision 2026-07-09; 正典 docs/cheng-pwa-1to1-remaining-work.md §2):
// The truth CJK typeface is 匯文明朝體. Chinese glyph shapes are deliberately NOT held to a
// 1:1 per-pixel parity against the React reference (which rasterises the same code points with
// a different hinter/rasteriser). So the gate masks, in BOTH compared frames at the SAME viewport
// coordinates, the WHOLE layout box of every text node whose text contains at least one Han code
// point, then re-scores the diff.
//
// Han判定 沿 font-subset.mjs 的 isHanCodePoint 口径 (single source of truth — imported below;
// no second copy of the range table). A box is exempt iff its text contains ≥1 Han code point.
//
// Be honest about the scope: the exemption is the ENTIRE box, not merely the Han glyph pixels.
// Masking equalises every covered pixel in both frames (sets them identical), so ANYTHING inside
// an aligned box is dropped from the diff — this includes mixed-run Latin/digits that share the
// box with the Han text, AND real content defects inside it (a missing glyph, a wrong character,
// a wrong colour). What it CANNOT hide is geometry that escapes the box: if a layout bug shifts or
// reflows the Cheng box off the aligned React box, the pixels that land OUTSIDE the masked React
// box still register as diff, so an offset/reflow regression is not exempted. Every pixel outside
// all Han boxes stays under the gate unchanged. The canonical pixel oracle (tools/cheng-web-
// oracle.ts, maxChannel > tolerance) scores the masked pair; the raw口径 (unmasked) is always
// printed alongside as the fallback cross-check so the swallowed in-box delta stays auditable.
//
// This module holds ONLY the pure geometry so it is unit-testable without a device
// (see unimaker-cjk-text-mask-smoke.mjs). The raw frame format matches the pixel oracle:
// 8-byte header (UInt32LE width, UInt32LE height) followed by width*height RGBA bytes.

import { readFileSync, writeFileSync } from "node:fs";
import { isHanCodePoint } from "./font-subset.mjs";

export function textContainsHan(text) {
  if (typeof text !== "string" || text.length === 0) return false;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code !== undefined && isHanCodePoint(code)) return true;
  }
  return false;
}

// Filter a list of text-node boxes ({x, y, width, height, text}) down to the CJK-exempt ones.
export function selectCjkBoxes(boxes) {
  if (!Array.isArray(boxes)) return [];
  return boxes.filter((box) => box && textContainsHan(String(box.text ?? "")));
}

// Clamp a box to the integer pixel grid [0,width) x [0,height). Returns {x0,y0,x1,y1} with
// half-open [x0,x1) x [y0,y1), or null when the box has no pixels inside the frame.
export function clampBoxToFrame(box, width, height) {
  const bx = Number(box?.x);
  const by = Number(box?.y);
  const bw = Number(box?.width);
  const bh = Number(box?.height);
  if (![bx, by, bw, bh].every(Number.isFinite) || bw <= 0 || bh <= 0) return null;
  const x0 = Math.max(0, Math.floor(bx));
  const y0 = Math.max(0, Math.floor(by));
  const x1 = Math.min(width, Math.ceil(bx + bw));
  const y1 = Math.min(height, Math.ceil(by + bh));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x0, y0, x1, y1 };
}

function readRawFrame(buffer) {
  if (buffer.length < 8) throw new Error(`raw frame too small: ${buffer.length} bytes`);
  const width = buffer.readUInt32LE(0);
  const height = buffer.readUInt32LE(4);
  const expected = 8 + width * height * 4;
  if (buffer.length !== expected) {
    throw new Error(`raw frame size mismatch: header ${width}x${height} expects ${expected} bytes, got ${buffer.length}`);
  }
  return { width, height };
}

// Zero the RGBA of every pixel covered by any box (union). Mutates a copy of the input buffer.
// Returns { masked: Buffer, maskedPixels: number, width, height } where maskedPixels is the
// count of DISTINCT covered pixels (overlapping boxes are not double-counted).
export function maskRawFrame(buffer, boxes) {
  const { width, height } = readRawFrame(buffer);
  const masked = Buffer.from(buffer); // copy — never mutate caller's buffer
  const covered = new Uint8Array(width * height);
  let maskedPixels = 0;
  for (const box of boxes) {
    const rect = clampBoxToFrame(box, width, height);
    if (!rect) continue;
    for (let y = rect.y0; y < rect.y1; y += 1) {
      const rowBase = y * width;
      for (let x = rect.x0; x < rect.x1; x += 1) {
        const pixelIndex = rowBase + x;
        if (covered[pixelIndex] === 0) {
          covered[pixelIndex] = 1;
          maskedPixels += 1;
        }
        const offset = 8 + pixelIndex * 4;
        masked[offset] = 0;
        masked[offset + 1] = 0;
        masked[offset + 2] = 0;
        masked[offset + 3] = 0;
      }
    }
  }
  return { masked, maskedPixels, width, height };
}

// File-path wrapper: read a raw frame, mask the boxes, write the masked frame to outPath.
export function maskRawFile(inPath, boxes, outPath) {
  const buffer = readFileSync(inPath);
  const result = maskRawFrame(buffer, boxes);
  writeFileSync(outPath, result.masked);
  return { maskedPixels: result.maskedPixels, width: result.width, height: result.height };
}

// Per-pixel diff count matching tools/cheng-web-oracle.ts compareScreenshots (maxChannel >
// tolerance). Provided for offline verification / unit tests; production re-scoring reuses the
// canonical oracle subprocess so the raw and exempted口径 come from the identical algorithm.
export function countPixelDiff(bufferA, bufferB, tolerance = 5) {
  const a = readRawFrame(bufferA);
  const b = readRawFrame(bufferB);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`frame size mismatch: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  const total = a.width * a.height;
  let diffPixels = 0;
  for (let i = 0; i < total; i += 1) {
    const offset = 8 + i * 4;
    const rDiff = Math.abs(bufferA[offset] - bufferB[offset]);
    const gDiff = Math.abs(bufferA[offset + 1] - bufferB[offset + 1]);
    const bDiff = Math.abs(bufferA[offset + 2] - bufferB[offset + 2]);
    const aDiff = Math.abs(bufferA[offset + 3] - bufferB[offset + 3]);
    if (Math.max(rDiff, gDiff, bDiff, aDiff) > tolerance) diffPixels += 1;
  }
  return { diffPixels, totalPixels: total, pixelDiffPercent: total > 0 ? (diffPixels / total) * 100 : 0 };
}
