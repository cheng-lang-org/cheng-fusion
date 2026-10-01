#!/usr/bin/env node
// Synthetic-frame unit test for the CJK text-node exemption mask (B1 gate).
//
// No historical real-device capture exists under tmp/ (checked 2026-07-09), so the masking
// GEOMETRY is proven here against constructed frames instead of a live rescore; the real-device
// exempted rescore of home_default is hung on the next capture window. This test asserts:
//   1. an unmasked diff is fully visible (raw口径),
//   2. only Han-containing boxes are selected (font-subset isHanCodePoint口径),
//   3. masking a Han box equalises exactly that box in both frames (exempted口径 drops its diff),
//   4. a diff OUTSIDE any Han box survives — the exemption cannot hide a geometry regression,
//   5. boxes clamp to the frame and overlapping boxes are union-counted (no double count),
//   6. a Han box Cheng renders BLANK (missing glyph, NOT shifted) is masked to 0 — the documented
//      SCOPE of the exemption: because the whole box is exempt, a content defect inside an aligned
//      Han box is knowingly not caught here (raw口径 still exposes it). Recorded, not fixed.

import assert from "node:assert/strict";
import {
  selectCjkBoxes,
  textContainsHan,
  maskRawFrame,
  clampBoxToFrame,
  countPixelDiff,
} from "./unimaker-cjk-text-mask.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`  ok  ${name}\n`);
}

// ── frame builders (8-byte LE header + RGBA body, same format as the pixel oracle) ──
function makeFrame(width, height, fill = [255, 255, 255, 255]) {
  const buf = Buffer.alloc(8 + width * height * 4);
  buf.writeUInt32LE(width, 0);
  buf.writeUInt32LE(height, 4);
  for (let i = 0; i < width * height; i += 1) {
    const o = 8 + i * 4;
    buf[o] = fill[0];
    buf[o + 1] = fill[1];
    buf[o + 2] = fill[2];
    buf[o + 3] = fill[3];
  }
  return buf;
}
function fillBlock(buf, width, x, y, w, h, rgba) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const o = 8 + (yy * width + xx) * 4;
      buf[o] = rgba[0];
      buf[o + 1] = rgba[1];
      buf[o + 2] = rgba[2];
      buf[o + 3] = rgba[3];
    }
  }
}

const W = 40;
const H = 30;
const BLACK = [0, 0, 0, 255];

// React = flat white reference. Cheng = white with two differing blocks:
//   - block A (10x8) at (5,5): a CJK glyph-rasterisation delta inside an exempt text box.
//   - block B (6x5) at (25,20): a Latin/geometry delta with NO exempt box (must survive).
const react = makeFrame(W, H);
const cheng = makeFrame(W, H);
fillBlock(cheng, W, 5, 5, 10, 8, BLACK); // area 80
fillBlock(cheng, W, 25, 20, 6, 5, BLACK); // area 30

const boxes = [
  { x: 5, y: 5, width: 10, height: 8, text: "测试" }, // Han → exempt
  { x: 25, y: 20, width: 6, height: 5, text: "Latin42" }, // no Han → NOT exempt
];

check("Han detection follows font-subset isHanCodePoint口径", () => {
  assert.equal(textContainsHan("测试"), true);
  assert.equal(textContainsHan("Latin42"), false);
  assert.equal(textContainsHan("hi 好 there"), true, "mixed text with one Han counts");
  assert.equal(textContainsHan(""), false);
  assert.equal(textContainsHan("你好"), true);
});

check("selectCjkBoxes keeps only Han-bearing boxes", () => {
  const cjk = selectCjkBoxes(boxes);
  assert.equal(cjk.length, 1);
  assert.equal(cjk[0].text, "测试");
});

const cjkBoxes = selectCjkBoxes(boxes);

check("raw口径: unmasked diff shows every differing block", () => {
  const raw = countPixelDiff(cheng, react);
  assert.equal(raw.diffPixels, 80 + 30, "both blocks differ before exemption");
});

check("exempted口径: masking the Han box drops exactly its 80 diff pixels", () => {
  const mc = maskRawFrame(cheng, cjkBoxes);
  const mr = maskRawFrame(react, cjkBoxes);
  assert.equal(mc.maskedPixels, 80, "masked pixel count = Han box area");
  assert.equal(mr.maskedPixels, 80);
  const exempted = countPixelDiff(mc.masked, mr.masked);
  assert.equal(exempted.diffPixels, 30, "only the non-exempt Latin block survives");
});

check("exemption cannot hide a geometry regression outside the box", () => {
  // Simulate a Cheng box shifted off the aligned React box: the glyphs land outside the mask.
  const shiftedCheng = makeFrame(W, H);
  fillBlock(shiftedCheng, W, 18, 5, 10, 8, BLACK); // drawn at x=18, but box says x=5
  const mc = maskRawFrame(shiftedCheng, cjkBoxes);
  const mr = maskRawFrame(react, cjkBoxes);
  const exempted = countPixelDiff(mc.masked, mr.masked);
  assert.ok(exempted.diffPixels > 0, "shifted glyphs outside the masked box still register as diff");
});

check("boxes clamp to the frame without overflow", () => {
  const clamped = clampBoxToFrame({ x: 35, y: 25, width: 20, height: 20 }, W, H);
  assert.deepEqual(clamped, { x0: 35, y0: 25, x1: 40, y1: 30 });
  assert.equal(clampBoxToFrame({ x: 100, y: 100, width: 5, height: 5 }, W, H), null);
  assert.equal(clampBoxToFrame({ x: 0, y: 0, width: 0, height: 5 }, W, H), null);
  const frame = makeFrame(W, H);
  const res = maskRawFrame(frame, [{ x: 35, y: 25, width: 20, height: 20, text: "漢" }]);
  assert.equal(res.maskedPixels, 25, "clamped 5x5 region masked, no crash");
});

check("overlapping Han boxes are union-counted, not double-counted", () => {
  const frame = makeFrame(W, H);
  const res = maskRawFrame(frame, [
    { x: 0, y: 0, width: 10, height: 10, text: "甲" },
    { x: 5, y: 5, width: 10, height: 10, text: "乙" },
  ]);
  // union of two 10x10 boxes overlapping in a 5x5 corner = 100 + 100 - 25 = 175
  assert.equal(res.maskedPixels, 175);
});

check("known scope: a Han box Cheng renders blank is exempted to 0 (recorded, not fixed)", () => {
  // Real defect shape distinct from the shift in check #4: Cheng draws NOTHING inside the Han box
  // (blank, in place), while React rasterised the glyph. Because the WHOLE box is exempt, the
  // exempted口径 drops this missing-glyph diff to 0. This is the documented scope of the B1
  // exemption — a content defect inside an aligned Han box is knowingly NOT caught here. This
  // asserts the current behaviour on purpose (it is not a bug being fixed); raw口径 below still
  // exposes the same defect as the fallback cross-check.
  const reactGlyph = makeFrame(W, H);
  fillBlock(reactGlyph, W, 5, 5, 10, 8, BLACK); // React rasterised the glyph (area 80)
  const chengBlank = makeFrame(W, H); // Cheng rendered nothing in the box — blank, not shifted
  const hanBox = selectCjkBoxes([{ x: 5, y: 5, width: 10, height: 8, text: "测试" }]);
  const raw = countPixelDiff(chengBlank, reactGlyph);
  assert.equal(raw.diffPixels, 80, "raw口径 still exposes the missing glyph (fallback cross-check)");
  const mc = maskRawFrame(chengBlank, hanBox);
  const mr = maskRawFrame(reactGlyph, hanBox);
  const exempted = countPixelDiff(mc.masked, mr.masked);
  assert.equal(exempted.diffPixels, 0, "whole-box exemption drops the missing-glyph diff to 0 (known scope)");
});

process.stdout.write(`\ncjk-text-mask geometry: ${passed} checks passed\n`);
