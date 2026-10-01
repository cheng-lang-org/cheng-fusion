function add(acc: number, value: number): number {
  return acc + value;
}

function score(seed: number): number {
  const values: [number, number, number] = [seed, 4, 8];
  return values.reduce(add, 10);
}

export function main(): number {
  return score(3);
}
