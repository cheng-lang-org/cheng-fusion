#!/usr/bin/env node
// Demux an mp4 into an Annex-B H.264 elementary stream + a compact per-frame index
// for MoQ per-frame streaming (production-correct: each access unit is a small object
// the player fetches sequentially and feeds straight to the decoder — no random-access
// readAt, no large transfers that stall on the loss-recovery-less Cheng QUIC).
//
//   node tools/gen_moq_es_index.mjs <input.mp4> <out.h264> <out.moqidx>
//
// Current .moqidx layout (little-endian, exact):
//   magic "MQES"(4) format u32 width u32 height u32 fps_num u32 fps_den u32
//   frame_count u32 es_total_bytes u32 rotation i32
//   then frame_count * { offset u32, size u32, flags u32 (bit0=keyframe) }  (12B each)
// rotation is the container display-matrix rotation (raw signed value stored as
// i32 two's complement, e.g. -90 → 0xFFFFFFA6); the player normalizes it the same
// way the whole-file AMediaExtractor path normalizes KEY_ROTATION, so ES playback
// is oriented identically. Only format CURRENT is emitted; readers reject every
// other format and every non-exact byte length.
// Annex-B frames are concatenated in decode order, so offset[i] = sum(size[0..i-1]).
import { execFileSync } from "node:child_process";
import { writeFileSync, statSync } from "node:fs";

const [, , inMp4, outH264, outIdx] = process.argv;
if (!inMp4 || !outH264 || !outIdx) {
  console.error("usage: gen_moq_es_index.mjs <input.mp4> <out.h264> <out.moqidx>");
  process.exit(2);
}

const FORMAT_CURRENT = 2;
const HEADER_BYTES = 36;
const ENTRY_BYTES = 12;
const FLAG_KEYFRAME = 1;
const MAX_I32 = 0x7fffffff;

function fatal(reason) {
  console.error(`FATAL: ${reason}`);
  process.exit(1);
}

function exactPositiveInt(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_I32) {
    fatal(`${field} is outside exact positive int32 range: ${value}`);
  }
  return value;
}

// 1) mp4 -> Annex-B (inline SPS/PPS at each IDR via mp4toannexb)
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", inMp4,
  "-c:v", "copy", "-bsf:v", "h264_mp4toannexb", "-f", "h264", outH264]);
const esTotalBig = statSync(outH264, { bigint: true }).size;
if (esTotalBig <= 0n || esTotalBig > BigInt(MAX_I32)) {
  fatal(`es_total_bytes is outside exact positive int32 range: ${esTotalBig}`);
}
const esTotal = Number(esTotalBig);

// 2) per-frame size + keyframe flag (decode order)
const pkts = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v",
  "-show_packets", "-show_entries", "packet=size,flags", "-of", "csv=p=0", outH264])
  .toString().trim().split("\n").filter(Boolean)
  .map((line, index) => {
    const fields = line.split(",");
    if (fields.length !== 2 || !/^[K_]*$/.test(fields[1])) {
      fatal(`packet[${index}] has unsupported ffprobe fields: ${line}`);
    }
    const [sizeText, flagsText] = fields;
    const size = exactPositiveInt(Number(sizeText), `packet[${index}].size`);
    return {
      size,
      flags: flagsText.includes("K") ? FLAG_KEYFRAME : 0,
    };
  });
if (pkts.length === 0 || pkts.length > Math.floor((MAX_I32 - HEADER_BYTES) / ENTRY_BYTES)) {
  fatal(`frame_count is outside exact current-format range: ${pkts.length}`);
}
if ((pkts[0].flags & FLAG_KEYFRAME) === 0) {
  fatal("frame[0] is not a keyframe");
}

// 3) stream metadata
const metadata = JSON.parse(execFileSync("ffprobe", [
  "-v", "error", "-select_streams", "v:0",
  "-show_entries", "stream=width,height,r_frame_rate:stream_side_data=rotation",
  "-of", "json", inMp4,
]).toString());
if (!Array.isArray(metadata.streams) || metadata.streams.length !== 1) {
  fatal(`expected exactly one selected video stream, got ${metadata.streams?.length ?? 0}`);
}
const stream = metadata.streams[0];
const width = exactPositiveInt(Number(stream.width), "width");
const height = exactPositiveInt(Number(stream.height), "height");
const fpsParts = String(stream.r_frame_rate ?? "").split("/");
if (fpsParts.length !== 2) {
  fatal(`r_frame_rate is not an exact rational: ${stream.r_frame_rate}`);
}
const fpsNum = exactPositiveInt(Number(fpsParts[0]), "fps_num");
const fpsDen = exactPositiveInt(Number(fpsParts[1]), "fps_den");
if (Math.floor(fpsNum / fpsDen) <= 0) {
  fatal(`fps rational truncates to a non-positive runtime rate: ${fpsNum}/${fpsDen}`);
}
const rotations = (stream.side_data_list ?? [])
  .filter((entry) => Object.hasOwn(entry, "rotation"))
  .map((entry) => Number(entry.rotation));
if (rotations.length > 1) {
  fatal(`multiple display rotations in selected stream: ${rotations.join(",")}`);
}
const rotation = rotations.length === 1 ? rotations[0] : 0;
if (!Number.isSafeInteger(rotation) ||
    ![0, 90, -90, 180, -180, 270, -270].includes(rotation)) {
  fatal(`rotation is not a canonical quarter-turn: ${rotation}`);
}

// 4) cumulative offsets + sanity
let off = 0n;
const frames = pkts.map((packet, index) => {
  const offset = off;
  off += BigInt(packet.size);
  if (offset > BigInt(MAX_I32) || off > BigInt(MAX_I32)) {
    fatal(`frame[${index}] range exceeds exact int32 ES domain`);
  }
  return { offset: Number(offset), size: packet.size, flags: packet.flags };
});
if (off !== esTotalBig) {
  fatal(`sum(sizes)=${off} != es bytes=${esTotalBig}`);
}

// 5) serialize the one current format.
const exactLength = HEADER_BYTES + frames.length * ENTRY_BYTES;
const buf = Buffer.alloc(exactLength);
buf.write("MQES", 0, "ascii");
buf.writeUInt32LE(FORMAT_CURRENT, 4); buf.writeUInt32LE(width, 8); buf.writeUInt32LE(height, 12);
buf.writeUInt32LE(fpsNum, 16); buf.writeUInt32LE(fpsDen, 20);
buf.writeUInt32LE(frames.length, 24); buf.writeUInt32LE(esTotal, 28);
buf.writeInt32LE(rotation, 32);
frames.forEach((f, i) => {
  const b = HEADER_BYTES + i * ENTRY_BYTES;
  buf.writeUInt32LE(f.offset, b); buf.writeUInt32LE(f.size, b + 4); buf.writeUInt32LE(f.flags, b + 8);
});
writeFileSync(outIdx, buf);
console.log(`format=${FORMAT_CURRENT} header=${HEADER_BYTES} es=${outH264} ${esTotal}B index=${outIdx} ${buf.length}B frames=${frames.length} key=${frames.filter(f => (f.flags & FLAG_KEYFRAME) !== 0).length} ${width}x${height} ${fpsNum}/${fpsDen}fps rotation=${rotation}`);
