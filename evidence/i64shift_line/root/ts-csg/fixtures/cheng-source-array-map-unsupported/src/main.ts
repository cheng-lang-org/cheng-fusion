export function main(): number {
  const values: [number, number, number] = [1, 2, 3];
  const mapped = values.map((value) => value + 1);
  return mapped[0];
}
