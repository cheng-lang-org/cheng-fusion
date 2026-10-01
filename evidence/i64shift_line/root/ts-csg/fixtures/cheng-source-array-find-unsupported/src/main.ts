function big(value: number): boolean {
  return value > 5;
}

function score(seed: number): number {
  const values: [number, number, number] = [seed, 4, 8];
  const found = values.find(big);
  return found ?? 0;
}

export function main(): number {
  return score(3);
}
