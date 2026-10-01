#!/usr/bin/env node
// unicode-tables-build.mjs
//
// Build-time generator for a general-purpose Unicode data fixture consumed by
// src/std/unicode.cheng at runtime. Not bound to any specific model. Source
// data is the real UCD files (authoritative, no guessing):
//   - UnicodeData.txt          (general category, canonical combining class,
//                                canonical decomposition mapping)
//   - CompositionExclusions.txt (the "(1) Script Specifics" primary exclusion
//                                list; singleton and non-starter exclusions
//                                are derived programmatically per UAX #15)
//
// General category L/N ranges are derived directly from the JS engine's ICU-
// backed \p{L} / \p{N} Unicode property escapes (authoritative General_Category
// derived property, same data class HF's Rust regex crate uses for the GPT2
// pre-tokenizer pattern), not by hand-parsing field 2 + First/Last range lines.
//
// Hangul syllables (U+AC00..U+D7A3) are intentionally NOT in the decomposition
// table: UnicodeData.txt does not list them individually (11172 codepoints
// algorithmically derived), and every conformant NFC/NFD implementation
// (ICU, Python unicodedata, ...) hard-codes the Hangul decomposition/
// composition formula instead of tabulating it. src/std/unicode.cheng does
// the same; this build script only emits the non-Hangul table.
//
// Output: unicode_tables.bin, little-endian, format documented at the top of
// src/std/unicode.cheng (UnicodeTablesLoad).
//
// Usage: node unicode-tables-build.mjs <ucd_dir> <out.bin>

import { readFileSync, writeFileSync } from "node:fs";

const [, , ucdDirArg, outArg] = process.argv;
if (!ucdDirArg || !outArg) {
  console.error("usage: node unicode-tables-build.mjs <ucd_dir> <out.bin>");
  process.exit(1);
}

const unicodeDataPath = `${ucdDirArg}/UnicodeData.txt`;
const exclusionsPath = `${ucdDirArg}/CompositionExclusions.txt`;

// ---------------------------------------------------------------------------
// 1. General category L / N ranges via authoritative ICU Unicode property escapes.
// ---------------------------------------------------------------------------
const isL = /\p{L}/u;
const isN = /\p{N}/u;

function buildRanges(pred) {
  const ranges = [];
  let runStart = -1;
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) {
      // surrogate range: not a scalar value, never matches a real character.
      if (runStart >= 0) {
        ranges.push([runStart, cp - 1]);
        runStart = -1;
      }
      continue;
    }
    const ch = String.fromCodePoint(cp);
    const hit = pred.test(ch);
    if (hit && runStart < 0) {
      runStart = cp;
    } else if (!hit && runStart >= 0) {
      ranges.push([runStart, cp - 1]);
      runStart = -1;
    }
  }
  if (runStart >= 0) ranges.push([runStart, 0x10ffff]);
  return ranges;
}

const lRanges = buildRanges(isL);
const nRanges = buildRanges(isN);
console.error(`L ranges: ${lRanges.length}, N ranges: ${nRanges.length}`);

// ---------------------------------------------------------------------------
// 2. UnicodeData.txt: combining class + one-step canonical decomposition.
// ---------------------------------------------------------------------------
const combiningClass = new Map(); // cp -> ccc (only ccc != 0)
const rawDecomp = new Map(); // cp -> [cp,...] one-step canonical (no <tag>)

const udLines = readFileSync(unicodeDataPath, "utf8").split("\n");
for (const line of udLines) {
  if (!line || line.startsWith("#")) continue;
  const fields = line.split(";");
  if (fields.length < 6) continue;
  const cp = parseInt(fields[0], 16);
  const ccc = parseInt(fields[3], 10);
  if (Number.isFinite(ccc) && ccc !== 0) combiningClass.set(cp, ccc);
  const decompField = fields[5].trim();
  if (decompField.length > 0 && !decompField.startsWith("<")) {
    const parts = decompField.split(/\s+/).map((h) => parseInt(h, 16));
    rawDecomp.set(cp, parts);
  }
}
console.error(
  `combining class entries: ${combiningClass.size}, raw canonical decomp entries: ${rawDecomp.size}`
);

// Hangul algorithmic decomposition is excluded from rawDecomp on purpose:
// UnicodeData.txt never lists individual Hangul syllables with a
// decomposition field, so rawDecomp naturally contains none. No filtering
// needed.

// Full recursive expansion for the NFD table (repeat one-step decomposition
// until fixed point). Finite because Unicode decomposition strictly reduces
// toward atomic (non-decomposable) codepoints.
function fullyDecompose(cp, seen) {
  const raw = rawDecomp.get(cp);
  if (!raw) return [cp];
  if (seen.has(cp)) throw new Error(`decomposition cycle at U+${cp.toString(16)}`);
  seen.add(cp);
  const out = [];
  for (const part of raw) out.push(...fullyDecompose(part, seen));
  seen.delete(cp);
  return out;
}

const decompIndex = []; // [cp, offset, length]
const decompFlat = [];
for (const cp of [...rawDecomp.keys()].sort((a, b) => a - b)) {
  const full = fullyDecompose(cp, new Set());
  decompIndex.push([cp, decompFlat.length, full.length]);
  decompFlat.push(...full);
}
console.error(`decomposition index entries: ${decompIndex.length}, flat codepoints: ${decompFlat.length}`);

// ---------------------------------------------------------------------------
// 3. Composition exclusion set (UAX #15 Full_Composition_Exclusion, derived).
// ---------------------------------------------------------------------------
const exclusions = new Set();
const exLines = readFileSync(exclusionsPath, "utf8").split("\n");
for (const line of exLines) {
  const trimmed = line.split("#")[0].trim();
  if (!trimmed) continue;
  const cp = parseInt(trimmed, 16);
  if (Number.isFinite(cp)) exclusions.add(cp);
}
const explicitExclusionCount = exclusions.size;
for (const [cp, raw] of rawDecomp) {
  if (raw.length === 1) {
    exclusions.add(cp); // singleton decomposition
  } else if (raw.length === 2) {
    const ccc0 = combiningClass.get(raw[0]) ?? 0;
    if (ccc0 !== 0) exclusions.add(cp); // non-starter decomposition
  }
}
console.error(
  `composition exclusions: explicit=${explicitExclusionCount}, total(+singleton+non-starter)=${exclusions.size}`
);

// ---------------------------------------------------------------------------
// 4. One-step primary composite map: (D0,D1) -> cp, for 2-codepoint raw
//    canonical decompositions of non-excluded characters.
// ---------------------------------------------------------------------------
const composePairs = []; // [left, right, composed]
for (const [cp, raw] of rawDecomp) {
  if (raw.length !== 2) continue;
  if (exclusions.has(cp)) continue;
  composePairs.push([raw[0], raw[1], cp]);
}
composePairs.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
// Verify pair uniqueness (composition must be a function of (left,right)).
for (let i = 1; i < composePairs.length; i++) {
  const [l0, r0] = composePairs[i - 1];
  const [l1, r1] = composePairs[i];
  if (l0 === l1 && r0 === r1) {
    throw new Error(`duplicate composition pair (${l0},${r0}) -> ambiguous`);
  }
}
console.error(`composition pairs: ${composePairs.length}`);

// ---------------------------------------------------------------------------
// 5. Serialize little-endian binary fixture.
// ---------------------------------------------------------------------------
const MAGIC = 0x314e5543; // "CUN1" little-endian read back as this int32
const VERSION = 1;

function hashStep(h, v) {
  // Mirrors WeightTensorHashStep(hash,value) in src/inference/weight_store.cheng
  // exactly (int64 wraparound arithmetic, negative results made positive by
  // negation, never by masking sign bit off differently).
  let mixed = BigInt.asIntN(64, h * 524287n + v + 113n);
  if (mixed < 0n) mixed = BigInt.asIntN(64, -mixed);
  return mixed;
}

let contentHash = 113n;
const step = (v) => {
  contentHash = hashStep(contentHash, BigInt(v));
};
step(MAGIC);
step(VERSION);
step(lRanges.length);
step(nRanges.length);
step(combiningClass.size);
step(decompIndex.length);
step(decompFlat.length);
step(composePairs.length);
for (const [s, e] of lRanges) { step(s); step(e); }
for (const [s, e] of nRanges) { step(s); step(e); }
const combiningSorted = [...combiningClass.entries()].sort((a, b) => a[0] - b[0]);
for (const [cp, cls] of combiningSorted) { step(cp); step(cls); }
for (const [cp, off, len] of decompIndex) { step(cp); step(off); step(len); }
for (const cp of decompFlat) step(cp);
for (const [l, r, c] of composePairs) { step(l); step(r); step(c); }

const headerInts = 8;
const totalInt32s =
  headerInts +
  lRanges.length * 2 +
  nRanges.length * 2 +
  combiningSorted.length * 2 +
  decompIndex.length * 3 +
  decompFlat.length +
  composePairs.length * 3;
const buf = Buffer.alloc(totalInt32s * 4 + 8); // +8 for the int64 contentHash
let off = 0;
function w32(v) {
  buf.writeInt32LE(v | 0, off);
  off += 4;
}
w32(MAGIC);
w32(VERSION);
w32(lRanges.length);
w32(nRanges.length);
w32(combiningSorted.length);
w32(decompIndex.length);
w32(decompFlat.length);
w32(composePairs.length);
buf.writeBigInt64LE(BigInt.asIntN(64, contentHash), off);
off += 8;
for (const [s, e] of lRanges) { w32(s); w32(e); }
for (const [s, e] of nRanges) { w32(s); w32(e); }
for (const [cp, cls] of combiningSorted) { w32(cp); w32(cls); }
for (const [cp, o2, len] of decompIndex) { w32(cp); w32(o2); w32(len); }
for (const cp of decompFlat) w32(cp);
for (const [l, r, c] of composePairs) { w32(l); w32(r); w32(c); }

writeFileSync(outArg, buf);
console.error(`wrote ${outArg}: ${buf.length} bytes, contentHash=${contentHash.toString()}`);
