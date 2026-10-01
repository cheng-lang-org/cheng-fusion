#!/usr/bin/env node
import { stdin, stdout } from "node:process";

const defaultLimitInputPixels = 4096 * 4096;

function fail(diagnostics) {
  stdout.write(JSON.stringify({ ok: false, diagnostics }) + "\n");
  process.exit(1);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stdin.on("data", (chunk) => chunks.push(chunk));
    stdin.on("error", reject);
    stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function safePositiveInt(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

async function readRemoteBytes(request) {
  let url;
  try {
    url = new URL(request.url);
  } catch (error) {
    fail([`remote_image_url_invalid:${error instanceof Error ? error.message : String(error)}`]);
  }
  if (url.protocol !== "https:") {
    fail([`remote_image_protocol_unsupported:${url.protocol}`]);
  }
  const timeoutMs = safePositiveInt(request.timeoutMs, 15000);
  let response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    fail([`remote_image_fetch_failed:${error instanceof Error ? error.message : String(error)}`]);
  }
  if (!response.ok) {
    fail([`remote_image_http_status:${response.status}`]);
  }
  const maxBytes = safePositiveInt(request.maxBytes, 10 * 1024 * 1024);
  const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isSafeInteger(contentLength) && contentLength > maxBytes) {
    fail([`remote_image_content_length_exceeds_limit:${contentLength}`]);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) {
    fail([`remote_image_bytes_exceeds_limit:${bytes.length}`]);
  }
  return bytes;
}

async function decodeImage(bytes, request) {
  const { default: sharp } = await import("sharp");
  const maxPixels = safePositiveInt(request.maxPixels, 262144);
  const maxDimension = Number.isSafeInteger(request.maxDimension) ? request.maxDimension : 0;
  let metadata;
  try {
    metadata = await sharp(bytes, { limitInputPixels: defaultLimitInputPixels }).metadata();
  } catch (error) {
    fail([`image_decode_metadata_failed:${error instanceof Error ? error.message : String(error)}`]);
  }
  if ((metadata.pages ?? 1) > 1) {
    fail([`animated_image_unsupported:${metadata.format ?? "unknown"}`]);
  }
  let pipeline = sharp(bytes, { limitInputPixels: defaultLimitInputPixels }).rotate().ensureAlpha();
  if (maxDimension > 0) {
    pipeline = pipeline.resize({
      width: maxDimension,
      height: maxDimension,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  let raster;
  try {
    raster = await pipeline.raw().toBuffer({ resolveWithObject: true });
  } catch (error) {
    fail([`image_decode_pixels_failed:${error instanceof Error ? error.message : String(error)}`]);
  }
  const pixelCount = raster.info.width * raster.info.height;
  if (!Number.isSafeInteger(pixelCount) || pixelCount <= 0 || pixelCount > maxPixels) {
    fail([`decoded_image_pixel_count_exceeds_limit:${pixelCount}`]);
  }
  if (raster.info.channels !== 4) {
    fail([`decoded_image_channel_count_unsupported:${raster.info.channels}`]);
  }
  return {
    ok: true,
    width: raster.info.width,
    height: raster.info.height,
    rgbaBase64: raster.data.toString("base64"),
    format: metadata.format ?? "",
    sourceWidth: metadata.width ?? 0,
    sourceHeight: metadata.height ?? 0,
  };
}

const inputText = await readStdin();
let request;
try {
  request = JSON.parse(inputText);
} catch (error) {
  fail([`image_decode_request_invalid:${error instanceof Error ? error.message : String(error)}`]);
}

let bytes;
if (request.mode === "remote-url") {
  bytes = await readRemoteBytes(request);
} else if (request.mode === "bytes-base64") {
  try {
    bytes = Buffer.from(String(request.bytesBase64 ?? ""), "base64");
  } catch (error) {
    fail([`image_decode_base64_invalid:${error instanceof Error ? error.message : String(error)}`]);
  }
  if (bytes.length === 0) fail(["image_decode_empty_bytes"]);
} else {
  fail([`image_decode_mode_unsupported:${String(request.mode)}`]);
}

stdout.write(JSON.stringify(await decodeImage(bytes, request)) + "\n");
