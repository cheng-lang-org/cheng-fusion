// @ts-nocheck

const JSON_RPC_MAX_HEADER_BYTES = 8 * 1024;
const JSON_RPC_MAX_FRAME_BYTES = 64 * 1024 * 1024;
const JSON_RPC_UTF8_DECODER = new TextDecoder("utf-8", {fatal: true});
const JSON_RPC_HEADER_DELIMITER = Buffer.from("\r\n\r\n", "ascii");
const JSON_RPC_HEADER_DELIMITER_PREFIX = [0, 0, 1, 2];

class BufferQueue {
  constructor() {
    this.chunks = [];
    this.headIndex = 0;
    this.headOffset = 0;
    this.length = 0;
  }

  push(chunk) {
    if (chunk.length === 0) return;
    this.chunks.push(chunk);
    this.length += chunk.length;
  }

  clear() {
    this.chunks = [];
    this.headIndex = 0;
    this.headOffset = 0;
    this.length = 0;
  }

  scanByte(byte, cursor = null) {
    let chunkIndex = cursor?.chunkIndex ?? this.headIndex;
    let chunkOffset = cursor?.chunkOffset ?? this.headOffset;
    let logicalOffset = cursor?.logicalOffset ?? 0;
    for (; chunkIndex < this.chunks.length; chunkIndex++, chunkOffset = 0) {
      const chunk = this.chunks[chunkIndex];
      const found = chunk.indexOf(byte, chunkOffset);
      if (found >= 0) return {index: logicalOffset + found - chunkOffset, cursor: null};
      logicalOffset += chunk.length - chunkOffset;
    }
    return {index: -1, cursor: {chunkIndex, chunkOffset: 0, logicalOffset}};
  }

  scanFirstNonWhitespace(cursor = null) {
    let chunkIndex = cursor?.chunkIndex ?? this.headIndex;
    let chunkOffset = cursor?.chunkOffset ?? this.headOffset;
    let logicalOffset = cursor?.logicalOffset ?? 0;
    for (; chunkIndex < this.chunks.length; chunkIndex++, chunkOffset = 0) {
      const chunk = this.chunks[chunkIndex];
      while (chunkOffset < chunk.length) {
        const byte = chunk[chunkOffset++];
        if (byte !== 0x09 && byte !== 0x0a && byte !== 0x0d && byte !== 0x20) {
          return {index: logicalOffset, byte, cursor: null};
        }
        logicalOffset++;
      }
    }
    return {index: -1, byte: null, cursor: {chunkIndex, chunkOffset: 0, logicalOffset}};
  }

  scanSequence(sequence, prefix, cursor = null) {
    let chunkIndex = cursor?.chunkIndex ?? this.headIndex;
    let chunkOffset = cursor?.chunkOffset ?? this.headOffset;
    let logicalOffset = cursor?.logicalOffset ?? 0;
    let matched = cursor?.matched ?? 0;
    for (; chunkIndex < this.chunks.length; chunkIndex++, chunkOffset = 0) {
      const chunk = this.chunks[chunkIndex];
      while (chunkOffset < chunk.length) {
        const byte = chunk[chunkOffset++];
        while (matched > 0 && byte !== sequence[matched]) matched = prefix[matched - 1];
        if (byte === sequence[matched]) matched++;
        if (matched === sequence.length) {
          return {index: logicalOffset - sequence.length + 1, cursor: null};
        }
        logicalOffset++;
      }
    }
    return {index: -1, cursor: {chunkIndex, chunkOffset: 0, logicalOffset, matched}};
  }

  peek(length) {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.length) {
      throw new Error(`invalid buffer peek length ${length}`);
    }
    if (length === 0) return Buffer.alloc(0);
    const first = this.chunks[this.headIndex];
    if (first && first.length - this.headOffset >= length) {
      return first.subarray(this.headOffset, this.headOffset + length);
    }
    const output = Buffer.allocUnsafe(length);
    let written = 0;
    for (let index = this.headIndex; index < this.chunks.length && written < length; index++) {
      const chunk = this.chunks[index];
      const start = index === this.headIndex ? this.headOffset : 0;
      const take = Math.min(chunk.length - start, length - written);
      chunk.copy(output, written, start, start + take);
      written += take;
    }
    return output;
  }

  discard(length) {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.length) {
      throw new Error(`invalid buffer discard length ${length}`);
    }
    let remaining = length;
    while (remaining > 0) {
      const first = this.chunks[this.headIndex];
      const available = first.length - this.headOffset;
      if (remaining < available) {
        this.headOffset += remaining;
        this.length -= remaining;
        return;
      }
      remaining -= available;
      this.length -= available;
      this.headIndex++;
      this.headOffset = 0;
    }
    if (this.length === 0) {
      this.clear();
    } else if (this.headIndex >= 1024 && this.headIndex * 2 >= this.chunks.length) {
      this.chunks = this.chunks.slice(this.headIndex);
      this.headIndex = 0;
    }
  }

  read(length) {
    const output = this.peek(length);
    this.discard(length);
    return output;
  }
}

function parseJsonFrame(body, label) {
  let text;
  try {
    text = JSON_RPC_UTF8_DECODER.decode(body);
  } catch (error) {
    throw new Error(`${label}: JSON frame is not valid UTF-8 (${body.length} bytes): ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label}: invalid JSON frame (${body.length} bytes): ${error instanceof Error ? error.message : String(error)}`);
  }
}

class JsonRpcFrameDecoder {
  constructor(options = {}) {
    this.framing = options.framing || "content-length";
    if (this.framing !== "content-length" && this.framing !== "line" && this.framing !== "auto") {
      throw new Error(`unsupported JSON-RPC framing: ${this.framing}`);
    }
    this.activeFraming = this.framing === "auto" ? null : this.framing;
    this.label = options.label || "JSON-RPC";
    this.maxHeaderBytes = options.maxHeaderBytes ?? JSON_RPC_MAX_HEADER_BYTES;
    this.maxFrameBytes = options.maxFrameBytes ?? JSON_RPC_MAX_FRAME_BYTES;
    if (!Number.isSafeInteger(this.maxHeaderBytes) || this.maxHeaderBytes <= 0) {
      throw new Error(`maxHeaderBytes must be a positive safe integer, got ${this.maxHeaderBytes}`);
    }
    if (!Number.isSafeInteger(this.maxFrameBytes) || this.maxFrameBytes <= 0) {
      throw new Error(`maxFrameBytes must be a positive safe integer, got ${this.maxFrameBytes}`);
    }
    this.maxBufferedBytes = this.maxFrameBytes + this.maxHeaderBytes + 4;
    if (!Number.isSafeInteger(this.maxBufferedBytes)) {
      throw new Error("combined JSON-RPC parser bounds exceed Number.MAX_SAFE_INTEGER");
    }
    this.queue = new BufferQueue();
    this.expectedBodyBytes = null;
    this.lineScanCursor = null;
    this.headerScanCursor = null;
    this.autoLineScanCursor = null;
    this.autoNonWhitespaceCursor = null;
  }

  clear() {
    this.queue.clear();
    this.expectedBodyBytes = null;
    this.lineScanCursor = null;
    this.headerScanCursor = null;
    this.autoLineScanCursor = null;
    this.autoNonWhitespaceCursor = null;
    this.activeFraming = this.framing === "auto" ? null : this.framing;
  }

  push(chunk, onMessage) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let offset = 0;
    while (offset < bytes.length) {
      const capacity = this.maxBufferedBytes - this.queue.length;
      if (capacity <= 0) {
        throw new Error(`${this.label}: input buffer exceeded the bounded parser capacity ${this.maxBufferedBytes}`);
      }
      const take = Math.min(capacity, bytes.length - offset);
      this.queue.push(bytes.subarray(offset, offset + take));
      offset += take;
      this.drain(onMessage);
    }
  }

  drain(onMessage) {
    if (typeof onMessage !== "function") throw new Error(`${this.label}: onMessage callback is required`);
    if (this.activeFraming === null) {
      this.selectAutoFraming();
      if (this.activeFraming === null) return;
    }
    if (this.activeFraming === "line") this.drainLines(onMessage);
    else this.drainContentLength(onMessage);
  }

  selectAutoFraming() {
    for (;;) {
      if (this.queue.length === 0) return;

      // Empty JSONL records before the first real frame do not choose the stream protocol.
      // Discard them incrementally so an idle peer cannot fill the whole frame budget with
      // blank lines. Whitespace on the same line as a real frame is retained and therefore
      // cannot turn an invalid indented Content-Length header into a valid one.
      const newlineScan = this.queue.scanByte(0x0a, this.autoLineScanCursor);
      if (newlineScan.index >= 0) {
        const line = this.queue.peek(newlineScan.index);
        const blank = line.every((byte) => byte === 0x09 || byte === 0x0d || byte === 0x20);
        if (blank) {
          this.queue.discard(newlineScan.index + 1);
          this.autoLineScanCursor = null;
          this.autoNonWhitespaceCursor = null;
          continue;
        }
        this.autoLineScanCursor = null;
      } else {
        this.autoLineScanCursor = newlineScan.cursor;
      }

      const first = this.queue.scanFirstNonWhitespace(this.autoNonWhitespaceCursor);
      if (first.index < 0) {
        if (this.queue.length > this.maxFrameBytes) {
          throw new Error(`${this.label}: auto-framing prelude exceeded ${this.maxFrameBytes} bytes without a non-whitespace frame`);
        }
        this.autoNonWhitespaceCursor = first.cursor;
        return;
      }

      // A Content-Length stream must begin at column zero with that header. Every other
      // first non-empty record is permanently JSONL. There is no parse-error fallback or
      // mid-stream protocol switching, so malformed input is exposed instead of reinterpreted.
      this.activeFraming = first.index === 0 && (first.byte === 0x43 || first.byte === 0x63)
        ? "content-length"
        : "line";
      this.autoLineScanCursor = null;
      this.autoNonWhitespaceCursor = null;
      return;
    }
  }

  drainLines(onMessage) {
    for (;;) {
      const scan = this.queue.scanByte(0x0a, this.lineScanCursor);
      if (scan.index < 0) {
        if (this.queue.length > this.maxFrameBytes) {
          throw new Error(`${this.label}: JSONL frame exceeded ${this.maxFrameBytes} bytes without a newline`);
        }
        this.lineScanCursor = scan.cursor;
        return;
      }
      const newline = scan.index;
      if (newline > this.maxFrameBytes) {
        throw new Error(`${this.label}: JSONL frame exceeded ${this.maxFrameBytes} bytes`);
      }
      let body = this.queue.read(newline);
      this.queue.discard(1);
      this.lineScanCursor = null;
      if (body.length > 0 && body[body.length - 1] === 0x0d) body = body.subarray(0, body.length - 1);
      if (body.length > 0 && !body.every((byte) => byte === 0x09 || byte === 0x0a || byte === 0x0d || byte === 0x20)) {
        onMessage(parseJsonFrame(body, this.label), {frameBytes: body.length});
      }
    }
  }

  drainContentLength(onMessage) {
    for (;;) {
      if (this.expectedBodyBytes === null) {
        const scan = this.queue.scanSequence(JSON_RPC_HEADER_DELIMITER, JSON_RPC_HEADER_DELIMITER_PREFIX, this.headerScanCursor);
        if (scan.index < 0) {
          if (this.queue.length > this.maxHeaderBytes + 3) {
            throw new Error(`${this.label}: Content-Length header exceeded ${this.maxHeaderBytes} bytes or lacked CRLF termination`);
          }
          this.headerScanCursor = scan.cursor;
          return;
        }
        const split = scan.index;
        this.headerScanCursor = null;
        if (split > this.maxHeaderBytes) {
          throw new Error(`${this.label}: Content-Length header exceeded ${this.maxHeaderBytes} bytes`);
        }
        const headerBytes = this.queue.read(split);
        this.queue.discard(4);
        if ([...headerBytes].some((byte) => byte > 0x7f)) {
          throw new Error(`${this.label}: JSON-RPC header must contain ASCII bytes only`);
        }
        const lines = headerBytes.toString("ascii").split("\r\n");
        if (lines.length === 0 || lines.some((line) => !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+:[\t\x20-\x7e]*$/.test(line))) {
          throw new Error(`${this.label}: malformed JSON-RPC header line`);
        }
        const contentLengthLines = lines.filter((line) => /^Content-Length:/i.test(line));
        if (contentLengthLines.length !== 1) {
          throw new Error(`${this.label}: expected exactly one Content-Length header, got ${contentLengthLines.length}`);
        }
        const lengthMatch = contentLengthLines[0].match(/^Content-Length:[\t ]*([0-9]+)[\t ]*$/i);
        if (!lengthMatch) throw new Error(`${this.label}: invalid Content-Length header value`);
        const rawLength = lengthMatch[1];
        const length = Number(rawLength);
        if (!Number.isSafeInteger(length) || length <= 0 || length > this.maxFrameBytes) {
          throw new Error(`${this.label}: invalid Content-Length ${rawLength}; expected 1..${this.maxFrameBytes}`);
        }
        this.expectedBodyBytes = length;
      }
      if (this.queue.length < this.expectedBodyBytes) return;
      const body = this.queue.read(this.expectedBodyBytes);
      this.expectedBodyBytes = null;
      onMessage(parseJsonFrame(body, this.label), {frameBytes: body.length});
    }
  }
}

export {
  JSON_RPC_MAX_HEADER_BYTES,
  JSON_RPC_MAX_FRAME_BYTES,
  JsonRpcFrameDecoder,
};
