function copyBytes(bytes: Uint8Array): number {
  const values = Array.from(bytes);
  return values[0] + values[1] + values.length;
}

function copyNewBytes(): number {
  const values = Array.from(new Uint8Array([1, 2, 255]));
  return values.length;
}

function hexBytes(bytes: Uint8Array): number {
  const values = Array.from(bytes, (item) => item.toString(16).padStart(2, "0"));
  return values.join("").length;
}

function unsupportedMapper(bytes: Uint8Array): number {
  return Array.from(bytes, (item) => item + 1).length;
}

export function main(): number {
  return copyBytes(new Uint8Array([4, 5])) +
    copyNewBytes() +
    hexBytes(new Uint8Array([0, 15, 255])) +
    unsupportedMapper(new Uint8Array([1, 2]));
}
