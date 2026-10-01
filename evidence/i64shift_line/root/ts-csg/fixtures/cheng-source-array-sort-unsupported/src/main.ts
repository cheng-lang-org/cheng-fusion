function score(seed: number): number {
  const values = [seed + 3, 1, seed];
  const sorted = values.sort((left, right) => left - right);
  return sorted[0] + sorted[1] + sorted[2];
}

export function main(): number {
  return score(3);
}
