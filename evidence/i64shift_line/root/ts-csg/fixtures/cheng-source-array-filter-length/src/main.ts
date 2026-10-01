function aboveThree(value: number): boolean {
  return value > 3;
}

function score(seed: number): number {
  const values: [number, number, number] = [seed, 4, 1];
  const count = values.filter(aboveThree).length;
  return count + 10;
}

export function main(): number {
  return score(5);
}
