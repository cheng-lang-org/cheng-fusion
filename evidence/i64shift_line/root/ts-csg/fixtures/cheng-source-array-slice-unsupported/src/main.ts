export function main(seed: number): number {
  const values: [number, number, number] = [1, 2, 3];
  const sliced = values.slice(seed);
  return sliced[0];
}
