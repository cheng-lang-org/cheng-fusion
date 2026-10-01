function score(seed: number): number {
  const values = [seed];
  const popped = values.pop();
  return Number(popped);
}

export function main(): number {
  return score(3);
}
