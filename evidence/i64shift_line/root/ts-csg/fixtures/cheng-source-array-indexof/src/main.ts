function score(seed: number): number {
  const values: [number, number, number] = [seed, 4, seed];
  const first = values.indexOf(seed);
  const last = values.lastIndexOf(seed);
  const middle = values.indexOf(4);
  return first + last + middle;
}

export function main(): number {
  return score(7);
}
