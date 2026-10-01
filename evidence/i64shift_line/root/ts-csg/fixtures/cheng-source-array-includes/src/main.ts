function score(seed: number): number {
  const values: [number, number, number] = [3, seed, 9];
  const exact = values.includes(seed);
  if (exact) {
    return values[1] + 2;
  }
  return 0;
}

export function main(): number {
  return score(7);
}
