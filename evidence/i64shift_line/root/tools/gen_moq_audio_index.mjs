#!/usr/bin/env node
// Demux an mp4's AAC audio track into an ADTS elementary stream + a compact per-frame
// index for MoQ per-frame audio streaming — the audio mirror of gen_moq_es_index.mjs.
// Each ADTS access unit carries its own 7-byte header (sample-rate index / channel
// config / profile), so the decoder self-configures from frame 0 with IS_ADTS=1 — no
// csd, same as the video ES inlines SPS/PPS per IDR. Each AU is a small object the
// player fetches sequentially and feeds straight to the AAC decoder.
//
//   node tools/gen_moq_audio_index.mjs <input.mp4> <out.aac> <out.aidx>
//
// .aidx layout (little-endian):
//   magic "MQAS"(4) version u32 sample_rate u32 channels u32 profile u32
//   frame_count u32 audio_total_bytes u32        (= 32-byte header)
//   then frame_count * { offset u32, size u32 }  (8B each)
// profile = MPEG-4 Audio Object Type (LC=2), derived from the ADTS header's 2-bit
// profile field + 1 (ADTS stores AOT-1). sample_rate/channels likewise come from the
// ADTS header so the index matches exactly what the decoder will see.
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, statSync } from "node:fs";

const [, , inMp4, outAac, outIdx] = process.argv;
if (!inMp4 || !outAac || !outIdx) {
  console.error("usage: gen_moq_audio_index.mjs <input.mp4> <out.aac> <out.aidx>");
  process.exit(2);
}

// 1) mp4 -> ADTS AAC (copy the AAC track, no re-encode; ffmpeg adds ADTS headers)
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", inMp4,
  "-vn", "-acodec", "copy", "-f", "adts", outAac]);
const audioTotal = statSync(outAac).size;
const aac = readFileSync(outAac);

// 2) ADTS sample-rate-index table (ISO/IEC 14496-3)
const SR_TABLE = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050,
                  16000, 12000, 11025, 8000, 7350, 0, 0, 0];

// 3) walk ADTS frames: each starts with syncword 0xFFF; frame_length is a 13-bit field
// spanning bytes 3..5. Parse sample-rate/channels/profile from the FIRST header.
let off = 0;
const frames = [];
let sampleRate = 0, channels = 0, profile = 0;
while (off + 7 <= aac.length) {
  if (aac[off] !== 0xFF || (aac[off + 1] & 0xF0) !== 0xF0) {
    console.error(`FATAL: lost ADTS sync at offset ${off} (byte=0x${aac[off].toString(16)})`);
    process.exit(1);
  }
  const frameLen = ((aac[off + 3] & 0x03) << 11) | (aac[off + 4] << 3) | ((aac[off + 5] & 0xE0) >> 5);
  if (frameLen < 7 || off + frameLen > aac.length) {
    console.error(`FATAL: bad ADTS frame_length=${frameLen} at offset ${off} (total=${aac.length})`);
    process.exit(1);
  }
  if (frames.length === 0) {
    const profileBits = (aac[off + 2] & 0xC0) >> 6;   // 2-bit ADTS profile = AOT-1
    profile = profileBits + 1;                         // -> MPEG-4 Audio Object Type (LC=2)
    const srIdx = (aac[off + 2] & 0x3C) >> 2;          // 4-bit sampling-frequency index
    sampleRate = SR_TABLE[srIdx];
    channels = ((aac[off + 2] & 0x01) << 2) | ((aac[off + 3] & 0xC0) >> 6); // 3-bit channel config
  }
  frames.push({ offset: off, size: frameLen });
  off += frameLen;
}
if (off !== audioTotal) { console.error(`FATAL: sum(frame_len)=${off} != adts bytes=${audioTotal}`); process.exit(1); }
if (sampleRate <= 0 || channels <= 0 || profile <= 0 || frames.length === 0) {
  console.error(`FATAL: bad ADTS params sr=${sampleRate} ch=${channels} profile=${profile} frames=${frames.length}`);
  process.exit(1);
}

// 4) serialize
const HEADER_BYTES = 32;
const buf = Buffer.alloc(HEADER_BYTES + frames.length * 8);
buf.write("MQAS", 0, "ascii");
buf.writeUInt32LE(1, 4); buf.writeUInt32LE(sampleRate, 8); buf.writeUInt32LE(channels, 12);
buf.writeUInt32LE(profile, 16); buf.writeUInt32LE(frames.length, 20); buf.writeUInt32LE(audioTotal, 24);
// byte 28..31 reserved (0)
frames.forEach((f, i) => {
  const b = HEADER_BYTES + i * 8;
  buf.writeUInt32LE(f.offset, b); buf.writeUInt32LE(f.size, b + 4);
});
writeFileSync(outIdx, buf);
console.log(`aac=${outAac} ${audioTotal}B  index=${outIdx} ${buf.length}B  frames=${frames.length} ${sampleRate}Hz ch=${channels} aot=${profile}`);
