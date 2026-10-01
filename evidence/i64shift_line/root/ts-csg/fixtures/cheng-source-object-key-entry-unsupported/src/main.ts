function score(seed: number): number {
  const point = { x: seed, y: 2 };
  const entries = Object.entries(point);
  return entries.length;
}

export function main(): number {
  return score(4);
}
