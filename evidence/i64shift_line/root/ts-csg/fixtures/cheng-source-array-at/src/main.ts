function score(seed: number): number {
  const values: [number, number, number] = [seed, 4, 8];
  const first = values.at(0);
  const last = values.at(-1);
  return first + last;
}

export function main(): number {
  return score(3);
}
