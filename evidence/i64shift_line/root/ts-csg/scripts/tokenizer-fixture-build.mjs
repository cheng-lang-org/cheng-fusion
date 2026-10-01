#!/usr/bin/env node
// tokenizer-fixture-build.mjs
//
// Build-time converter: HF tokenizer.json (Qwen2.5-family byte-level BPE) ->
// compact little-endian binary fixture consumed by src/inference/tokenizer.cheng
// at runtime. Node's native JSON.parse handles the ~7MB source file directly
// (build-only tool, not part of the Cheng runtime); the Cheng runtime never
// parses JSON and never sees the GPT2 "visible unicode" byte encoding -- both
// vocab and merges are stored as raw bytes so the runtime operates purely on
// UTF-8 byte streams.
//
// Format (all integers little-endian):
//   header:
//     int32 magic = 0x314b4f54  ("TOK1" read back as this int32)
//     int32 version = 1
//     int32 vocabCount
//     int32 mergeCount
//     int32 specialCount
//     int64 contentHash   (WeightTensorHashStep-style rolling hash, see below)
//   vocab section:
//     int32[vocabCount]  byte length per vocab id (id is the implicit index,
//                        ids are dense 0..vocabCount-1 -- verified below)
//     u8[]               raw bytes of every vocab entry, concatenated in id order
//   merges section (parallel arrays, index = rank, rank order = priority order):
//     int32[mergeCount]  leftId
//     int32[mergeCount]  rightId
//     int32[mergeCount]  resultId
//   special section (specialCount records, each variable-length):
//     repeated { int32 id, int32 contentByteLen, u8[contentByteLen] contentBytes }
//
// Usage: node tokenizer-fixture-build.mjs <tokenizer.json> <out.bin>

import { readFileSync, writeFileSync } from "node:fs";

const [, , tokenizerJsonPath, outPath] = process.argv;
if (!tokenizerJsonPath || !outPath) {
  console.error("usage: node tokenizer-fixture-build.mjs <tokenizer.json> <out.bin>");
  process.exit(1);
}

const doc = JSON.parse(readFileSync(tokenizerJsonPath, "utf8"));

if (doc.model?.type !== "BPE") {
  throw new Error(`unsupported model.type: ${doc.model?.type}`);
}
if (doc.model.byte_fallback) {
  throw new Error("byte_fallback=true is not handled by this converter (Qwen2.5 uses false)");
}
if (doc.normalizer?.type !== "NFC") {
  throw new Error(`unsupported normalizer: ${JSON.stringify(doc.normalizer)}`);
}
const preTok = doc.pre_tokenizer;
if (preTok?.type !== "Sequence" || preTok.pretokenizers?.length !== 2 ||
    preTok.pretokenizers[0].type !== "Split" || preTok.pretokenizers[1].type !== "ByteLevel") {
  throw new Error(`unsupported pre_tokenizer shape: ${JSON.stringify(preTok)}`);
}
const splitPattern = preTok.pretokenizers[0].pattern?.Regex;
const EXPECTED_PATTERN =
  "(?i:'s|'t|'re|'ve|'m|'ll|'d)|[^\\r\\n\\p{L}\\p{N}]?\\p{L}+|\\p{N}| ?[^\\s\\p{L}\\p{N}]+[\\r\\n]*|\\s*[\\r\\n]+|\\s+(?!\\S)|\\s+";
if (splitPattern !== EXPECTED_PATTERN) {
  throw new Error(`unexpected GPT2 split regex (won't match hand-ported Cheng pretokenizer):\n${splitPattern}`);
}
if (preTok.pretokenizers[0].behavior !== "Isolated") {
  throw new Error(`unsupported Split behavior: ${preTok.pretokenizers[0].behavior}`);
}

// ---------------------------------------------------------------------------
// GPT2 standard bytes_to_unicode() bijection (Radford et al. / HF `tokenizers`
// crate). Maps every raw byte 0..255 to a "visible" unicode codepoint so the
// vocab/merges can be stored as printable JSON strings. We only need the
// inverse (visible codepoint -> raw byte) to decode the fixture back to bytes.
// ---------------------------------------------------------------------------
function bytesToUnicodeMap() {
  const bs = [];
  for (let i = "!".charCodeAt(0); i <= "~".charCodeAt(0); i++) bs.push(i);
  for (let i = 0xa1; i <= 0xac; i++) bs.push(i);
  for (let i = 0xae; i <= 0xff; i++) bs.push(i);
  const cs = [...bs];
  let n = 0;
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b);
      cs.push(256 + n);
      n++;
    }
  }
  const byteToChar = new Map();
  for (let i = 0; i < bs.length; i++) byteToChar.set(bs[i], cs[i]);
  return byteToChar;
}
const byteToChar = bytesToUnicodeMap();
if (byteToChar.size !== 256) throw new Error(`bytes_to_unicode map size ${byteToChar.size} != 256`);
const charToByte = new Map();
for (const [b, c] of byteToChar) {
  if (charToByte.has(c)) throw new Error(`bytes_to_unicode collision at codepoint ${c}`);
  charToByte.set(c, b);
}

function visibleStringToBytes(s) {
  const out = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    const b = charToByte.get(cp);
    if (b === undefined) {
      throw new Error(`codepoint U+${cp.toString(16)} in ${JSON.stringify(s)} is not a valid GPT2 byte-level char`);
    }
    out.push(b);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Vocab: decode every visible-unicode key back to raw bytes; ids must be
// dense 0..N-1 (verified, not assumed).
// ---------------------------------------------------------------------------
const vocabEntries = Object.entries(doc.model.vocab); // [visibleStr, id]
const vocabCount = vocabEntries.length;
const vocabBytes = new Array(vocabCount);
const seenIds = new Uint8Array(vocabCount);
for (const [visible, id] of vocabEntries) {
  if (id < 0 || id >= vocabCount) throw new Error(`vocab id ${id} out of dense range [0,${vocabCount})`);
  if (seenIds[id]) throw new Error(`duplicate vocab id ${id}`);
  seenIds[id] = 1;
  vocabBytes[id] = visibleStringToBytes(visible);
}
for (let i = 0; i < vocabCount; i++) {
  if (!seenIds[i]) throw new Error(`vocab id ${i} missing -- ids are not dense`);
}
console.error(`vocab: ${vocabCount} entries, dense id range verified`);

// byte-sequence -> id reverse index, for merges resolution.
function bytesKey(arr) {
  return arr.join(",");
}
const bytesToId = new Map();
for (let id = 0; id < vocabCount; id++) {
  const key = bytesKey(vocabBytes[id]);
  if (bytesToId.has(key)) throw new Error(`duplicate vocab byte sequence for ids ${bytesToId.get(key)} and ${id}`);
  bytesToId.set(key, id);
}
// byte-level BPE completeness invariant: all 256 single bytes must be present.
for (let b = 0; b < 256; b++) {
  if (!bytesToId.has(bytesKey([b]))) throw new Error(`single byte ${b} missing from vocab (byte-level BPE base alphabet incomplete)`);
}

// ---------------------------------------------------------------------------
// Merges: "left right" visible-encoded strings -> resolve to (leftId,
// rightId, resultId) via raw-byte concatenation lookup in vocab. Rank = line
// index (HF merge priority order).
// ---------------------------------------------------------------------------
const rawMerges = doc.model.merges;
const mergeCount = rawMerges.length;
const leftIds = new Int32Array(mergeCount);
const rightIds = new Int32Array(mergeCount);
const resultIds = new Int32Array(mergeCount);
for (let rank = 0; rank < mergeCount; rank++) {
  const line = rawMerges[rank];
  const spaceIdx = line.indexOf(" ");
  if (spaceIdx < 0) throw new Error(`merge line ${rank} has no separator space: ${JSON.stringify(line)}`);
  const leftVisible = line.slice(0, spaceIdx);
  const rightVisible = line.slice(spaceIdx + 1);
  const leftBytes = visibleStringToBytes(leftVisible);
  const rightBytes = visibleStringToBytes(rightVisible);
  const leftId = bytesToId.get(bytesKey(leftBytes));
  const rightId = bytesToId.get(bytesKey(rightBytes));
  if (leftId === undefined) throw new Error(`merge ${rank}: left piece ${JSON.stringify(leftVisible)} not in vocab`);
  if (rightId === undefined) throw new Error(`merge ${rank}: right piece ${JSON.stringify(rightVisible)} not in vocab`);
  const resultBytes = leftBytes.concat(rightBytes);
  const resultId = bytesToId.get(bytesKey(resultBytes));
  if (resultId === undefined) {
    throw new Error(`merge ${rank}: concatenated result ${JSON.stringify(leftVisible + rightVisible)} not in vocab`);
  }
  leftIds[rank] = leftId;
  rightIds[rank] = rightId;
  resultIds[rank] = resultId;
}
console.error(`merges: ${mergeCount} entries, 100% resolved to vocab ids`);

// ---------------------------------------------------------------------------
// Specials: added_tokens are literal UTF-8 text (not GPT2 byte-visible
// encoded) matched verbatim against raw input text before pre-tokenization.
// ---------------------------------------------------------------------------
const addedTokens = doc.added_tokens || [];
for (const t of addedTokens) {
  // Both special=true (chat-template control tokens) and special=false
  // ("normal" added tokens like <tool_call>) are matched verbatim against
  // raw input text before the Sequence pre-tokenizer runs (HF AddedVocabulary
  // is-isolated split); `special` only affects skip_special_tokens on decode,
  // not tokenization mechanics, so both are treated identically here.
  if (t.lstrip || t.rstrip || t.single_word || t.normalized) {
    throw new Error(`added_token id=${t.id} has unsupported strip/normalize flags: ${JSON.stringify(t)}`);
  }
}
const specials = addedTokens
  .map((t) => ({ id: t.id, bytes: [...Buffer.from(t.content, "utf8")] }))
  .sort((a, b) => a.id - b.id);
console.error(`specials: ${specials.length} entries`);

// ---------------------------------------------------------------------------
// Serialize.
// ---------------------------------------------------------------------------
const MAGIC = 0x314b4f54; // "TOK1"
const VERSION = 1;

function hashStep(h, v) {
  let mixed = BigInt.asIntN(64, h * 524287n + v + 113n);
  if (mixed < 0n) mixed = BigInt.asIntN(64, -mixed);
  return mixed;
}

let contentHash = 113n;
const step = (v) => { contentHash = hashStep(contentHash, BigInt(v)); };
step(MAGIC);
step(VERSION);
step(vocabCount);
step(mergeCount);
step(specials.length);
for (let id = 0; id < vocabCount; id++) step(vocabBytes[id].length);
for (let id = 0; id < vocabCount; id++) for (const b of vocabBytes[id]) step(b);
for (let i = 0; i < mergeCount; i++) step(leftIds[i]);
for (let i = 0; i < mergeCount; i++) step(rightIds[i]);
for (let i = 0; i < mergeCount; i++) step(resultIds[i]);
for (const s of specials) { step(s.id); step(s.bytes.length); for (const b of s.bytes) step(b); }

let totalVocabBytes = 0;
for (let id = 0; id < vocabCount; id++) totalVocabBytes += vocabBytes[id].length;
let totalSpecialBytes = 0;
for (const s of specials) totalSpecialBytes += s.bytes.length;

const headerBytes = 5 * 4 + 8;
const vocabSectionBytes = vocabCount * 4 + totalVocabBytes;
const mergeSectionBytes = mergeCount * 4 * 3;
const specialSectionBytes = specials.length * (4 + 4) + totalSpecialBytes;
const totalBytes = headerBytes + vocabSectionBytes + mergeSectionBytes + specialSectionBytes;

const buf = Buffer.alloc(totalBytes);
let off = 0;
function w32(v) { buf.writeInt32LE(v | 0, off); off += 4; }
function w8(v) { buf.writeUInt8(v & 0xff, off); off += 1; }
w32(MAGIC);
w32(VERSION);
w32(vocabCount);
w32(mergeCount);
w32(specials.length);
buf.writeBigInt64LE(BigInt.asIntN(64, contentHash), off); off += 8;
for (let id = 0; id < vocabCount; id++) w32(vocabBytes[id].length);
for (let id = 0; id < vocabCount; id++) for (const b of vocabBytes[id]) w8(b);
for (let i = 0; i < mergeCount; i++) w32(leftIds[i]);
for (let i = 0; i < mergeCount; i++) w32(rightIds[i]);
for (let i = 0; i < mergeCount; i++) w32(resultIds[i]);
for (const s of specials) { w32(s.id); w32(s.bytes.length); for (const b of s.bytes) w8(b); }

if (off !== totalBytes) throw new Error(`serialization size mismatch: wrote ${off}, expected ${totalBytes}`);

writeFileSync(outPath, buf);
console.error(`wrote ${outPath}: ${buf.length} bytes, contentHash=${contentHash.toString()}`);
