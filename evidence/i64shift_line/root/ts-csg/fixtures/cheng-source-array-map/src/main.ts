function bump(value: number): number {
  return value + 1;
}

function score(seed: number): number {
  const values: [number, number, number] = [seed, 4, 8];
  const mapped = values.map(bump);
  return mapped[0] + mapped[1] + mapped[2];
}

export function main(): number {
  return score(3);
}
