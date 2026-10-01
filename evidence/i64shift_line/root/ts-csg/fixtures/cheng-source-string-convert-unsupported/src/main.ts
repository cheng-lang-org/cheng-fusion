function score(seed: number): number {
  const text = String({ value: seed });
  return text.length;
}

export function main(): number {
  return score(37);
}
