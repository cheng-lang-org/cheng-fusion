function score(seed: number): number {
  const values = [seed, 4, 9];
  const reversed = values.reverse();
  return reversed[0] + reversed[1] + reversed[2] + values[0];
}

export function main(): number {
  return score(3);
}
