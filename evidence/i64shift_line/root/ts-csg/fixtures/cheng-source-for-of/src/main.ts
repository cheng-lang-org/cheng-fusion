function score(seed: number): number {
  const values: [number, number, number] = [3, seed, 9];
  for (const value of values) {
    if (value === seed) {
      return value + values.length;
    }
  }
  return 0;
}

export function main(): number {
  return score(7);
}
