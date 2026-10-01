function score(seed: number): number {
  const raw = [seed, 4];
  const values = Object.freeze(raw);
  const next = raw.push(9);
  return next;
}

export function main(): number {
  return score(3);
}
