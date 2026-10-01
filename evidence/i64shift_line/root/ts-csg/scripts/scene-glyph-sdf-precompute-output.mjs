import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export function parseSceneGlyphSdfPrecomputeOutput(output, options = {}) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const markerIndex = lines.indexOf("csg_scene_glyph_sdf_atlas_v2");
  if (markerIndex < 0) throw new Error("glyph SDF precompute did not print csg_scene_glyph_sdf_atlas_v2 marker");
  const kv = new Map();
  const arrays = new Map();
  const text = new Map();
  let index = markerIndex + 1;
  while (index < lines.length) {
    const line = lines[index];
    const begin = /^(atlas|glyph|run|run_glyph|pixels|pixels_rle)_begin$/.exec(line);
    if (begin) {
      const name = begin[1];
      const values = [];
      index += 1;
      while (index < lines.length && lines[index] !== `${name}_end`) {
        values.push(parsePrecomputedI32(lines[index], `${name}[${values.length}]`));
        index += 1;
      }
      if (index >= lines.length) throw new Error(`glyph SDF precompute missing ${name}_end`);
      arrays.set(name, values);
      index += 1;
      continue;
    }
    if (line === "pixels_file") {
      if (index + 1 >= lines.length) throw new Error("glyph SDF precompute missing pixels_file path");
      text.set("pixels_file", lines[index + 1]);
      index += 2;
      continue;
    }
    const eq = line.indexOf("=");
    if (eq > 0) {
      kv.set(line.slice(0, eq), parsePrecomputedI32(line.slice(eq + 1), line.slice(0, eq)));
      index += 1;
      continue;
    }
    if (index + 1 >= lines.length) throw new Error(`glyph SDF precompute printed malformed line: ${line}`);
    kv.set(line, parsePrecomputedI32(lines[index + 1], line));
    index += 2;
  }

  const atlasWords = requiredArray(arrays, kv, "atlas");
  const glyphWords = requiredArray(arrays, kv, "glyph");
  const runWords = requiredArray(arrays, kv, "run");
  const runGlyphWords = requiredArray(arrays, kv, "run_glyph");
  const pixels = requiredPixels(arrays, kv, text, options);
  const atlasStride = requiredKv(kv, "atlas_stride");
  const glyphStride = requiredKv(kv, "glyph_stride");
  const runStride = requiredKv(kv, "run_stride");
  const runGlyphStride = requiredKv(kv, "run_glyph_stride");
  assert.equal(atlasStride, 8, "glyph SDF atlas host stride must match mobile ABI");
  assert.equal(glyphStride, 12, "glyph SDF glyph host stride must include codepoint/fontSize mobile ABI");
  assert.equal(runStride, 9, "glyph SDF run stride must include paint identity");
  assert.equal(runGlyphStride, 2, "glyph SDF run glyph host stride must match mobile ABI");
  assert.equal(atlasWords.length % atlasStride, 0, "glyph SDF atlas words must align to stride");
  assert.equal(glyphWords.length % glyphStride, 0, "glyph SDF glyph words must align to stride");
  assert.equal(runWords.length % runStride, 0, "glyph SDF run words must align to stride");
  assert.equal(runGlyphWords.length % runGlyphStride, 0, "glyph SDF run glyph words must align to stride");
  const atlasEntryCount = atlasWords.length / atlasStride;
  const glyphCount = glyphWords.length / glyphStride;
  const runCount = runWords.length / runStride;
  const runGlyphCount = runGlyphWords.length / runGlyphStride;
  const atlasSdfIds = new Set();
  for (let offset = 0; offset < atlasWords.length; offset += atlasStride) {
    const sdfAtlasId = atlasWords[offset];
    assert(sdfAtlasId > 0, "glyph SDF atlas id must be positive");
    assert(!atlasSdfIds.has(sdfAtlasId), "glyph SDF atlas ids must be unique");
    atlasSdfIds.add(sdfAtlasId);
  }
  assert.equal(atlasEntryCount, requiredKv(kv, "atlas_entry_count"), "glyph SDF atlas entry count must match output");
  assert.equal(glyphCount, requiredKv(kv, "glyph_count"), "glyph SDF glyph count must match output");
  assert.equal(runCount, requiredKv(kv, "run_count"), "glyph SDF run count must match output");
  assert.equal(runGlyphCount, requiredKv(kv, "run_glyph_count"), "glyph SDF run glyph count must match output");
  // A textless shell scene carries inventory glyphs and pixels with ZERO runs — a valid atlas,
  // never an empty one (UniMaker scenes always have text runs; codex shells' text arrives at runtime).
  assert(glyphCount > 0 && pixels.length > 0, "glyph SDF precompute must produce non-empty text atlas");
  return { atlasWords, glyphWords, runWords, runGlyphWords, pixels, atlasEntryCount, glyphCount, runCount, runGlyphCount };
}

function requiredArray(arrays, kv, name) {
  if (!arrays.has(name)) throw new Error(`glyph SDF precompute missing ${name} array`);
  const values = arrays.get(name);
  assert.equal(values.length, requiredKv(kv, `${name}_len`), `glyph SDF ${name} length must match output`);
  return values;
}

function requiredPixels(arrays, kv, text, options) {
  if (arrays.has("pixels")) return requiredArray(arrays, kv, "pixels");
  if (text.has("pixels_file") || options.pixelFilePath) {
    const pixelPath = options.pixelFilePath || text.get("pixels_file");
    const bytes = readFileSync(pixelPath);
    const pixelCount = requiredKv(kv, "pixels_len");
    assert.equal(bytes.length, pixelCount, "glyph SDF pixel file byte count must match pixels_len");
    return bytes;
  }
  const rle = arrays.get("pixels_rle");
  if (!rle) throw new Error("glyph SDF precompute missing pixels array");
  assert.equal(rle.length % 2, 0, "glyph SDF pixels RLE words must be value/count pairs");
  const pixelCount = requiredKv(kv, "pixels_len");
  assert(pixelCount >= 0, "glyph SDF pixels_len must be non-negative");
  const pixels = new Array(pixelCount);
  let cursor = 0;
  for (let index = 0; index < rle.length; index += 2) {
    const value = rle[index];
    const count = rle[index + 1];
    assert(Number.isInteger(value) && value >= 0 && value <= 255, `glyph SDF pixels_rle[${index}] value must fit uint8`);
    assert(Number.isInteger(count) && count > 0, `glyph SDF pixels_rle[${index + 1}] count must be positive`);
    assert(cursor + count <= pixelCount, "glyph SDF pixels RLE exceeds pixels_len");
    pixels.fill(value, cursor, cursor + count);
    cursor += count;
  }
  assert.equal(cursor, pixelCount, "glyph SDF pixels RLE length must match pixels_len");
  return pixels;
}

function requiredKv(kv, key) {
  if (!kv.has(key)) throw new Error(`glyph SDF precompute missing ${key}`);
  return kv.get(key);
}

function parsePrecomputedI32(text, label) {
  if (!/^-?\d+$/.test(text)) throw new Error(`glyph SDF precompute ${label} is not an integer: ${text}`);
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < -2147483648 || value > 2147483647) {
    throw new Error(`glyph SDF precompute ${label} is outside int32: ${text}`);
  }
  return value;
}
