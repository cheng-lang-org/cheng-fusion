function big(value: number): boolean {
  return value > 5;
}

function overTwenty(value: number): boolean {
  return value > 20;
}

function score(seed: number): number {
  const values: [number, number, number] = [seed, 4, 8];
  const found = values.find(big) ?? 3;
  const missing = values.find(overTwenty) ?? 7;
  return found + missing;
}

export function main(): number {
  return score(3);
}
