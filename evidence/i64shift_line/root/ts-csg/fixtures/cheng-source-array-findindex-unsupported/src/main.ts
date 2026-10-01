export function main(): number {
  const values: [number, number, number] = [1, 2, 3];
  return values.findIndex((value) => value > 1);
}
