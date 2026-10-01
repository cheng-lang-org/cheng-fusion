function score(seed: number): number {
  const values = [seed, 4, 8];
  const filled = values.fill(seed + 1);
  return filled[0] + filled[1] + filled[2] + values[0];
}

export function main(): number {
  return score(3);
}
