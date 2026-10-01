function score(seed: number): number {
  const raw: [number, number, number] = [seed, 4, 8];
  const copy = Array.from(raw);
  const second = Array.from(copy);
  const frozen = Object.freeze(second);
  return copy[0] + frozen[1] + frozen.length;
}

export function main(): number {
  return score(13);
}
