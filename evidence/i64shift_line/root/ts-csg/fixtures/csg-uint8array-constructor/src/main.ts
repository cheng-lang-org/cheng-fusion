function fromStaticLength(): number {
  const bytes = new Uint8Array(3);
  return bytes.length;
}

function fromLiteral(): number {
  const bytes = new Uint8Array([0, 15, 255]);
  return bytes.length;
}

function fromBuffer(buffer: ArrayBuffer): number {
  const bytes = new Uint8Array(buffer);
  return bytes.length;
}

function fromBytes(bytes: Uint8Array): number {
  const copy = new Uint8Array(bytes);
  return copy.length;
}

function unsupportedDynamicLength(size: number): number {
  return new Uint8Array(size).length;
}

function unsupportedArrayLike(values: number[]): number {
  return new Uint8Array(values).length;
}

function unsupportedOutOfRange(): number {
  return new Uint8Array([256]).length;
}

export function main(): number {
  return fromStaticLength() + fromLiteral();
}
