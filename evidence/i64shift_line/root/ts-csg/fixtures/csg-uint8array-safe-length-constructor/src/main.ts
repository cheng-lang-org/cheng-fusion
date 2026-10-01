function fromStringLength(binary: string): number {
  const bytes = new Uint8Array(binary.length);
  return bytes.length;
}

function fromArrayLength(values: number[]): number {
  const bytes = new Uint8Array(values.length);
  return bytes.length;
}

function fromBytesLength(bytes: Uint8Array): number {
  const copy = new Uint8Array(bytes.length);
  return copy.length;
}

function fromBytesByteLength(bytes: Uint8Array): number {
  const copy = new Uint8Array(bytes.byteLength);
  return copy.length;
}

function fromBufferByteLength(buffer: ArrayBuffer): number {
  const copy = new Uint8Array(buffer.byteLength);
  return copy.length;
}

function fromConstAlias(binary: string): number {
  const length = binary.length;
  const bytes = new Uint8Array(length);
  return bytes.length;
}

function unsupportedDynamicLength(size: number): number {
  const bytes = new Uint8Array(size);
  return bytes.length;
}

function unsupportedComputedLength(binary: string): number {
  const bytes = new Uint8Array(binary.length / 2);
  return bytes.length;
}

export function main(): number {
  return fromStringLength("abc") + fromArrayLength([1, 2, 3]);
}
