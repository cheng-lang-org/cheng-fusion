// moq-wt.js -- browser WebTransport client for the cheng MoQ segment-stream
// relay (webtransport_moq_relay_main.cheng). Pure Web API, no dependencies.
//
// Wire contract (must match src/libp2p/protocols/media/moq_segment_stream.cheng):
//   - dial: WebTransport("https://<host>:<port>/<path>", {serverCertificateHashes})
//     (ALPN "h3" + SETTINGS preamble + Extended CONNECT are handled by the
//     browser; the relay requires the real h3 preamble -- it is ON by default).
//   - one bidi stream per request: first write the WT_STREAM signal
//     [varint 0x41, varint sessionId] (sessionId 0), then the request frame:
//     [int32BE payloadLen][payload] where payload =
//       [int32BE len][magic "unimaker.moq.segment.stream.v1"]
//       [int32BE len][streamId][int32BE len][segmentKey]
//       [int32BE offset][int32BE length][int32BE readChunk]
//   - the reply is the requested range's RAW bytes on the same stream
//     (unframed, exactly `length` bytes), then the stream is FIN'd.

"use strict";

const MOQ_WT_MAGIC = "unimaker.moq.segment.stream.v1";

function hexToBytes(hex) {
  if (typeof hex !== "string" || hex.length % 2 !== 0) {
    throw new Error("bad hex");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesToHex(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, "0");
  }
  return s;
}

function writeInt32BE(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function encodeText(str) {
  return new TextEncoder().encode(str);
}

// Signal: varint(WT_STREAM reserved frame type 0x41) + varint(sessionId 0).
// RFC 9000 varint: 0x41 = 65 > 63 (1-byte capacity is 6 bits), so it is the
// 2-byte form [0x40, 0x41]; the cheng wire emits the identical bytes.
const WT_STREAM_SIGNAL = new Uint8Array([0x40, 0x41, 0x00]);

function buildRequestBytes(req) {
  const magic = encodeText(MOQ_WT_MAGIC);
  const sid = encodeText(req.streamId);
  const key = encodeText(req.segmentKey);
  const payload = new Uint8Array(
    4 + magic.length + 4 + sid.length + 4 + key.length + 12
  );
  let o = 0;
  writeInt32BE(payload, o, magic.length); o += 4;
  payload.set(magic, o); o += magic.length;
  writeInt32BE(payload, o, sid.length); o += 4;
  payload.set(sid, o); o += sid.length;
  writeInt32BE(payload, o, key.length); o += 4;
  payload.set(key, o); o += key.length;
  writeInt32BE(payload, o, req.offset); o += 4;
  writeInt32BE(payload, o, req.length); o += 4;
  writeInt32BE(payload, o, req.chunk);
  const frame = new Uint8Array(payload.length + 4);
  writeInt32BE(frame, 0, payload.length);
  frame.set(payload, 4);
  return frame;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

// Connect and establish the WebTransport session. certHashHex = the relay's
// WT_MOQ_CERTHASH (SHA-256 of its cert DER) -- pinned, loud on mismatch.
async function connectMoqWt(cfg) {
  const url = "https://" + cfg.host + ":" + cfg.port + (cfg.path || "/wt");
  const certHash = hexToBytes(cfg.certHashHex);
  const transport = new WebTransport(url, {
    serverCertificateHashes: [{ algorithm: "sha-256", value: certHash.buffer }],
  });
  await transport.ready;
  return transport;
}

// Announce block parser (mirrors webtransport_moq_client_main.cheng's
// wtMoqClientAnnounceField): space-separated key=value text padded to 1024B.
function announceField(text, key) {
  const parts = text.split(" ");
  for (let i = 0; i < parts.length; i++) {
    const eq = parts[i].indexOf("=");
    if (eq > 0 && parts[i].slice(0, eq) === key) {
      return parts[i].slice(eq + 1);
    }
  }
  return "";
}

// One range request on one fresh bidi stream; resolves {bytes, hash, firstByteMs}.
async function moqRequestRange(transport, req) {
  const started = performance.now();
  const stream = await transport.createBidirectionalStream();
  const writer = stream.writable.getWriter();
  await writer.write(WT_STREAM_SIGNAL);
  await writer.write(buildRequestBytes(req));
  await writer.close();

  const reader = stream.readable.getReader();
  const chunks = [];
  let received = 0;
  let firstByteMs = 0;
  while (received < req.length) {
    const r = await reader.read();
    if (r.done) {
      if (received < req.length) {
        throw new Error("stream closed before " + req.length + " bytes (got " + received + ")");
      }
      break;
    }
    if (firstByteMs === 0) {
      firstByteMs = performance.now() - started;
    }
    chunks.push(r.value);
    received += r.value.byteLength;
  }
  reader.releaseLock();
  const bytes = new Uint8Array(received);
  let o = 0;
  for (const c of chunks) {
    bytes.set(c, o);
    o += c.byteLength;
  }
  const hash = await sha256Hex(bytes);
  return { bytes, hash, firstByteMs };
}

// The PWA player's request sequence over ONE WT session (identical to the
// cheng client's --player-flow): announce -> poster -> video range, three
// bidi streams on the same session. Hard-asserts announce object_hash and the
// segment hash against expectedHash; loud failure on any mismatch.
async function moqPlayerOpen(cfg, segment, offset, length, expectedHash) {
  const t0 = performance.now();
  const transport = await connectMoqWt(cfg);
  const connectMs = performance.now() - t0;
  const ann = await moqRequestRange(transport, {
    streamId: "pwa-announce-1", segmentKey: "moq-announce", offset: 0, length: 1024, chunk: 1024,
  });
  const announce = new TextDecoder().decode(ann.bytes);
  const objectHash = announceField(announce, "object_hash");
  if (expectedHash && objectHash !== expectedHash) {
    throw new Error("announce object_hash mismatch expected=" + expectedHash + " got=" + objectHash);
  }
  const posterLen = parseInt(announceField(announce, "poster_length"), 10);
  if (!(posterLen > 0)) {
    throw new Error("announce poster_length missing");
  }
  const poster = await moqRequestRange(transport, {
    streamId: "pwa-poster-1", segmentKey: "moq-poster", offset: 0, length: posterLen, chunk: 4096,
  });
  if (poster.bytes.length < 3 || poster.bytes[0] !== 0xff || poster.bytes[1] !== 0xd8 || poster.bytes[2] !== 0xff) {
    throw new Error("poster is not a JPEG (magic mismatch)");
  }
  const seg = await moqRequestRange(transport, {
    streamId: "pwa-segment-1", segmentKey: segment, offset, length, chunk: 4096,
  });
  if (expectedHash && seg.hash !== expectedHash) {
    throw new Error("segment hash mismatch expected=" + expectedHash + " got=" + seg.hash);
  }
  const openMs = performance.now() - t0;
  return {
    transport, announce, poster, segment,
    timings: { connectMs, firstByteMs: seg.firstByteMs, openMs },
  };
}

window.MoqWt = { connectMoqWt, moqRequestRange, moqPlayerOpen, announceField, sha256Hex, bytesToHex, buildRequestBytes, WT_STREAM_SIGNAL };
