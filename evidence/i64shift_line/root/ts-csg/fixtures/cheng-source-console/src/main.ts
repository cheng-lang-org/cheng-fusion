function emitFlag(value: number): number {
  console.log(value);
  return value;
}

export function main(): number {
  console.log(42);
  console.error(0);
  console.warn(1);
  return emitFlag(1);
}
