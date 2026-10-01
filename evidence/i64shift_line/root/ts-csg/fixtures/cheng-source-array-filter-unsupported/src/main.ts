function positive(value: number): boolean {
  return value > 0;
}

function score(seed: number): number {
  const values: [number, number, number] = [seed, 1, 4];
  const filtered = values.filter(positive);
  return filtered[0];
}

export function main(): number {
  return score(3);
}
