export function main(): number {
  const values: [number, number, number] = [1, 2, 3];
  if (values.some((value) => value > 1)) {
    return 1;
  }
  return 0;
}
