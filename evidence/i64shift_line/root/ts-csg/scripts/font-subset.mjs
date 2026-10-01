import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { runCommand } from "./process-runner.mjs";

const DEFAULT_MAX_FONT_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120000;
const RUNTIME_REQUIRED_SFNT_TABLES = ["cmap", "glyf", "head", "hhea", "loca", "maxp"];
const RUNTIME_UNUSED_SFNT_TABLES = [
  "gvar",
  "fvar",
  "avar",
  "HVAR",
  "MVAR",
  "STAT",
  "GDEF",
  "GPOS",
  "GSUB",
  "name",
  "post",
];
const FONT_TTC_MAGIC = 0x74746366; // "ttcf" in big-endian
const DEFAULT_FONT_WEIGHT = 400;
const PRINTABLE_ASCII =
  " !\"#$%&'()*+,-./0123456789:;<=>?@" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

export async function prepareFontBase64({
  fontFile,
  sourceText,
  outDir,
  label,
  subset = true,
  maxBytes = DEFAULT_MAX_FONT_BYTES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fontNumber = null,
  weight = DEFAULT_FONT_WEIGHT,
  family = 0,
}) {
  if (!fontFile) return { base64: "", info: null };
  const resolvedFontFile = resolve(process.cwd(), fontFile);
  if (!existsSync(resolvedFontFile)) throw new Error(`font file does not exist: ${resolvedFontFile}`);
  if (!outDir) throw new Error("font subset output directory is required");

  const original = readFileSync(resolvedFontFile);
  if (!subset) {
    ensureFontByteBudget(original.length, maxBytes, resolvedFontFile);
    return {
      base64: original.toString("base64"),
      info: {
        mode: "full",
        source: resolvedFontFile,
        path: resolvedFontFile,
        originalByteSize: original.length,
        byteSize: original.length,
        base64Chars: base64CharCount(original.length),
        glyphCount: 0,
        weight: normalizeFontWeight(weight),
        family: normalizeFontFamily(family),
        maxBytes,
      },
    };
  }

  const glyphText = buildFontSubsetText(sourceText);
  if (glyphText.length === 0) throw new Error("font subset text is empty");

  return prepareFontBase64FromGlyphText({
    fontFile: resolvedFontFile,
    originalByteSize: original.length,
    glyphText,
    outDir,
    label,
    maxBytes,
    timeoutMs,
    fontNumber,
    weight,
    family,
  });
}

export async function prepareFontCascadeBase64({
  fontFiles,
  fontFaces,
  sourceText,
  outDir,
  label,
  subset = true,
  maxBytes = DEFAULT_MAX_FONT_BYTES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fontNumber = null,
  requireFullCoverage = false,
  // Chars from this set may be missing from 匯文明朝體 without failing the
  // build: they flow down the cascade (Songti) like a CSS font-family list.
  // Static app text stays outside this set so the 2026-06-15 "no silent CJK
  // typeface swap" hard-fail is preserved for it. requireFullCoverage still
  // demands that SOME face covers every char.
  cascadeTolerantText = "",
  // Chars from this set are subset into weight-400 faces only. The runtime
  // glyph finder substitutes the nearest weight when an exact face misses a
  // codepoint, so a bold copy would only duplicate megabytes of Ming outlines
  // (the GB2312 floor costs ~3KB/glyph in 匯文明朝體).
  weight400OnlyText = "",
}) {
  const faceCandidates = Array.isArray(fontFaces) && fontFaces.length > 0 ? fontFaces : fontFiles ?? [];
  const faces = normalizeFontFaceCandidates(faceCandidates, fontNumber);
  if (faces.length === 0) return { base64: "", base64s: [], base64Weights: [], base64Families: [], info: null };
  if (!subset) {
    const prepared = [];
    for (let i = 0; i < faces.length; i += 1) {
      const face = faces[i];
      const item = await prepareFontBase64({
        fontFile: face.path,
        sourceText,
        outDir,
        label: `${label || "font"}-${i}`,
        subset: false,
        maxBytes,
        timeoutMs,
        fontNumber: face.fontNumber,
        weight: face.weight,
      });
      if (item.base64.length > 0) prepared.push(item);
    }
    return fontCascadeResult(prepared, maxBytes);
  }

  const glyphText = buildFontSubsetText(sourceText);
  if (glyphText.length === 0) throw new Error("font subset text is empty");
  let remaining = glyphText;
  const prepared = [];
  for (let i = 0; i < faces.length; i += 1) {
    const face = faces[i];
    if (remaining.length === 0 && !face.duplicateGlyphs) continue;
    let probeText = face.duplicateGlyphs ? glyphText : remaining;
    // Chars a non-400 face skips must not vanish from `remaining`, or they
    // would silently escape the requireFullCoverage accounting below.
    let weightExcludedText = "";
    if (weight400OnlyText.length > 0 && normalizeFontWeight(face.weight) !== 400) {
      const filtered = removeCoveredGlyphs(probeText, weight400OnlyText);
      if (!face.duplicateGlyphs) weightExcludedText = removeCoveredGlyphs(probeText, filtered);
      probeText = filtered;
    }
    if (probeText.length === 0) continue;
    const resolvedFontFile = resolve(process.cwd(), face.path);
    if (!existsSync(resolvedFontFile)) throw new Error(`font file does not exist: ${resolvedFontFile}`);
    const coverage = await fontCoverageForText({
      fontFile: resolvedFontFile,
      glyphText: probeText,
      outDir,
      label: `${label || "font"}-${i}`,
      timeoutMs,
      fontNumber: face.fontNumber,
    });
    if (isHuiwenCjkFontPath(resolvedFontFile)) {
      const missingHan = removeCoveredGlyphs(extractHanGlyphs(coverage.missing), cascadeTolerantText);
      if (missingHan.length > 0) {
        const missing = describeMissingGlyphs(missingHan);
        throw new Error(`匯文明朝體 missing Han glyphs: count=${missing.count}, sample=${missing.sample || "(none)"}`);
      }
    }
    if (coverage.covered.length === 0) {
      if (!face.duplicateGlyphs) remaining = coverage.missing + weightExcludedText;
      continue;
    }
    const original = readFileSync(resolvedFontFile);
    prepared.push(await prepareFontBase64FromGlyphText({
      fontFile: resolvedFontFile,
      originalByteSize: original.length,
      glyphText: coverage.covered,
      outDir,
      label: `${label || "font"}-${i}`,
      maxBytes,
      timeoutMs,
      fontNumber: face.fontNumber,
      weight: face.weight,
      family: face.family,
    }));
    remaining = face.duplicateGlyphs
      ? removeCoveredGlyphs(remaining, coverage.covered)
      : coverage.missing + weightExcludedText;
  }
  if (remaining.length > 0) {
    const missing = describeMissingGlyphs(remaining);
    const message = `font cascade missing glyphs: count=${missing.count}, sample=${missing.sample || "(none)"}`;
    if (requireFullCoverage) throw new Error(message);
    process.stderr.write(`    ${message} — continuing without them\n`);
    return fontCascadeResult(prepared, maxBytes);
  }
  return fontCascadeResult(prepared, maxBytes);
}

async function prepareFontBase64FromGlyphText({
  fontFile,
  originalByteSize,
  glyphText,
  outDir,
  label,
  maxBytes,
  timeoutMs,
  fontNumber,
  weight,
  family,
}) {
  const subsetDir = join(outDir, "font-subsets");
  mkdirSync(subsetDir, { recursive: true });
  const resolvedFontNumber = resolveFontNumberForFile(fontFile, fontNumber);
  const normalizedWeight = normalizeFontWeight(weight);
  const hash = createHash("sha256")
    .update(fontFile)
    .update("\0")
    .update(String(resolvedFontNumber))
    .update("\0")
    .update(String(normalizedWeight))
    .update("\0")
    .update(glyphText)
    .digest("hex")
    .slice(0, 16);
  const safeLabel = safeFileName(label || basename(fontFile, extname(fontFile)));
  const glyphTextPath = join(subsetDir, `${safeLabel}.${hash}.glyphs.txt`);
  const subsetPath = join(subsetDir, `${safeLabel}.${hash}.subset.ttf`);
  writeFileSync(glyphTextPath, glyphText, "utf8");

  // Early rejection for CFF/PostScript fonts (not supported by runtime)
  const format = detectFontFormat(fontFile);
  if (format === "cff") {
    throw new Error(
      `CFF/PostScript outline font is not supported: ${fontFile}. ` +
      `Only TrueType (.ttf) fonts with glyf/loca tables are supported.` +
      `请使用 TrueType 字体（如 Noto Sans SC 的 .ttf 版本）替换 CFF 字体。`,
    );
  }

  const args = [
    fontFile,
    `--text-file=${glyphTextPath}`,
    `--output-file=${subsetPath}`,
    "--layout-features=*",
    "--no-ignore-missing-unicodes",
    `--drop-tables+=${RUNTIME_UNUSED_SFNT_TABLES.join(",")}`,
  ];
  if (isFontCollection(fontFile)) {
    args.splice(1, 0, `--font-number=${resolvedFontNumber}`);
  }
  await runCommand(resolvePyftsubset(), args, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      PYTHONNOUSERSITE: "1",
    },
  });

  const subsetBytes = readFileSync(subsetPath);
  if (subsetBytes.length === 0) throw new Error(`font subset output is empty: ${subsetPath}`);
  await assertRuntimeSupportedSfnt(subsetPath, timeoutMs);
  ensureFontByteBudget(subsetBytes.length, maxBytes, subsetPath);
  return {
    base64: subsetBytes.toString("base64"),
    coveredCodepoints: uniqueCodepoints(glyphText),
    info: {
      mode: "subset",
      source: fontFile,
      path: subsetPath,
      glyphText: glyphTextPath,
      originalByteSize,
      byteSize: subsetBytes.length,
      base64Chars: base64CharCount(subsetBytes.length),
      glyphCount: Array.from(glyphText).length,
      hash,
      fontNumber: isFontCollection(fontFile) ? resolvedFontNumber : null,
      weight: normalizedWeight,
      family: normalizeFontFamily(family),
      maxBytes,
    },
  };
}

function fontCascadeResult(prepared, maxBytes) {
  if (prepared.length === 0) return { base64: "", base64s: [], base64Weights: [], base64Families: [], coveredCodepoints: [], info: null };
  const byteSize = prepared.reduce((sum, item) => sum + item.info.byteSize, 0);
  const base64Chars = prepared.reduce((sum, item) => sum + item.info.base64Chars, 0);
  const coveredCodepoints = Array.from(new Set(prepared.flatMap((item) => item.coveredCodepoints ?? [])))
    .sort((left, right) => left - right);
  ensureFontByteBudget(byteSize, maxBytes, "font cascade");
  return {
    base64: prepared[0].base64,
    base64s: prepared.map((item) => item.base64),
    base64Weights: prepared.map((item) => item.info.weight ?? DEFAULT_FONT_WEIGHT),
    base64Families: prepared.map((item) => item.info.family ?? 0),
    coveredCodepoints,
    info: {
      mode: prepared.length === 1 ? prepared[0].info.mode : "cascade",
      byteSize,
      base64Chars,
      glyphCount: prepared.reduce((sum, item) => sum + item.info.glyphCount, 0),
      maxBytes,
      fonts: prepared.map((item) => item.info),
      path: prepared[0].info.path,
    },
  };
}

function describeMissingGlyphs(text) {
  const codepoints = uniqueCodepoints(text).filter((code) => code >= 32);
  return {
    count: codepoints.length,
    sample: codepoints
      .slice(0, 80)
      .map((code) => `U+${code.toString(16).toUpperCase().padStart(4, "0")}(${String.fromCodePoint(code)})`)
      .join(", "),
  };
}

function uniqueCodepoints(text) {
  return Array.from(new Set(Array.from(String(text ?? ""))
    .map((ch) => ch.codePointAt(0))
    .filter((code) => Number.isInteger(code) && code > 0)))
    .sort((left, right) => left - right);
}

// GB2312 level 1+2 Han characters (6763), enumerated deterministically from
// the codec tables. This is the coverage floor for runtime-GENERATED text the
// static scene can never enumerate — geocoded addresses, peer names, typed
// input. Without it any standard Chinese char absent from the static-text
// subset hard-fails on-demand rasterization on device (glyph_fail=773) and
// wedges the route render loop. PUA/non-Han codepoints from the GBK decode
// range are filtered out.
let cachedGb2312HanGlyphInventory = null;
export function gb2312HanGlyphInventory() {
  if (cachedGb2312HanGlyphInventory !== null) return cachedGb2312HanGlyphInventory;
  const decoder = new TextDecoder("gb2312", { fatal: true });
  let out = "";
  for (let hi = 0xb0; hi <= 0xf7; hi += 1) {
    for (let lo = 0xa1; lo <= 0xfe; lo += 1) {
      let ch;
      try {
        ch = decoder.decode(new Uint8Array([hi, lo]));
      } catch {
        continue;
      }
      const code = ch.codePointAt(0);
      if (code !== undefined && isHanCodePoint(code)) out += ch;
    }
  }
  cachedGb2312HanGlyphInventory = out;
  return out;
}

export function buildFontSubsetText(sourceText) {
  const input = `${PRINTABLE_ASCII}\n${sourceText ?? ""}`.normalize("NFC");
  const seen = new Set();
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    if (code < 0x20 && ch !== "\n" && ch !== "\t") continue;
    if (!seen.has(ch)) {
      seen.add(ch);
      out += ch;
    }
  }
  return out;
}

function normalizeFontFaceCandidates(candidates, fontNumber) {
  const out = [];
  for (const candidate of candidates ?? []) {
    const face = normalizeFontFaceCandidate(candidate, fontNumber);
    if (face !== null) out.push(face);
  }
  return out;
}

function normalizeFontFaceCandidate(candidate, fontNumber) {
  if (typeof candidate === "string") {
    if (candidate.length === 0) return null;
    return {
      path: candidate,
      fontNumber,
      weight: DEFAULT_FONT_WEIGHT,
      family: 0,
      duplicateGlyphs: false,
    };
  }
  if (!candidate || typeof candidate !== "object") return null;
  const path = candidate.path ?? candidate.fontFile ?? candidate.source ?? candidate.file;
  if (typeof path !== "string" || path.length === 0) return null;
  return {
    path,
    fontNumber: fontNumber !== null && fontNumber !== undefined ? fontNumber : candidate.fontNumber ?? null,
    weight: normalizeFontWeight(candidate.weight),
    family: normalizeFontFamily(candidate.family),
    duplicateGlyphs: candidate.duplicateGlyphs === true || candidate.duplicateForWeight === true,
  };
}

function normalizeFontFamily(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  const rounded = Math.round(n);
  return rounded === 1 ? 1 : rounded === 2 ? 2 : 0;
}

function normalizeFontWeight(value) {
  if (value === null || value === undefined) return DEFAULT_FONT_WEIGHT;
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_FONT_WEIGHT;
  const rounded = Math.round(n);
  if (rounded < 1) return DEFAULT_FONT_WEIGHT;
  if (rounded > 1000) return 1000;
  return rounded;
}

function removeCoveredGlyphs(text, coveredText) {
  if (text.length === 0 || coveredText.length === 0) return text;
  const covered = new Set(Array.from(coveredText));
  let out = "";
  for (const ch of text) {
    if (!covered.has(ch)) out += ch;
  }
  return out;
}

function isHuiwenCjkFontPath(fontFile) {
  return basename(fontFile) === "匯文明朝體.ttf";
}

function extractHanGlyphs(text) {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code !== undefined && isHanCodePoint(code)) out += ch;
  }
  return out;
}

export function isHanCodePoint(code) {
  return (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x20000 && code <= 0x2a6df) ||
    (code >= 0x2a700 && code <= 0x2b73f) ||
    (code >= 0x2b740 && code <= 0x2b81f) ||
    (code >= 0x2b820 && code <= 0x2ceaf) ||
    (code >= 0x2ceb0 && code <= 0x2ebef) ||
    (code >= 0x2f800 && code <= 0x2fa1f) ||
    (code >= 0x30000 && code <= 0x323af);
}

export function discoverDefaultSystemFontFiles() {
  return discoverDefaultSystemFontFaces()
    .map((face) => face.path)
    .filter((path, index, all) => all.indexOf(path) === index);
}

export function discoverDefaultSystemFontFaces() {
  const candidates = [
    // Match CSS `-apple-system`/BlinkMacSystemFont before generic fallbacks.
    { path: "/System/Library/Fonts/SFNS.ttf", weight: 400 },
    { path: "/System/Library/Fonts/Helvetica.ttc", weight: 700, fontNumber: 1, duplicateGlyphs: true },
    // CJK default: 匯文明朝體 (user decision 2026-06-15). No STHeiti fallback —
    // if this file is missing, requireFullCoverage fails loudly instead of
    // silently swapping the CJK typeface.
    { path: "/Users/lbcheng/Library/Fonts/匯文明朝體.ttf", weight: 400 },
    { path: "/Users/lbcheng/Library/Fonts/匯文明朝體.ttf", weight: 700, duplicateGlyphs: true },
    // Broad fallbacks before narrow CJK/Latin fallbacks keep the generated
    // cascade within the runtime face budget for multilingual PWA content.
    { path: "/System/Library/Fonts/Apple Color Emoji.ttc", weight: 400, fontNumber: 0 },
    { path: "/System/Library/Fonts/Menlo.ttc", weight: 400, family: 1 },
    { path: "/System/Library/Fonts/Supplemental/Arial Unicode.ttf", weight: 400 },
    // Latent same-style fallback: only for non-Han codepoints. Missing Han
    // glyphs in 匯文明朝體 hard-fail above instead of silently switching the
    // primary CJK typeface.
    { path: "/System/Library/Fonts/Supplemental/Songti.ttc", weight: 400, fontNumber: 6 },
    { path: "/System/Library/Fonts/Supplemental/Songti.ttc", weight: 700, fontNumber: 1 },
    { path: "/System/Library/Fonts/Helvetica.ttc", weight: 400, fontNumber: 0 },
    { path: "/System/Library/Fonts/Supplemental/Arial.ttf", weight: 400 },
    { path: "/System/Library/Fonts/SFNSMono.ttf", weight: 400, family: 1 },
    { path: "/System/Library/Fonts/Geneva.ttf", weight: 400 },
    { path: "/System/Library/Fonts/Supplemental/AppleGothic.ttf", weight: 400 },
  ];
  return candidates.filter((face) => existsSync(face.path));
}

function resolveFontNumberForFile(fontFile, fontNumber) {
  if (fontNumber !== null && fontNumber !== undefined) return fontNumber;
  if (!isFontCollection(fontFile)) return 0;
  if (basename(fontFile) === "STHeiti Light.ttc") return 1;
  if (basename(fontFile) === "STHeiti Medium.ttc") return 1;
  return 0;
}

function resolvePyftsubset() {
  const candidates = [
    process.env.PYFTSUBSET,
    "/opt/miniconda3/bin/pyftsubset",
    "/opt/homebrew/bin/pyftsubset",
    "/usr/local/bin/pyftsubset",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return "pyftsubset";
}

function resolveTtx() {
  const candidates = [
    process.env.TTX,
    "/opt/miniconda3/bin/ttx",
    "/opt/homebrew/bin/ttx",
    "/usr/local/bin/ttx",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return "ttx";
}

function resolvePython() {
  const candidates = [
    process.env.PYTHON,
    "/opt/miniconda3/bin/python3",
    "/opt/miniconda3/bin/python",
    "/opt/homebrew/bin/python3",
    "/usr/local/bin/python3",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return "python3";
}

async function fontCoverageForText({ fontFile, glyphText, outDir, label, timeoutMs, fontNumber }) {
  const subsetDir = join(outDir, "font-subsets");
  mkdirSync(subsetDir, { recursive: true });
  const safeLabel = safeFileName(label || basename(fontFile, extname(fontFile)));
  const hash = createHash("sha256").update(fontFile).update("\0coverage\0").update(glyphText).digest("hex").slice(0, 16);
  const probeTextPath = join(subsetDir, `${safeLabel}.${hash}.coverage.txt`);
  writeFileSync(probeTextPath, glyphText, "utf8");
  const script = `
import json
import os
import sys
from fontTools.ttLib import TTFont, TTCollection

font_path = sys.argv[1]
font_number = int(sys.argv[2])
text_path = sys.argv[3]
text = open(text_path, "r", encoding="utf-8").read()
if font_path.lower().endswith((".ttc", ".otc")):
    collection = TTCollection(font_path)
    if font_number < 0 or font_number >= len(collection.fonts):
        raise SystemExit(f"font number out of range: {font_number}")
    font = collection.fonts[font_number]
else:
    font = TTFont(font_path)
cmap = {}
for table in font["cmap"].tables:
    if table.isUnicode():
        cmap.update(table.cmap)
covered = []
missing = []
for ch in text:
    code = ord(ch)
    if code in (9, 10, 13):
        continue
    if code < 32:
        continue
    if code in cmap:
        covered.append(ch)
    else:
        missing.append(ch)
sys.stdout.write(json.dumps({"covered": "".join(covered), "missing": "".join(missing)}, ensure_ascii=False))
`;
  const resolvedFontNumber = resolveFontNumberForFile(fontFile, fontNumber);
  const output = await runCommand(resolvePython(), ["-c", script, fontFile, String(resolvedFontNumber), probeTextPath], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      PYTHONNOUSERSITE: "1",
    },
  });
  const parsed = JSON.parse(output);
  return {
    covered: typeof parsed.covered === "string" ? parsed.covered : "",
    missing: typeof parsed.missing === "string" ? parsed.missing : "",
  };
}

async function assertRuntimeSupportedSfnt(path, timeoutMs) {
  const output = await runCommand(resolveTtx(), ["-l", path], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      PYTHONNOUSERSITE: "1",
    },
  });
  const tables = parseTtxTableList(output);
  if (tables.has("CFF ")) {
    throw new Error(
      `font uses CFF/PostScript outlines (type1/OT-CFF) which are NOT supported by Cheng's web_font_runtime: ${path}. ` +
      `Only TrueType (.ttf) fonts with glyf/loca tables are supported. ` +
      `Present tables: ${[...tables].sort().join(", ") || "(none)"}`,
    );
  }
  const missing = RUNTIME_REQUIRED_SFNT_TABLES.filter((tag) => !tables.has(tag));
  if (missing.length > 0) {
    const present = [...tables].sort().join(", ");
    throw new Error(
      `font subset is not supported by Cheng web_font_runtime: missing SFNT tables ${missing.join(", ")} in ${path}; ` +
      `runtime currently requires TrueType glyf/loca fonts. Present tables: ${present || "(none)"}`,
    );
  }
}

function parseTtxTableList(output) {
  const tables = new Set();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9/ ]{3,4})\s+0x[0-9a-fA-F]+/);
    if (match) tables.add(match[1].trim());
  }
  return tables;
}

function ensureFontByteBudget(byteSize, maxBytes, path) {
  if (byteSize > maxBytes) {
    throw new Error(`font payload ${byteSize} bytes exceeds ${maxBytes} byte budget: ${path}`);
  }
}

function base64CharCount(byteSize) {
  return Math.ceil(byteSize / 3) * 4;
}

function isFontCollection(path) {
  // Check magic bytes first (more reliable than extension), fall back to extension
  if (existsSync(path)) {
    try {
      const magic = readFontMagic(path);
      if (magic === FONT_TTC_MAGIC) return true;
    } catch {
      // Fall through to extension check
    }
  }
  const ext = extname(path).toLowerCase();
  return ext === ".ttc" || ext === ".otc";
}

function readFontMagic(fontPath) {
  const fd = openSync(fontPath, "r");
  try {
    const buf = Buffer.alloc(4);
    const n = readSync(fd, buf, 0, 4, 0);
    if (n < 4) return 0;
    return buf.readUInt32BE(0);
  } finally {
    closeSync(fd);
  }
}

// Detect font format by reading SFNT table directory.
// Returns: 'truetype' | 'cff' | 'collection' | 'unknown'
function detectFontFormat(fontPath) {
  const fd = openSync(fontPath, "r");
  try {
    const magic = Buffer.alloc(4);
    if (readSync(fd, magic, 0, 4, 0) < 4) return "unknown";
    if (magic.readUInt32BE(0) === FONT_TTC_MAGIC) return "collection";

    const header = Buffer.alloc(12);
    if (readSync(fd, header, 0, 12, 0) < 12) return "unknown";
    const sfVersion = header.readUInt32BE(0);
    if (sfVersion !== 0x00010000 && sfVersion !== 0x4f54544f) return "unknown";

    const numTables = header.readUInt16BE(4);
    if (numTables <= 0 || numTables > 4096) return "unknown";

    const dirSize = numTables * 16;
    const dirBuf = Buffer.alloc(dirSize);
    if (readSync(fd, dirBuf, 0, dirSize, 12) < dirSize) return "unknown";

    for (let i = 0; i < numTables; i++) {
      const tag = dirBuf.toString("ascii", i * 16, i * 16 + 4);
      if (tag === "CFF ") return "cff";
      if (tag === "glyf") return "truetype";
    }
    return "unknown";
  } finally {
    closeSync(fd);
  }
}

function safeFileName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "font";
}
