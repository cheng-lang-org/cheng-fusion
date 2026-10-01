function read(): number {
  return 21;
}

export function main(): number {
  if (Number.isFinite(read())) {
    return 1;
  }
  return 0;
}
