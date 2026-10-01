function score(seed: number): number {
  const left = [seed, 4];
  const right = [7, seed + 1];
  const joined = left.concat(right, [9]);
  return joined[0] + joined[1] + joined[2] + joined[3] + joined[4];
}

export function main(): number {
  return score(3);
}
