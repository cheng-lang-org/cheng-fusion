#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

const FORMAT_CURRENT = 2;
const HEADER_BYTES = 36;
const ENTRY_BYTES = 12;
const FLAG_KEYFRAME = 1;
const MAX_I32 = 0x7fffffff;
const ROTATIONS = new Set([0, 90, -90, 180, -180, 270, -270]);

function reject(reason) {
  console.error("schema=moq_es_index_current_oracle");
  console.error("status=FAIL");
  console.error(`reason=${reason}`);
  process.exit(1);
}

const [, , indexPath, esPath] = process.argv;
if (!indexPath || !esPath) {
  console.error("usage: moq_es_index_current_oracle.mjs <index.moqidx> <stream.h264>");
  process.exit(2);
}

const index = readFileSync(indexPath);
if (index.length < HEADER_BYTES) reject("short_header");
if (!index.subarray(0, 4).equals(Buffer.from("MQES", "ascii"))) reject("magic");

const format = index.readUInt32LE(4);
const width = index.readUInt32LE(8);
const height = index.readUInt32LE(12);
const fpsNum = index.readUInt32LE(16);
const fpsDen = index.readUInt32LE(20);
const frameCount = index.readUInt32LE(24);
const esTotal = index.readUInt32LE(28);
const rotation = index.readInt32LE(32);

if (format !== FORMAT_CURRENT) reject(`format:${format}`);
for (const [name, value] of [
  ["width", width],
  ["height", height],
  ["fps_num", fpsNum],
  ["fps_den", fpsDen],
  ["frame_count", frameCount],
  ["es_total_bytes", esTotal],
]) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_I32) {
    reject(`${name}:${value}`);
  }
}
if (Math.floor(fpsNum / fpsDen) <= 0) reject(`fps:${fpsNum}/${fpsDen}`);
if (!ROTATIONS.has(rotation)) reject(`rotation:${rotation}`);

const exactLength = BigInt(HEADER_BYTES) + BigInt(frameCount) * BigInt(ENTRY_BYTES);
if (BigInt(index.length) !== exactLength) {
  reject(`exact_length:${index.length}:${exactLength}`);
}

let expectedOffset = 0n;
let keyframes = 0;
for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
  const base = HEADER_BYTES + frameIndex * ENTRY_BYTES;
  const offset = index.readUInt32LE(base);
  const size = index.readUInt32LE(base + 4);
  const flags = index.readUInt32LE(base + 8);
  if (offset > MAX_I32 || size <= 0 || size > MAX_I32) {
    reject(`frame_range_domain:${frameIndex}:${offset}:${size}`);
  }
  if (BigInt(offset) !== expectedOffset) {
    reject(`table_gap:${frameIndex}:${offset}:${expectedOffset}`);
  }
  if (flags !== 0 && flags !== FLAG_KEYFRAME) {
    reject(`flags:${frameIndex}:${flags}`);
  }
  if (frameIndex === 0 && flags !== FLAG_KEYFRAME) {
    reject("first_frame_not_keyframe");
  }
  if ((flags & FLAG_KEYFRAME) !== 0) keyframes += 1;
  expectedOffset += BigInt(size);
  if (expectedOffset > BigInt(esTotal)) reject(`frame_end:${frameIndex}:${expectedOffset}`);
}
if (expectedOffset !== BigInt(esTotal)) {
  reject(`es_total_table:${expectedOffset}:${esTotal}`);
}

const esLength = statSync(esPath, { bigint: true }).size;
if (esLength !== BigInt(esTotal)) reject(`es_total_file:${esLength}:${esTotal}`);

const sha256 = createHash("sha256").update(index).digest("hex");
console.log("schema=moq_es_index_current_oracle");
console.log("status=PASS");
console.log(`format=${format}`);
console.log(`header_bytes=${HEADER_BYTES}`);
console.log(`index_bytes=${index.length}`);
console.log(`index_sha256=${sha256}`);
console.log(`width=${width}`);
console.log(`height=${height}`);
console.log(`fps_num=${fpsNum}`);
console.log(`fps_den=${fpsDen}`);
console.log(`frame_count=${frameCount}`);
console.log(`es_total_bytes=${esTotal}`);
console.log(`rotation=${rotation}`);
console.log(`keyframe_count=${keyframes}`);
