function score(seed: number): number {
  const values = [seed, 4];
  const joined = values.concat(seed);
  return joined.length;
}

export function main(): number {
  return score(3);
}
